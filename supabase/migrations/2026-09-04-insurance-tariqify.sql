-- Motions Microinsurance (Tariqify IMS) integration — schema only.
-- The API client (src/lib/insurance/tariqify.ts) can't make a real call
-- yet: every documented endpoint 404s against the confirmed live host
-- (portal.motions.co.zw — the API key itself DOES authenticate there, so
-- the key/host are right, but /api/v1/{products,clients,quotes,policies,
-- payments,tickets} aren't recognized routes on that deployment). This
-- schema doesn't depend on that being resolved, so it's not blocked on it.
--
-- Deliberately its own subsystem rather than bolted onto `services` +
-- `transactions` the way airtime/ZESA/bundles are: those are one-shot
-- recharges with no state of their own. Insurance has real state that
-- outlives a single payment — a client record (KYC'd once, reused for
-- renewals), a policy number, a running premium-payment history — so it
-- needs its own tables. The actual money movement still reuses the
-- existing wallet_pay → transactions → wallet_ledger pipeline (see
-- insurance_premium_payments.transaction_id below) rather than
-- reinventing it, which is what keeps this covered by the same suspension
-- guard, audit trail, and atomicity as every other payment in the app.

-- Local cache of Tariqify's product catalog. Synced on a schedule (not
-- fetched live on every page view) so the buy-insurance flow doesn't wait
-- on a third-party round trip, and so the app still shows a catalog if
-- Tariqify is briefly down. 60 req/min per key is Tariqify's stated limit;
-- one sync call every few minutes stays nowhere near it regardless of how
-- much customer traffic the storefront gets.
create table if not exists public.insurance_products (
  id               text primary key,        -- Tariqify's own product code
  -- name/description are what the sync job writes straight from Tariqify —
  -- treated as data, not display copy. display_name/display_description
  -- are a superadmin-editable override layer: null means "show Tariqify's
  -- own name/description", non-null wins. The point (per owner request) is
  -- that re-syncing the catalog — picking up a price/eligibility change,
  -- or an entirely new product Tariqify has added — never clobbers an
  -- admin's rebrand of how a product is presented; the two are separate
  -- columns specifically so an upsert on sync only ever touches its own.
  name              text not null,
  description       text,
  display_name        text,
  display_description text,
  category         text,
  currency         text not null default 'USD',
  -- Same override relationship as display_name: image_url is whatever (if
  -- anything) Tariqify's product record itself provides; display_image_url
  -- is the admin's own upload (superadmin write, product-images bucket —
  -- same as every other service's logo_url) and wins when set.
  image_url            text,
  display_image_url    text,
  -- What TopMe charges the customer is always base_premium * (1 +
  -- markup_percent/100), computed fresh server-side from a live quote —
  -- never a stored/cached price, and never trusted from the client (same
  -- tampering class of bug fixed in src/lib/pricing.ts for the rest of the
  -- catalog). Per-product rather than a single constant so an individual
  -- product's margin is adjustable from admin without a code change.
  markup_percent   numeric(5,2) not null default 10.00 check (markup_percent >= 0),
  -- The per-product field schema Tariqify's own product record describes
  -- for client registration/eligibility — "it can push both a product and
  -- its requirements" per the owner. Shape assumed generic and reasonable
  -- (array of {key,label,type,required,options?}) since the real response
  -- shape isn't known yet (Tariqify's documented endpoints don't resolve
  -- against the confirmed live host — see the sync job's own comment for
  -- the exact diagnostic). The dynamic KYC form renderer
  -- (src/components/insurance/dynamic-field-form.tsx) reads this shape;
  -- the sync job is what will need adjusting, not the renderer or this
  -- column, once the real per-product schema is confirmed.
  signup_fields    jsonb not null default '[]'::jsonb,
  is_active        boolean not null default true,
  raw              jsonb not null default '{}'::jsonb,  -- full Tariqify response, for fields not modelled above
  synced_at        timestamptz not null default now(),
  sort_order       integer not null default 0
);

-- The insured person Tariqify's own `clients` resource represents — keyed
-- by national ID because a TopMe profile can KYC more than one person
-- (buying cover for a parent or child), so this is deliberately not a
-- 1:1 mapping to profiles.
create table if not exists public.insurance_clients (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  national_id         text not null,
  full_name           text not null,
  phone               text,
  tariqify_client_id  text,                  -- null until the first successful POST /clients
  raw                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  unique (profile_id, national_id)
);
create index if not exists insurance_clients_profile_idx on public.insurance_clients(profile_id);

create table if not exists public.insurance_policies (
  id                    uuid primary key default gen_random_uuid(),
  policy_number         text unique,          -- Tariqify's number; null only in the brief window between our own charge and their policy-creation response
  product_id            text not null references public.insurance_products(id),
  profile_id            uuid not null references public.profiles(id) on delete cascade,   -- who is paying / manages this policy in TopMe
  insurance_client_id   uuid not null references public.insurance_clients(id),             -- who is insured (may differ from profile_id)
  base_premium          numeric(12,2) not null,   -- Tariqify's real premium, from the quote we charged against
  markup_amount         numeric(12,2) not null,   -- our cut — base_premium * markup_percent/100 at the time of purchase
  total_premium         numeric(12,2) not null,   -- what the customer's wallet was actually charged: base_premium + markup_amount
  currency              text not null default 'USD',
  status                text not null default 'pending_provider' check (status in ('pending_provider','active','failed','cancelled')),
  transaction_id        uuid references public.transactions(id),  -- the wallet_pay charge that captured this policy's first premium
  raw                   jsonb not null default '{}'::jsonb,       -- full Tariqify policy response
  created_at            timestamptz not null default now()
);
create index if not exists insurance_policies_profile_idx on public.insurance_policies(profile_id);
create index if not exists insurance_policies_client_idx on public.insurance_policies(insurance_client_id);

-- Every premium payment against a policy — the first one and every
-- renewal after it — gets its own row here, each tied to the wallet_pay
-- transaction that actually moved the money. This is the authoritative,
-- queryable ledger of every dollar this app has sent through Tariqify:
-- "record and request all money flows by the database" for insurance
-- specifically, on top of (not instead of) the generic transactions/
-- wallet_ledger trail every payment already gets.
create table if not exists public.insurance_premium_payments (
  id                  uuid primary key default gen_random_uuid(),
  policy_id           uuid not null references public.insurance_policies(id) on delete cascade,
  amount              numeric(12,2) not null,
  transaction_id      uuid not null references public.transactions(id),
  tariqify_payment_id text,                    -- id Tariqify's own POST /payments hands back, once that call succeeds
  status              text not null default 'captured' check (status in ('captured','recorded_with_provider','provider_record_failed')),
  raw                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists insurance_premium_payments_policy_idx on public.insurance_premium_payments(policy_id);

alter table public.insurance_products         enable row level security;
alter table public.insurance_clients          enable row level security;
alter table public.insurance_policies         enable row level security;
alter table public.insurance_premium_payments enable row level security;

-- Catalog is public read (browsing products doesn't require login — same
-- as every other service in `services`), superadmin write (markup/active
-- toggles), and otherwise service-role only (the sync job).
drop policy if exists insurance_products_select_public on public.insurance_products;
create policy insurance_products_select_public on public.insurance_products for select using (true);
drop policy if exists insurance_products_write_superadmin on public.insurance_products;
create policy insurance_products_write_superadmin on public.insurance_products for all
  using (is_superadmin(auth.uid())) with check (is_superadmin(auth.uid()));

-- Clients/policies/payments: owner-select only, exactly like wallets/
-- transactions/wallet_ledger — no client-side INSERT/UPDATE policy on any
-- of the three. Every write goes through a SECURITY DEFINER RPC (not
-- written yet — depends on nailing down Tariqify's real endpoint paths
-- first) the same way wallet_pay is the only writer of `transactions`.
drop policy if exists insurance_clients_select_own on public.insurance_clients;
create policy insurance_clients_select_own on public.insurance_clients for select using (auth.uid() = profile_id);
drop policy if exists insurance_clients_select_admin on public.insurance_clients;
create policy insurance_clients_select_admin on public.insurance_clients for select using (is_admin(auth.uid()));

drop policy if exists insurance_policies_select_own on public.insurance_policies;
create policy insurance_policies_select_own on public.insurance_policies for select using (auth.uid() = profile_id);
drop policy if exists insurance_policies_select_admin on public.insurance_policies;
create policy insurance_policies_select_admin on public.insurance_policies for select using (is_admin(auth.uid()));

drop policy if exists insurance_premium_payments_select_own on public.insurance_premium_payments;
create policy insurance_premium_payments_select_own on public.insurance_premium_payments for select using (
  exists (select 1 from public.insurance_policies p where p.id = insurance_premium_payments.policy_id and p.profile_id = auth.uid())
);
drop policy if exists insurance_premium_payments_select_admin on public.insurance_premium_payments;
create policy insurance_premium_payments_select_admin on public.insurance_premium_payments for select using (is_admin(auth.uid()));

-- Suspended accounts can't buy insurance either: same actor-scoped guard
-- as transactions/wallet_ledger (see 2026-09-03-enforce-account-suspension.sql).
-- Reuses that migration's function rather than a new copy — one place to
-- ever change the suspension rule.
drop trigger if exists insurance_policies_block_suspended on public.insurance_policies;
create trigger insurance_policies_block_suspended
  before insert on public.insurance_policies
  for each row execute function public.assert_actor_not_suspended();

drop trigger if exists insurance_premium_payments_block_suspended on public.insurance_premium_payments;
create trigger insurance_premium_payments_block_suspended
  before insert on public.insurance_premium_payments
  for each row execute function public.assert_actor_not_suspended();
