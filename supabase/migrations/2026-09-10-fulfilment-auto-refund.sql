-- ═══════════════════════════════════════════════════════════════════════
--  Auto-refund for failed fulfilment
--
--  The gap: wallet_pay debits the wallet and returns success, THEN the
--  provider is called. A provider failure was only logged — the customer's
--  money stayed debited until a human noticed. (Real incident: NetOne $45
--  rejected by VitalPay, $45.10 sat in limbo.)
--
--  Policy (owner-approved):
--   * Refunds always go to the TopMe WALLET, never auto-reversed to
--     Paynow/EcoCash/card — reversing electronic rails automatically is
--     risky. The customer can withdraw wallet balance separately.
--   * A wallet-funded failure of $49 or less is refunded automatically.
--   * $50+ , and every guest checkout (no wallet to credit), goes to a
--     manual approval queue for an admin / super-admin.
--  One refund_request per transaction (unique) — the replay guard.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.refund_requests (
  id               uuid primary key default gen_random_uuid(),
  transaction_id   uuid not null references public.transactions(id) on delete cascade,
  user_id          uuid references public.profiles(id) on delete set null,
  guest_email      text,
  amount           numeric(12,2) not null,            -- full failed charge (service amount + fee)
  reason           text not null,
  origin           text not null default 'auto',      -- auto | staff | reconcile
  status           text not null default 'pending',   -- pending | paid | approved | rejected
  auto_eligible    boolean not null default false,
  refund_reference text,                              -- RCT-… once credited to a wallet
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
-- all writes go through the SECURITY DEFINER functions below

-- Auto-refund ceiling (inclusive). At or below -> automatic; above -> queue.
create or replace function public.refund_auto_ceiling() returns numeric
  language sql immutable as $$ select 49.00::numeric $$;

-- Shared: actually move the money back into a customer's wallet and close
-- out the refund request + transaction. p_actor is null for an automatic
-- refund, the staff uuid for an approved one.
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

-- Called service-side the moment a synchronous fulfilment comes back failed
-- (payService / finalizeGuestCheckout / retryFulfillment / reconcile cron).
-- Idempotent: a second call for the same transaction returns the existing
-- request and moves no money.
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
    return v_req;  -- already handled / queued
  end if;

  -- If somehow already refunded via the legacy admin path, just record it.
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

-- Staff decision on a queued refund. p_approve=false rejects it.
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
    -- Guest: no wallet. Mark approved; staff pays out on a rail and then
    -- calls mark_refund_settled.
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

-- Guest refund only: mark an approved request as settled after paying the
-- customer out of band (EcoCash / bank / cash).
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
