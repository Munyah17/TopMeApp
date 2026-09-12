-- Compliance fact from the owner: TopMe is not an insurer. It's Motions
-- Microinsurance's agent/dealer, selling under Motions' own licence — so
-- every insurance sale's audit trail needs to say "sold by TopMe, money
-- owed to Motions Microinsurance", the same "owner_label" pattern already
-- used for every other service (Econet, DStv, ZESA, ...).
--
-- The bug this exposed: purchaseInsurancePolicy (src/lib/actions/
-- insurance.ts) calls wallet_pay with p_service_id = 'insurance-<uuid>',
-- which never matches any row in `services` (insurance has its own
-- catalog, insurance_products — see 2026-09-08-insurance-services.sql).
-- wallet_pay's `select cost_percentage, provider_label from services
-- where id = p_service_id` therefore silently returns nothing: every
-- insurance transaction has recorded owner_label = null and
-- provider_cost = 0 (100% fake "TopMe revenue"), the exact same class of
-- bookkeeping gap already found and fixed for airtime/ZESA/bills
-- (see the cost_percentage=0 finding, 2026-09-12) — except here a flat
-- % wouldn't even be correct, because the real provider cost (the
-- underwriter's base_premium) is already known precisely from a live
-- quote at purchase time, not a guessed percentage.
--
-- Fix: wallet_pay accepts optional p_owner_label/p_provider_cost. When a
-- caller supplies them explicitly, they're used as-is instead of the
-- `services` lookup — every other existing call site (which doesn't pass
-- them) is completely unaffected and keeps working exactly as before.
drop function if exists public.wallet_pay(text, numeric, text, text, text, text);

create or replace function public.wallet_pay(
  p_service_id    text,
  p_amount        numeric,
  p_recipient     text,
  p_network_id    text default null,
  p_extra_value   text default null,
  p_fulfillment_provider text default 'simulated',
  p_owner_label   text default null,
  p_provider_cost numeric default null
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

  if p_owner_label is not null or p_provider_cost is not null then
    v_owner_label := p_owner_label;
    v_provider_cost := coalesce(p_provider_cost, 0);
  else
    select cost_percentage, provider_label into v_cost_pct, v_owner_label
      from public.services where id = p_service_id;
    v_provider_cost := round(p_amount * coalesce(v_cost_pct, 0) / 100, 2);
  end if;

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
revoke all on function public.wallet_pay(text, numeric, text, text, text, text, text, numeric) from public;
grant execute on function public.wallet_pay(text, numeric, text, text, text, text, text, numeric) to authenticated;
