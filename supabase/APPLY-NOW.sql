-- ═══════════════════════════════════════════════════════════════════════════
--  TopMe — apply these 4 migrations once, in the Supabase SQL Editor.
--
--  Dashboard → SQL Editor → New query → paste this whole file → Run.
--  Idempotent: safe to re-run if any part already landed.
--
--  Turns on: failed-fulfilment auto-refund + Refunds console,
--            wallet withdrawals, gift-card redeem + non-withdrawable
--            gift balance, per-network active toggle (Telecel off).
--
--  If the two "alter type ledger_type add value" lines below error with
--  "cannot run inside a transaction block", run just those two lines on
--  their own first, then run the rest of the file.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  1 / 4  —  2026-09-10-network-active-toggle.sql
--  Per-network active toggle for the airtime "Choose network" step.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.networks add column if not exists is_active boolean not null default true;
alter table public.networks add column if not exists logo_url text;

update public.networks set is_active = false where id = 'telecel';

update public.services
  set description = 'Econet & NetOne top-ups'
  where id = 'airtime' and description ilike '%telecel%';


-- ═══════════════════════════════════════════════════════════════════════════
--  2 / 4  —  2026-09-10-fulfilment-auto-refund.sql
--  Auto-refund for failed fulfilment. Wallet failure <= $49 refunds
--  automatically; >= $50 and every guest checkout goes to a staff queue.
--  Refunds always land in the TopMe wallet, never on the payment rail.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.refund_requests (
  id               uuid primary key default gen_random_uuid(),
  transaction_id   uuid not null references public.transactions(id) on delete cascade,
  user_id          uuid references public.profiles(id) on delete set null,
  guest_email      text,
  amount           numeric(12,2) not null,
  reason           text not null,
  origin           text not null default 'auto',
  status           text not null default 'pending',
  auto_eligible    boolean not null default false,
  refund_reference text,
  requested_at     timestamptz not null default now(),
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz not null default now(),
  unique (transaction_id)
);
create index if not exists refund_requests_status_idx on public.refund_requests(status, requested_at desc);

alter table public.refund_requests enable row level security;
drop policy if exists refund_requests_read on public.refund_requests;
create policy refund_requests_read on public.refund_requests
  for select using (public.is_admin(auth.uid()));

create or replace function public.refund_auto_ceiling() returns numeric
  language sql immutable as $$ select 49.00::numeric $$;

create or replace function public._credit_wallet_refund(
  p_tx public.transactions,
  p_refund_id uuid,
  p_actor uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ref   text := public.generate_reference('RCT');
  v_total numeric := p_tx.amount + p_tx.fee;
begin
  if p_tx.user_id is null then
    raise exception 'no_wallet_to_credit';
  end if;

  update public.wallets
    set balance = balance + v_total, updated_at = now()
    where user_id = p_tx.user_id;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
    values (p_tx.user_id, 'refund', v_total, 'system', v_ref, 'success',
      jsonb_build_object('transaction_id', p_tx.id, 'refund_id', p_refund_id,
                         'actor', p_actor, 'auto', p_actor is null));

  update public.transactions
    set status = 'failed', fulfillment_status = 'failed',
        receipt = coalesce(receipt, '{}'::jsonb) || jsonb_build_object(
          'refunded', true, 'refund_reference', v_ref, 'refunded_at', now(),
          'refund_id', p_refund_id, 'refund_auto', p_actor is null)
    where id = p_tx.id;

  update public.refund_requests
    set status = 'paid', refund_reference = v_ref,
        decided_by = p_actor, decided_at = now()
    where id = p_refund_id;

  insert into public.transaction_events (transaction_id, reference, event_type, message, meta)
    values (p_tx.id, p_tx.reference, 'refund',
      format('Refunded $%s to wallet (%s).', to_char(v_total, 'FM999999990.00'),
             case when p_actor is null then 'automatic' else 'staff-approved' end),
      jsonb_build_object('refund_reference', v_ref, 'refund_id', p_refund_id));
end;
$$;

create or replace function public.record_failed_fulfilment_refund(
  p_transaction_id uuid,
  p_reason text,
  p_origin text default 'auto'
) returns public.refund_requests
language plpgsql security definer set search_path = public as $$
declare
  v_tx      public.transactions;
  v_req     public.refund_requests;
  v_total   numeric;
  v_auto    boolean;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if v_tx.id is null then raise exception 'transaction_not_found'; end if;

  select * into v_req from public.refund_requests where transaction_id = p_transaction_id;
  if v_req.id is not null then
    return v_req;
  end if;

  if exists (select 1 from public.wallet_ledger
              where type = 'refund' and meta->>'transaction_id' = p_transaction_id::text) then
    insert into public.refund_requests (transaction_id, user_id, guest_email, amount, reason, origin, status, auto_eligible)
      values (p_transaction_id, v_tx.user_id, v_tx.guest_email, v_tx.amount + v_tx.fee,
              p_reason, p_origin, 'paid', false)
      returning * into v_req;
    return v_req;
  end if;

  v_total := v_tx.amount + v_tx.fee;
  v_auto  := v_tx.user_id is not null and v_total <= public.refund_auto_ceiling();

  insert into public.refund_requests (transaction_id, user_id, guest_email, amount, reason, origin, status, auto_eligible)
    values (p_transaction_id, v_tx.user_id, v_tx.guest_email, v_total, p_reason, p_origin, 'pending', v_auto)
    returning * into v_req;

  if v_auto then
    perform public._credit_wallet_refund(v_tx, v_req.id, null);
    select * into v_req from public.refund_requests where id = v_req.id;
  end if;

  return v_req;
end;
$$;

create or replace function public.decide_refund_request(
  p_refund_id uuid,
  p_approve boolean,
  p_note text default null
) returns public.refund_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req public.refund_requests;
  v_tx  public.transactions;
begin
  if not public.has_permission(auth.uid(), 'transactions.rectify') then
    raise exception 'forbidden';
  end if;

  select * into v_req from public.refund_requests where id = p_refund_id for update;
  if v_req.id is null then raise exception 'refund_not_found'; end if;
  if v_req.status not in ('pending', 'approved') then raise exception 'already_resolved'; end if;

  select * into v_tx from public.transactions where id = v_req.transaction_id;

  if not p_approve then
    update public.refund_requests
      set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note
      where id = p_refund_id returning * into v_req;
  elsif v_tx.user_id is not null then
    perform public._credit_wallet_refund(v_tx, p_refund_id, auth.uid());
    update public.refund_requests set decision_note = p_note where id = p_refund_id;
    select * into v_req from public.refund_requests where id = p_refund_id;
  else
    update public.refund_requests
      set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = p_note
      where id = p_refund_id returning * into v_req;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(),
      case when not p_approve then 'refund.reject'
           when v_tx.user_id is not null then 'refund.pay'
           else 'refund.approve_guest' end,
      'refund_requests', p_refund_id::text,
      jsonb_build_object('amount', v_req.amount, 'note', p_note, 'transaction_id', v_req.transaction_id));

  return v_req;
end;
$$;

create or replace function public.mark_refund_settled(
  p_refund_id uuid,
  p_note text default null
) returns public.refund_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.refund_requests;
begin
  if not public.has_permission(auth.uid(), 'transactions.rectify') then
    raise exception 'forbidden';
  end if;
  select * into v_req from public.refund_requests where id = p_refund_id for update;
  if v_req.id is null then raise exception 'refund_not_found'; end if;
  if v_req.status <> 'approved' then raise exception 'not_approved'; end if;

  update public.refund_requests
    set status = 'paid', decided_by = auth.uid(), decided_at = now(),
        decision_note = coalesce(p_note, decision_note)
    where id = p_refund_id returning * into v_req;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(), 'refund.settle_guest', 'refund_requests', p_refund_id::text,
      jsonb_build_object('amount', v_req.amount, 'note', p_note));
  return v_req;
end;
$$;

revoke all on function public.record_failed_fulfilment_refund(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_failed_fulfilment_refund(uuid, text, text) to service_role;
revoke all on function public._credit_wallet_refund(public.transactions, uuid, uuid) from public, anon, authenticated;
revoke all on function public.decide_refund_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_refund_request(uuid, boolean, text) to authenticated;
revoke all on function public.mark_refund_settled(uuid, text) from public, anon;
grant execute on function public.mark_refund_settled(uuid, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
--  3 / 4  —  2026-09-10-withdrawals.sql
--  Cash out TopMe balance to bank_transfer | zipit | ecocash | innbucks |
--  omari for a 1.3% fee. Staff approval queue. Gift balance ring-fenced.
-- ═══════════════════════════════════════════════════════════════════════════

alter type ledger_type add value if not exists 'withdrawal';
alter type ledger_type add value if not exists 'withdrawal_reversal';

alter table public.wallets add column if not exists gift_locked numeric(12,2) not null default 0;

create table if not exists public.withdrawals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        numeric(12,2) not null,
  fee           numeric(12,2) not null,
  net           numeric(12,2) not null,
  rail          text not null,
  rail_details  jsonb not null default '{}',
  status        text not null default 'requested',
  reference     text not null,
  external_ref  text,
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


-- ═══════════════════════════════════════════════════════════════════════════
--  4 / 4  —  2026-09-11-gift-locked-balance.sql
--  Gift-voucher balance is ring-fenced from cash-out.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.clamp_gift_locked() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.gift_locked is null then new.gift_locked := 0; end if;
  if new.gift_locked < 0 then new.gift_locked := 0; end if;
  if new.gift_locked > new.balance then new.gift_locked := greatest(new.balance, 0); end if;
  return new;
end;
$$;

drop trigger if exists wallets_clamp_gift_locked on public.wallets;
create trigger wallets_clamp_gift_locked
  before insert or update on public.wallets
  for each row execute function public.clamp_gift_locked();

create or replace function public.wallet_gift_redeem(p_code text)
returns public.gift_vouchers
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_voucher public.gift_vouchers;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  select * into v_voucher from public.gift_vouchers where code = p_code for update;
  if v_voucher.id is null then raise exception 'voucher_not_found'; end if;
  if v_voucher.status <> 'active' then raise exception 'voucher_already_redeemed'; end if;

  update public.wallets
    set balance = balance + v_voucher.amount,
        gift_locked = coalesce(gift_locked, 0) + v_voucher.amount,
        updated_at = now()
    where user_id = v_user;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status)
  values (v_user, 'gift_redeem', v_voucher.amount, 'wallet', p_code, 'success');

  update public.gift_vouchers
    set status = 'redeemed', redeemed_at = now(), redeemed_by = v_user
    where code = p_code
    returning * into v_voucher;

  return v_voucher;
end;
$$;

update public.wallets w set gift_locked = least(
  w.balance,
  coalesce((select sum(v.amount) from public.gift_vouchers v
            where v.redeemed_by = w.user_id and v.status = 'redeemed'), 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  Done. Verify: select column_name from information_schema.columns
--                where table_name = 'wallets';   -- should include gift_locked
-- ═══════════════════════════════════════════════════════════════════════════
