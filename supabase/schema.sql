-- ═══════════════════════════════════════════════════════
--  TopMe — Complete Database Schema
--  Run this entire file in the Supabase SQL Editor (once)
-- ═══════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('customer', 'admin', 'superadmin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tx_status as enum ('pending', 'success', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type amount_mode as enum ('chips', 'bundles', 'packages', 'outstanding');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ledger_type as enum ('topup', 'debit', 'refund', 'gift_send', 'gift_redeem');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fulfillment_status as enum ('simulated', 'pending', 'fulfilled', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type team_status as enum ('invited', 'active', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type voucher_status as enum ('active', 'redeemed', 'expired');
exception when duplicate_object then null; end $$;

-- ── Profiles & wallets ──────────────────────────────────
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  full_name              text,
  phone                  text,
  email                  text,
  role                   user_role not null default 'customer',
  notifications_enabled  boolean not null default true,
  created_at             timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  balance     numeric(12,2) not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        ledger_type not null,
  amount      numeric(12,2) not null,
  provider    text,
  reference   text,
  status      tx_status not null default 'success',
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists wallet_ledger_user_idx on public.wallet_ledger(user_id, created_at desc);

-- ── Catalog ─────────────────────────────────────────────
create table if not exists public.networks (
  id     text primary key,
  name   text not null,
  color  text not null
);

create table if not exists public.service_categories (
  id           text primary key,
  name         text not null,
  icon         text not null,
  color        text not null,
  bg           text not null,
  description  text,
  sort_order   integer not null default 0
);

create table if not exists public.services (
  id                       text primary key,
  category_id              text not null references public.service_categories(id) on delete cascade,
  name                     text not null,
  description              text,
  icon                     text not null,
  provider_label           text,
  logo_url                 text,
  color                    text not null default '#00C853',
  amount_mode              amount_mode not null,
  chips                    numeric(12,2)[],
  outstanding              numeric(12,2),
  needs_network            boolean not null default false,
  shows_token              boolean not null default false,
  id_label                 text not null,
  id_placeholder           text,
  extra_field_label        text,
  extra_field_placeholder  text,
  is_gift                  boolean not null default false,
  validate_msg             text,
  mock_name                text,
  mock_sub                 text,
  sort_order               integer not null default 0,
  is_active                boolean not null default true,
  -- What the fulfilling provider charges us, as a % of what the customer
  -- pays (e.g. 95.00 = provider keeps $0.95 of every $1, TopMe keeps $0.05).
  -- Owner-configurable per service from /admin/products — defaults to 0
  -- (100% recorded as TopMe revenue) rather than a guessed figure.
  cost_percentage          numeric(5,2) not null default 0 check (cost_percentage >= 0 and cost_percentage <= 100)
);
create index if not exists services_category_idx on public.services(category_id);

create table if not exists public.data_bundles (
  id          text primary key,
  service_id  text not null references public.services(id) on delete cascade default 'data',
  label       text not null,
  size        text not null,
  price       numeric(12,2) not null,
  sub         text,
  sort_order  integer not null default 0
);

create table if not exists public.tv_packages (
  id          text primary key,
  service_id  text not null references public.services(id) on delete cascade default 'dstv',
  name        text not null,
  price       numeric(12,2) not null,
  sort_order  integer not null default 0
);

-- ── Transactions & favourites ───────────────────────────
create table if not exists public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  service_id            text not null references public.services(id),
  network_id            text references public.networks(id),
  recipient_identifier  text not null,
  extra_value           text,
  amount                numeric(12,2) not null,
  fee                   numeric(12,2) not null default 0,
  status                tx_status not null default 'pending',
  reference             text unique not null,
  receipt               jsonb not null default '{}',
  fulfillment_provider  text not null default 'simulated',
  fulfillment_status    fulfillment_status not null default 'pending',
  -- Revenue-split bookkeeping, snapshotted at transaction time so later
  -- catalog edits (price/cost changes) never rewrite historic figures.
  -- provider_cost: what we owe the fulfilling provider for this sale.
  -- revenue: what TopMe actually keeps (amount - provider_cost).
  -- owner_label: the real-world org this was sold on behalf of (e.g.
  -- "Econet Wireless", "DStv") — snapshot of services.provider_label, for
  -- audit trails ("sold by TopMe, processed and paid to <owner_label>").
  provider_cost         numeric(12,2) not null default 0,
  revenue               numeric(12,2) generated always as (amount - provider_cost) stored,
  owner_label           text,
  created_at            timestamptz not null default now()
);
create index if not exists transactions_user_idx on public.transactions(user_id, created_at desc);

create table if not exists public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  service_id  text not null references public.services(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, service_id)
);

create table if not exists public.beneficiaries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  label       text,
  service_id  text references public.services(id),
  identifier  text not null,
  created_at  timestamptz not null default now()
);

-- Tracks an in-flight top up across gateways so the callback/webhook (which
-- only receives a reference) can look up who to credit and how much.
create table if not exists public.topup_intents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(12,2) not null,
  provider    text not null check (provider in ('paynow','stripe','ecocash')),
  reference   text unique not null,
  status      text not null default 'pending' check (status in ('pending','completed','failed')),
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists topup_intents_user_idx on public.topup_intents(user_id, created_at desc);

-- ── Gift vouchers ────────────────────────────────────────
create table if not exists public.gift_vouchers (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  sender_id      uuid not null references public.profiles(id),
  receiver_phone text not null,
  amount         numeric(12,2) not null,
  status         voucher_status not null default 'active',
  created_at     timestamptz not null default now(),
  redeemed_at    timestamptz,
  redeemed_by    uuid references public.profiles(id)
);

-- ── Business: API modules & team ────────────────────────
create table if not exists public.api_modules (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  provider       text not null,
  category       text,
  status         text not null default 'inactive' check (status in ('active','inactive')),
  key_encrypted  text,
  key_last4      text,
  webhook_url    text,
  icon           text not null default 'plug',
  color          text not null default '#00C853',
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id)
);

create table if not exists public.team_members (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id),
  user_id        uuid references public.profiles(id),
  invited_email  text not null,
  name           text,
  role           text not null default 'Manager',
  permissions    text[] not null default '{}',
  status         team_status not null default 'invited',
  created_at     timestamptz not null default now()
);

-- View that never exposes the encrypted key to any client role.
-- security_invoker makes it respect api_modules' RLS (superadmin-only) instead
-- of the Postgres default of running views with the owner's privileges —
-- without this a view is an accidental RLS bypass.
create or replace view public.api_modules_safe
  with (security_invoker = true) as
  select id, name, provider, category, status, key_last4, webhook_url, icon, color, created_at, created_by
  from public.api_modules;

-- ── Helper functions ─────────────────────────────────────
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and role in ('admin','superadmin'));
$$;

create or replace function public.is_superadmin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and role = 'superadmin');
$$;

-- ── New user → profile + wallet ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', new.email)
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance) values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent users from self-escalating their own role via a direct table update
create or replace function public.prevent_role_self_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- ── Reference generator ──────────────────────────────────
create or replace function public.generate_reference(prefix text default 'TPM')
returns text language sql volatile as $$
  select prefix || '-' || to_char(floor(random()*9000000+1000000)::int, 'FM0000000');
$$;

-- ── Money-moving RPCs (security definer) ────────────────

-- Top up: only ever invoked server-side (service role) from a verified payment
-- gateway callback/webhook — never exposed to the browser.
create or replace function public.wallet_topup(
  p_user_id  uuid,
  p_amount   numeric,
  p_provider text,
  p_reference text,
  p_meta     jsonb default '{}'
) returns public.wallet_ledger
language plpgsql security definer set search_path = public as $$
declare
  v_row public.wallet_ledger;
begin
  if p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  insert into public.wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.wallets
    set balance = balance + p_amount, updated_at = now()
    where user_id = p_user_id;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
  values (p_user_id, 'topup', p_amount, p_provider, p_reference, 'success', p_meta)
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public.wallet_topup(uuid, numeric, text, text, jsonb) from public;
grant execute on function public.wallet_topup(uuid, numeric, text, text, jsonb) to service_role;

-- Pay for a service out of the caller's own wallet (atomic debit + transaction row).
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

-- Mark a transaction's fulfillment outcome (called server-side after invoking the
-- fulfillment provider — simulated today, VitalPay once wired up).
create or replace function public.set_fulfillment_result(
  p_transaction_id uuid,
  p_status fulfillment_status,
  p_receipt jsonb default '{}'
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_tx public.transactions;
begin
  update public.transactions
    set fulfillment_status = p_status,
        receipt = coalesce(p_receipt, '{}'::jsonb)
    where id = p_transaction_id
    returning * into v_tx;
  return v_tx;
end;
$$;
revoke all on function public.set_fulfillment_result(uuid, fulfillment_status, jsonb) from public;
grant execute on function public.set_fulfillment_result(uuid, fulfillment_status, jsonb) to service_role;

-- Send a gift voucher (debits sender's wallet, creates a redeemable code).
create or replace function public.wallet_gift_send(
  p_receiver_phone text,
  p_amount numeric,
  p_sender_phone text default null
) returns public.gift_vouchers
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric;
  v_code text;
  v_voucher public.gift_vouchers;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select balance into v_balance from public.wallets where user_id = v_user for update;
  if v_balance is null or v_balance < p_amount then raise exception 'insufficient_funds'; end if;

  v_code := 'GFT-' || to_char(floor(random()*899999+100000)::int, 'FM000000');

  update public.wallets set balance = balance - p_amount, updated_at = now() where user_id = v_user;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
  values (v_user, 'gift_send', -p_amount, 'wallet', v_code, 'success', jsonb_build_object('receiver_phone', p_receiver_phone));

  insert into public.gift_vouchers (code, sender_id, receiver_phone, amount)
  values (v_code, v_user, p_receiver_phone, p_amount)
  returning * into v_voucher;

  return v_voucher;
end;
$$;
revoke all on function public.wallet_gift_send(text, numeric, text) from public;
grant execute on function public.wallet_gift_send(text, numeric, text) to authenticated;

-- Redeem a gift voucher into the caller's own wallet.
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

  update public.wallets set balance = balance + v_voucher.amount, updated_at = now() where user_id = v_user;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status)
  values (v_user, 'gift_redeem', v_voucher.amount, 'wallet', p_code, 'success');

  update public.gift_vouchers
    set status = 'redeemed', redeemed_at = now(), redeemed_by = v_user
    where code = p_code
    returning * into v_voucher;

  return v_voucher;
end;
$$;
revoke all on function public.wallet_gift_redeem(text) from public;
grant execute on function public.wallet_gift_redeem(text) to authenticated;

-- ── Row Level Security ───────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.wallets         enable row level security;
alter table public.wallet_ledger   enable row level security;
alter table public.networks        enable row level security;
alter table public.service_categories enable row level security;
alter table public.services        enable row level security;
alter table public.data_bundles    enable row level security;
alter table public.tv_packages     enable row level security;
alter table public.transactions    enable row level security;
alter table public.favorites       enable row level security;
alter table public.beneficiaries   enable row level security;
alter table public.gift_vouchers   enable row level security;
alter table public.api_modules     enable row level security;
alter table public.team_members    enable row level security;
alter table public.topup_intents   enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select using (public.is_admin(auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = id);

-- wallets: read-only to the owner, all writes go through the RPCs above
drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets for select using (auth.uid() = user_id);

-- wallet_ledger: read-only to the owner
drop policy if exists wallet_ledger_select_own on public.wallet_ledger;
create policy wallet_ledger_select_own on public.wallet_ledger for select using (auth.uid() = user_id);

-- catalog tables: readable by any authenticated user, writable only by superadmin
drop policy if exists networks_select on public.networks;
create policy networks_select on public.networks for select using (auth.role() = 'authenticated');
drop policy if exists networks_write on public.networks;
create policy networks_write on public.networks for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

drop policy if exists categories_select on public.service_categories;
create policy categories_select on public.service_categories for select using (auth.role() = 'authenticated');
drop policy if exists categories_write on public.service_categories;
create policy categories_write on public.service_categories for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

drop policy if exists services_select on public.services;
create policy services_select on public.services for select using (auth.role() = 'authenticated');
drop policy if exists services_write on public.services;
create policy services_write on public.services for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

drop policy if exists bundles_select on public.data_bundles;
create policy bundles_select on public.data_bundles for select using (auth.role() = 'authenticated');
drop policy if exists bundles_write on public.data_bundles;
create policy bundles_write on public.data_bundles for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

drop policy if exists packages_select on public.tv_packages;
create policy packages_select on public.tv_packages for select using (auth.role() = 'authenticated');
drop policy if exists packages_write on public.tv_packages;
create policy packages_write on public.tv_packages for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- transactions: owner can read own, admins can read all; all writes via RPC only
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions for select using (auth.uid() = user_id);
drop policy if exists transactions_select_admin on public.transactions;
create policy transactions_select_admin on public.transactions for select using (public.is_admin(auth.uid()));

-- favorites: full CRUD on own rows
drop policy if exists favorites_all_own on public.favorites;
create policy favorites_all_own on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- beneficiaries: full CRUD on own rows
drop policy if exists beneficiaries_all_own on public.beneficiaries;
create policy beneficiaries_all_own on public.beneficiaries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- gift_vouchers: sender or redeemer can read; writes via RPC only
drop policy if exists vouchers_select_related on public.gift_vouchers;
create policy vouchers_select_related on public.gift_vouchers for select using (auth.uid() = sender_id or auth.uid() = redeemed_by);

-- api_modules: superadmin only (raw table, incl. key_encrypted — app code should
-- prefer api_modules_safe for anything rendered to a screen)
drop policy if exists api_modules_superadmin on public.api_modules;
create policy api_modules_superadmin on public.api_modules for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- team_members: superadmin only
drop policy if exists team_members_superadmin on public.team_members;
create policy team_members_superadmin on public.team_members for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

grant select on public.api_modules_safe to authenticated;

-- topup_intents: the user can create/read their own intent; only the service
-- role (gateway callback/webhook handlers) can mark it completed/failed.
drop policy if exists topup_intents_select_own on public.topup_intents;
create policy topup_intents_select_own on public.topup_intents for select using (auth.uid() = user_id);
drop policy if exists topup_intents_insert_own on public.topup_intents;
create policy topup_intents_insert_own on public.topup_intents for insert with check (auth.uid() = user_id);
