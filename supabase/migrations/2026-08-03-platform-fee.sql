-- Platform processing fee: absorbed by the customer, added on top of the
-- service amount. $0.50 flat + 1.5% of the amount by default; Airtime Direct
-- Recharge gets a flat $0.10 instead (small, high-frequency purchases would
-- be disproportionately hit by the standard formula). See src/lib/fees.ts
-- for the shared formula used to *display* this before payment — wallet_pay
-- recomputes it here, server-side, so a client can never understate/bypass
-- it by calling the RPC directly with a crafted amount.

create or replace function public.calculate_platform_fee(p_service_id text, p_amount numeric)
returns numeric language sql immutable as $$
  select case
    when p_amount <= 0 then 0
    when p_service_id = 'airtime' then 0.10
    else round(0.50 + p_amount * 0.015, 2)
  end;
$$;

-- revenue must count the fee as pure profit (no provider cost is ever
-- associated with it) — recreate the generated column with the new formula.
-- Existing rows recompute automatically (their fee is 0, so history is
-- unaffected).
alter table public.transactions drop column if exists revenue;
alter table public.transactions add column revenue numeric(12,2) generated always as (amount - provider_cost + fee) stored;

-- guest_checkout_intents: remember the fee charged at checkout time so
-- finalize_guest_payment doesn't need to recompute it, and it always
-- matches exactly what the gateway actually collected.
alter table public.guest_checkout_intents add column if not exists fee numeric(12,2) not null default 0;

-- wallet_pay: now debits amount + fee, with the fee computed server-side
-- from the service id — never trusts a client-supplied fee.
create or replace function public.wallet_pay(
  p_service_id  text,
  p_amount      numeric,
  p_recipient   text,
  p_network_id  text default null,
  p_extra_value text default null,
  p_fulfillment_provider text default 'simulated'
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_balance  numeric;
  v_tx       public.transactions;
  v_reference text;
  v_cost_pct  numeric;
  v_owner_label text;
  v_provider_cost numeric;
  v_fee numeric;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  v_fee := public.calculate_platform_fee(p_service_id, p_amount);

  select balance into v_balance from public.wallets where user_id = v_user for update;
  if v_balance is null then
    raise exception 'wallet_not_found';
  end if;
  if v_balance < p_amount + v_fee then
    raise exception 'insufficient_funds';
  end if;

  select cost_percentage, provider_label into v_cost_pct, v_owner_label
    from public.services where id = p_service_id;
  v_provider_cost := round(p_amount * coalesce(v_cost_pct, 0) / 100, 2);

  v_reference := public.generate_reference('TPM');

  update public.wallets set balance = balance - (p_amount + v_fee), updated_at = now() where user_id = v_user;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status)
  values (v_user, 'debit', -(p_amount + v_fee), 'wallet', v_reference, 'success');

  insert into public.transactions (
    user_id, service_id, network_id, recipient_identifier, extra_value,
    amount, fee, status, reference, fulfillment_provider, fulfillment_status,
    provider_cost, owner_label
  ) values (
    v_user, p_service_id, p_network_id, p_recipient, p_extra_value,
    p_amount, v_fee, 'success', v_reference, p_fulfillment_provider, 'pending',
    v_provider_cost, v_owner_label
  ) returning * into v_tx;

  return v_tx;
end;
$$;
revoke all on function public.wallet_pay(text, numeric, text, text, text, text) from public;
grant execute on function public.wallet_pay(text, numeric, text, text, text, text) to authenticated;

-- finalize_guest_payment: carry the fee already charged (stored on the
-- intent at checkout time, see guest-payments.ts) onto the resulting
-- transaction, instead of the previous hardcoded 0.
create or replace function public.finalize_guest_payment(
  p_reference text,
  p_fulfillment_provider text default 'simulated'
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_intent        public.guest_checkout_intents;
  v_tx            public.transactions;
  v_reference     text;
  v_cost_pct      numeric;
  v_owner_label   text;
  v_provider_cost numeric;
begin
  select * into v_intent
    from public.guest_checkout_intents
    where reference = p_reference and status = 'pending'
    for update;

  if v_intent is null then
    raise exception 'not_found_or_processed';
  end if;

  select cost_percentage, provider_label into v_cost_pct, v_owner_label
    from public.services where id = v_intent.service_id;
  v_provider_cost := round(v_intent.amount * coalesce(v_cost_pct, 0) / 100, 2);

  v_reference := public.generate_reference('TPM');

  insert into public.transactions (
    user_id, guest_email, guest_phone, service_id, network_id, recipient_identifier, extra_value,
    amount, fee, status, reference, fulfillment_provider, fulfillment_status,
    provider_cost, owner_label
  ) values (
    null, v_intent.guest_email, v_intent.guest_phone, v_intent.service_id, v_intent.network_id,
    v_intent.recipient_identifier, v_intent.extra_value,
    v_intent.amount, v_intent.fee, 'success', v_reference, p_fulfillment_provider, 'pending',
    v_provider_cost, v_owner_label
  ) returning * into v_tx;

  update public.guest_checkout_intents
    set status = 'completed', transaction_id = v_tx.id
    where reference = p_reference;

  return v_tx;
end;
$$;
revoke all on function public.finalize_guest_payment(text, text) from public;
grant execute on function public.finalize_guest_payment(text, text) to service_role;

-- get_guest_checkout: surface the fee in the reference-gated status lookup
-- the guest's own browser polls, so the confirm page can show a true total.
create or replace function public.get_guest_checkout(p_reference text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_intent      public.guest_checkout_intents;
  v_tx          public.transactions;
  v_service_name text;
begin
  select * into v_intent from public.guest_checkout_intents where reference = p_reference;
  if v_intent is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_intent.status = 'completed' and v_intent.transaction_id is not null then
    select * into v_tx from public.transactions where id = v_intent.transaction_id;
    select name into v_service_name from public.services where id = v_tx.service_id;
    return jsonb_build_object(
      'status', 'completed',
      'transaction', jsonb_build_object(
        'reference', v_tx.reference,
        'amount', v_tx.amount,
        'fee', v_tx.fee,
        'service_name', v_service_name,
        'recipient', v_tx.recipient_identifier,
        'fulfillment_status', v_tx.fulfillment_status,
        'created_at', v_tx.created_at
      )
    );
  end if;

  return jsonb_build_object('status', v_intent.status);
end;
$$;
revoke all on function public.get_guest_checkout(text) from public;
grant execute on function public.get_guest_checkout(text) to anon, authenticated;

-- Vestigial fields from the pre-VitalPay era: a fake "validate and reveal
-- the account holder's name" step that no real provider ever supported.
-- Already removed from every payment flow's UI/logic — dropping the
-- columns themselves now that nothing reads them.
alter table public.services drop column if exists mock_name;
alter table public.services drop column if exists mock_sub;
alter table public.services drop column if exists validate_msg;
