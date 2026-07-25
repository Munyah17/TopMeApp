-- Adds per-service active/inactive toggle and revenue-split bookkeeping.
-- Safe to re-run. Applied to the live project via Management API on 2026-07-25;
-- kept here so schema.sql's inline definitions and the live DB stay in sync
-- and so a fresh install (schema.sql from scratch) doesn't need this file.

alter table public.services
  add column if not exists is_active boolean not null default true,
  add column if not exists cost_percentage numeric(5,2) not null default 0
    check (cost_percentage >= 0 and cost_percentage <= 100);

alter table public.transactions
  add column if not exists provider_cost numeric(12,2) not null default 0,
  add column if not exists owner_label text;

alter table public.transactions
  drop column if exists revenue;
alter table public.transactions
  add column revenue numeric(12,2) generated always as (amount - provider_cost) stored;

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
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select balance into v_balance from public.wallets where user_id = v_user for update;
  if v_balance is null then
    raise exception 'wallet_not_found';
  end if;
  if v_balance < p_amount then
    raise exception 'insufficient_funds';
  end if;

  select cost_percentage, provider_label into v_cost_pct, v_owner_label
    from public.services where id = p_service_id;
  v_provider_cost := round(p_amount * coalesce(v_cost_pct, 0) / 100, 2);

  v_reference := public.generate_reference('TPM');

  update public.wallets set balance = balance - p_amount, updated_at = now() where user_id = v_user;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status)
  values (v_user, 'debit', -p_amount, 'wallet', v_reference, 'success');

  insert into public.transactions (
    user_id, service_id, network_id, recipient_identifier, extra_value,
    amount, fee, status, reference, fulfillment_provider, fulfillment_status,
    provider_cost, owner_label
  ) values (
    v_user, p_service_id, p_network_id, p_recipient, p_extra_value,
    p_amount, 0, 'success', v_reference, p_fulfillment_provider, 'pending',
    v_provider_cost, v_owner_label
  ) returning * into v_tx;

  return v_tx;
end;
$$;
revoke all on function public.wallet_pay(text, numeric, text, text, text, text) from public;
grant execute on function public.wallet_pay(text, numeric, text, text, text, text) to authenticated;

-- Customer-facing catalog reads should only see active services; keep
-- superadmin write access unchanged (existing services_select/services_write
-- policies already handle that split).
