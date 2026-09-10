-- ═══════════════════════════════════════════════════════════════════════
--  Wallet withdrawals — cash out TopMe balance to a local rail.
--
--  Rails: bank_transfer | zipit | ecocash | innbucks | omari
--  Fee:   1.3% of the requested amount, kept by TopMe. The customer
--         receives (amount - fee); their wallet is debited `amount`.
--
--  Flow: request_withdrawal debits the wallet immediately (holds the
--  money) and creates a 'requested' row. Staff approve -> 'approved',
--  pay the customer on the rail, then mark_withdrawal_paid -> 'paid'.
--  Reject or customer-cancel returns the full amount to the wallet.
--
--  Gift/voucher balance is NOT withdrawable: withdrawable =
--  wallets.balance - wallets.gift_locked. gift_locked stays 0 until the
--  gift-card work increments it on redemption.
-- ═══════════════════════════════════════════════════════════════════════

alter type ledger_type add value if not exists 'withdrawal';
alter type ledger_type add value if not exists 'withdrawal_reversal';

alter table public.wallets add column if not exists gift_locked numeric(12,2) not null default 0;

create table if not exists public.withdrawals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        numeric(12,2) not null,            -- debited from the wallet
  fee           numeric(12,2) not null,            -- 1.3%, kept by TopMe
  net           numeric(12,2) not null,            -- amount - fee, paid to the customer
  rail          text not null,                     -- bank_transfer | zipit | ecocash | innbucks | omari
  rail_details  jsonb not null default '{}',       -- { account_name, account_number / phone, bank_name, ... }
  status        text not null default 'requested', -- requested | approved | paid | rejected | cancelled
  reference     text not null,
  external_ref  text,                              -- rail transaction id, filled on payout
  requested_at  timestamptz not null default now(),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists withdrawals_user_idx on public.withdrawals(user_id, requested_at desc);
create index if not exists withdrawals_status_idx on public.withdrawals(status, requested_at desc);

alter table public.withdrawals enable row level security;
drop policy if exists withdrawals_own_read on public.withdrawals;
create policy withdrawals_own_read on public.withdrawals
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
-- writes via the SECURITY DEFINER functions only

create or replace function public.withdrawal_fee_rate() returns numeric
  language sql immutable as $$ select 0.013::numeric $$;
create or replace function public.withdrawal_min_amount() returns numeric
  language sql immutable as $$ select 5.00::numeric $$;

create or replace function public.request_withdrawal(
  p_amount numeric,
  p_rail text,
  p_rail_details jsonb
) returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare
  v_user      uuid := auth.uid();
  v_balance   numeric;
  v_locked    numeric;
  v_fee       numeric;
  v_ref       text := public.generate_reference('WDR');
  v_row       public.withdrawals;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_rail not in ('bank_transfer','zipit','ecocash','innbucks','omari') then
    raise exception 'invalid_rail';
  end if;
  if p_amount is null or p_amount < public.withdrawal_min_amount() then
    raise exception 'below_minimum';
  end if;
  if coalesce(p_rail_details, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'missing_rail_details';
  end if;

  select balance, gift_locked into v_balance, v_locked
    from public.wallets where user_id = v_user for update;
  if v_balance is null then raise exception 'wallet_not_found'; end if;
  if (v_balance - coalesce(v_locked, 0)) < p_amount then
    raise exception 'insufficient_withdrawable_balance';
  end if;

  v_fee := round(p_amount * public.withdrawal_fee_rate(), 2);

  update public.wallets set balance = balance - p_amount, updated_at = now() where user_id = v_user;
  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
    values (v_user, 'withdrawal', -p_amount, p_rail, v_ref, 'success',
      jsonb_build_object('fee', v_fee, 'net', p_amount - v_fee, 'rail', p_rail));

  insert into public.withdrawals (user_id, amount, fee, net, rail, rail_details, reference)
    values (v_user, p_amount, v_fee, p_amount - v_fee, p_rail, coalesce(p_rail_details, '{}'::jsonb), v_ref)
    returning * into v_row;
  return v_row;
end;
$$;

-- Return the held amount to the wallet (rejection or customer cancellation).
create or replace function public._reverse_withdrawal(p_id uuid, p_actor uuid, p_status text, p_note text)
returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  select * into v_w from public.withdrawals where id = p_id for update;
  if v_w.id is null then raise exception 'withdrawal_not_found'; end if;
  if v_w.status not in ('requested','approved') then raise exception 'not_reversible'; end if;

  update public.wallets set balance = balance + v_w.amount, updated_at = now() where user_id = v_w.user_id;
  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
    values (v_w.user_id, 'withdrawal_reversal', v_w.amount, v_w.rail,
            public.generate_reference('WDR'), 'success',
            jsonb_build_object('withdrawal_id', p_id, 'actor', p_actor, 'reason', p_status));

  update public.withdrawals
    set status = p_status, decided_by = p_actor, decided_at = now(),
        note = coalesce(p_note, note)
    where id = p_id returning * into v_w;
  return v_w;
end;
$$;

create or replace function public.cancel_withdrawal(p_id uuid) returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  select * into v_w from public.withdrawals where id = p_id;
  if v_w.id is null then raise exception 'withdrawal_not_found'; end if;
  if v_w.user_id <> auth.uid() then raise exception 'forbidden'; end if;
  if v_w.status <> 'requested' then raise exception 'too_late_to_cancel'; end if;
  return public._reverse_withdrawal(p_id, auth.uid(), 'cancelled', 'Cancelled by customer');
end;
$$;

create or replace function public.decide_withdrawal(p_id uuid, p_approve boolean, p_note text default null)
returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  if not public.has_permission(auth.uid(), 'wallet.adjust') then raise exception 'forbidden'; end if;
  select * into v_w from public.withdrawals where id = p_id for update;
  if v_w.id is null then raise exception 'withdrawal_not_found'; end if;
  if v_w.status <> 'requested' then raise exception 'already_decided'; end if;

  if not p_approve then
    return public._reverse_withdrawal(p_id, auth.uid(), 'rejected', p_note);
  end if;

  update public.withdrawals
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), note = p_note
    where id = p_id returning * into v_w;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(), 'withdrawal.approve', 'withdrawals', p_id::text,
      jsonb_build_object('amount', v_w.amount, 'rail', v_w.rail));
  return v_w;
end;
$$;

create or replace function public.mark_withdrawal_paid(p_id uuid, p_external_ref text, p_note text default null)
returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  if not public.has_permission(auth.uid(), 'wallet.adjust') then raise exception 'forbidden'; end if;
  select * into v_w from public.withdrawals where id = p_id for update;
  if v_w.id is null then raise exception 'withdrawal_not_found'; end if;
  if v_w.status <> 'approved' then raise exception 'not_approved'; end if;

  update public.withdrawals
    set status = 'paid', external_ref = p_external_ref,
        note = coalesce(p_note, note), decided_by = auth.uid(), decided_at = now()
    where id = p_id returning * into v_w;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(), 'withdrawal.paid', 'withdrawals', p_id::text,
      jsonb_build_object('amount', v_w.amount, 'net', v_w.net, 'rail', v_w.rail, 'external_ref', p_external_ref));
  return v_w;
end;
$$;

revoke all on function public.request_withdrawal(numeric, text, jsonb) from public, anon;
grant execute on function public.request_withdrawal(numeric, text, jsonb) to authenticated;
revoke all on function public.cancel_withdrawal(uuid) from public, anon;
grant execute on function public.cancel_withdrawal(uuid) to authenticated;
revoke all on function public._reverse_withdrawal(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.decide_withdrawal(uuid, boolean, text) from public, anon;
grant execute on function public.decide_withdrawal(uuid, boolean, text) to authenticated;
revoke all on function public.mark_withdrawal_paid(uuid, text, text) from public, anon;
grant execute on function public.mark_withdrawal_paid(uuid, text, text) to authenticated;
