-- Insurance gateway checkout (Paynow/Stripe/EcoCash) + two latent bugs
-- this work exposed:
--
-- 1. transactions.service_id still had an FK to services(id). Insurance
--    products live in insurance_products, not services (deliberately
--    removed 2026-09-08), so wallet_pay's insert with
--    service_id='insurance-<uuid>' violated the FK — every insurance
--    wallet purchase failed at the charge step. service_id is now a
--    polymorphic key (services id OR 'insurance-<productId>'), so the
--    FK is dropped. services lookups elsewhere already tolerate misses.
--
-- 2. wallet_pay always tacked calculate_platform_fee (2%) on top of
--    p_amount — but the insurance form shows "Charged today" as
--    base+markup only, so the wallet silently debited 2% MORE than the
--    customer agreed to. wallet_pay gains p_fee: when supplied it is
--    used verbatim instead of the computed platform fee. Insurance
--    passes the markup as the fee and the base premium as the amount,
--    so the debit is exactly base+markup = the displayed total.
--
-- 3. guest_checkout_intents.service_id has the same services FK and its
--    finalize RPC reads cost_percentage/provider_label from services —
--    unusable for insurance. A parallel insurance_checkout_intents table
--    stores the whole application payload; finalize_insurance_checkout
--    does the atomic intent→transaction step, then the Tariqify policy
--    flow runs in app code (same as the wallet path).

alter table public.transactions drop constraint if exists transactions_service_id_fkey;

-- ── wallet_pay: explicit fee override ────────────────────────────────
drop function if exists public.wallet_pay(text, numeric, text, text, text, text, text, numeric);

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

  -- Explicit fee wins; otherwise the standard 2% platform fee.
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
revoke all on function public.wallet_pay(text, numeric, text, text, text, text, text, numeric, numeric) from public;
grant execute on function public.wallet_pay(text, numeric, text, text, text, text, text, numeric, numeric) to authenticated;

-- ── Insurance checkout intents ───────────────────────────────────────
-- Mirrors guest_checkout_intents but keyed to the insurance catalog and
-- carrying the full application payload (selections + dependants +
-- applicant details) so the Tariqify policy flow can run after the
-- gateway confirms — the webhook only ever sees a reference.
create table if not exists public.insurance_checkout_intents (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique not null,
  user_id        uuid not null references public.profiles(id),
  -- Full application: {selections:[{productId,dependants[]}],
  --   nationalId,fullName,phone,email,dateOfBirth,address,occupation,
  --   fieldValues, lines:[{productId,basePremium,markupAmount,totalPremium,headCount}]}
  application    jsonb not null,
  amount         numeric(12,2) not null check (amount > 0),  -- base premiums total (owed to underwriter)
  fee            numeric(12,2) not null default 0,           -- markup + gateway surcharge
  provider       text not null check (provider in ('paynow','stripe','ecocash')),
  status         text not null default 'pending' check (status in ('pending','completed','failed')),
  transaction_id uuid references public.transactions(id),
  meta           jsonb not null default '{}',
  created_at     timestamptz not null default now()
);
create index if not exists insurance_checkout_intents_reference_idx on public.insurance_checkout_intents(reference);

alter table public.insurance_checkout_intents enable row level security;
-- No client policies at all: inserts/updates happen via the service-role
-- admin client inside server actions; status reads go through the
-- reference-gated RPC below (same trust model as guest checkout).

-- Atomic finalize: pending intent → transaction row + completed intent.
-- The Tariqify policy creation runs afterwards in app code — it can be
-- retried/reconciled, the money capture cannot be allowed to half-happen.
create or replace function public.finalize_insurance_checkout(p_reference text)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_intent    public.insurance_checkout_intents;
  v_tx        public.transactions;
  v_reference text;
begin
  select * into v_intent
    from public.insurance_checkout_intents
    where reference = p_reference and status = 'pending'
    for update;

  if v_intent is null then
    raise exception 'not_found_or_processed';
  end if;

  v_reference := public.generate_reference('TPM');

  insert into public.transactions (
    user_id, service_id, recipient_identifier, extra_value,
    amount, fee, status, reference, fulfillment_provider, fulfillment_status,
    provider_cost, owner_label
  ) values (
    v_intent.user_id, 'insurance', v_intent.application->>'nationalId', v_intent.reference,
    v_intent.amount, v_intent.fee, 'success', v_reference, 'insurance', 'pending',
    v_intent.amount, 'Motions Microinsurance'
  ) returning * into v_tx;

  update public.insurance_checkout_intents
    set status = 'completed', transaction_id = v_tx.id
    where reference = p_reference;

  return v_tx;
end;
$$;
revoke all on function public.finalize_insurance_checkout(text) from public;
grant execute on function public.finalize_insurance_checkout(text) to service_role;

create or replace function public.fail_insurance_checkout(p_reference text)
returns void
language sql security definer set search_path = public as $$
  update public.insurance_checkout_intents set status = 'failed'
    where reference = p_reference and status = 'pending';
$$;
revoke all on function public.fail_insurance_checkout(text) from public;
grant execute on function public.fail_insurance_checkout(text) to service_role;

-- Reference-gated status/receipt lookup for the payer's own browser —
-- same shape as get_guest_checkout so the confirm page can poll either.
create or replace function public.get_insurance_checkout(p_reference text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_intent public.insurance_checkout_intents;
  v_tx     public.transactions;
begin
  select * into v_intent from public.insurance_checkout_intents where reference = p_reference;
  if v_intent is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_intent.status = 'completed' and v_intent.transaction_id is not null then
    select * into v_tx from public.transactions where id = v_intent.transaction_id;
    return jsonb_build_object(
      'status', 'completed',
      'transaction', jsonb_build_object(
        'reference', v_tx.reference,
        'amount', v_tx.amount,
        'fee', v_tx.fee,
        'service_name', 'Insurance Cover',
        'recipient', v_tx.recipient_identifier,
        'fulfillment_status', v_tx.fulfillment_status,
        'created_at', v_tx.created_at
      )
    );
  end if;

  return jsonb_build_object('status', v_intent.status);
end;
$$;
revoke all on function public.get_insurance_checkout(text) from public;
grant execute on function public.get_insurance_checkout(text) to anon, authenticated;
