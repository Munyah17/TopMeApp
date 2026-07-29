-- Guest checkout: allow a payment to be completed and fulfilled without a
-- TopMe account. A guest pays a service amount directly through a gateway
-- (Paynow/Stripe/EcoCash) instead of debiting a wallet; on gateway
-- confirmation, finalize_guest_payment() creates the transactions row.

alter table public.transactions alter column user_id drop not null;
alter table public.transactions add column if not exists guest_email text;
alter table public.transactions add column if not exists guest_phone text;
alter table public.transactions drop constraint if exists transactions_identity_chk;
alter table public.transactions add constraint transactions_identity_chk
  check (user_id is not null or guest_email is not null or guest_phone is not null);

-- Tracks an in-flight guest payment across gateways so the callback/webhook/poll
-- (which only receives a reference) can look up what to finalize and how.
create table if not exists public.guest_checkout_intents (
  id                    uuid primary key default gen_random_uuid(),
  reference             text unique not null,
  service_id            text not null references public.services(id),
  network_id            text references public.networks(id),
  recipient_identifier  text not null,
  extra_value           text,
  amount                numeric(12,2) not null check (amount > 0),
  guest_email           text,
  guest_phone           text,
  provider              text not null check (provider in ('paynow','stripe','ecocash')),
  status                text not null default 'pending' check (status in ('pending','completed','failed')),
  transaction_id        uuid references public.transactions(id),
  meta                  jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  constraint guest_checkout_intents_identity_chk check (guest_email is not null or guest_phone is not null)
);
create index if not exists guest_checkout_intents_reference_idx on public.guest_checkout_intents(reference);

alter table public.guest_checkout_intents enable row level security;

-- Anyone (guest or logged-in) can create an intent when starting checkout.
-- No select/update grants — the webhook/poll routes use the service-role
-- (admin) client, which bypasses RLS; status/receipt reads go exclusively
-- through the reference-gated get_guest_checkout() RPC below.
drop policy if exists guest_checkout_intents_insert_public on public.guest_checkout_intents;
create policy guest_checkout_intents_insert_public on public.guest_checkout_intents
  for insert to anon, authenticated with check (true);

-- Finalize a guest payment: called server-side (service role) only, once a
-- gateway has confirmed money actually moved. Mirrors wallet_pay's
-- transaction-row shape but with no wallet debit and no auth.uid() involved.
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
    v_intent.amount, 0, 'success', v_reference, p_fulfillment_provider, 'pending',
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

-- Mark a guest intent failed/cancelled — called server-side only.
create or replace function public.fail_guest_checkout(p_reference text)
returns void
language sql security definer set search_path = public as $$
  update public.guest_checkout_intents set status = 'failed'
    where reference = p_reference and status = 'pending';
$$;
revoke all on function public.fail_guest_checkout(text) from public;
grant execute on function public.fail_guest_checkout(text) to service_role;

-- Safe, reference-gated status/receipt lookup for the guest's own browser to
-- poll — the random reference token is the only "credential" a guest has, so
-- this must never accept anything broader (e.g. listing by email/phone).
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
