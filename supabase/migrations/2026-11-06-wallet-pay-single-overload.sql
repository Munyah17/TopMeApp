-- Unblock wallet product purchases (airtime etc.).
--
-- Production had TWO public.wallet_pay functions:
--   6-arg  (legacy, from schema.sql / 2026-08-03-platform-fee.sql)
--   9-arg  (current, p_owner_label / p_provider_cost / p_fee)
-- PostgREST cannot dispatch a 6-name call when both exist (PGRST203
-- "Could not choose the best candidate function"). CREATE OR REPLACE
-- with a different argument list adds an overload; it does not replace.
--
-- Also creates debug_errors (2026-10-22 never landed in production, so
-- wallet_pay failures were only in Vercel logs).

-- ── 1. One wallet_pay ────────────────────────────────────────────────
drop function if exists public.wallet_pay(text, numeric, text, text, text, text);
drop function if exists public.wallet_pay(text, numeric, text, text, text, text, text, numeric);

create or replace function public.calculate_platform_fee(p_service_id text, p_amount numeric)
returns numeric language sql immutable as $$
  select case
    when p_amount <= 0 then 0
    else round(p_amount * 0.02, 2)
  end;
$$;

create or replace function public.wallet_pay(
  p_service_id    text,
  p_amount        numeric,
  p_recipient     text,
  p_network_id    text default null,
  p_extra_value   text default null,
  p_fulfillment_provider text default 'simulated',
  p_owner_label   text default null,
  p_provider_cost numeric default null,
  p_fee           numeric default null
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

  v_fee := coalesce(p_fee, public.calculate_platform_fee(p_service_id, p_amount));

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

revoke all on function public.wallet_pay(text, numeric, text, text, text, text, text, numeric, numeric) from public, anon;
grant execute on function public.wallet_pay(text, numeric, text, text, text, text, text, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';

-- ── 2. debug_errors (idempotent; 2026-10-22 never applied in prod) ───
create table if not exists public.debug_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  error_message text not null,
  error_stack text,
  error_type text,
  service_id text,
  user_id uuid,
  request_path text,
  request_method text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists debug_errors_created_at_idx on public.debug_errors(created_at desc);
create index if not exists debug_errors_user_id_idx on public.debug_errors(user_id);
create index if not exists debug_errors_service_id_idx on public.debug_errors(service_id);

alter table public.debug_errors enable row level security;

drop policy if exists "Service role can insert debug errors" on public.debug_errors;
create policy "Service role can insert debug errors" on public.debug_errors
  for insert to service_role
  with check (true);

drop policy if exists "Admins can read debug errors" on public.debug_errors;
create policy "Admins can read debug errors" on public.debug_errors
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  );

drop policy if exists "No one can delete debug errors" on public.debug_errors;
create policy "No one can delete debug errors" on public.debug_errors
  for delete to authenticated
  using (false);
