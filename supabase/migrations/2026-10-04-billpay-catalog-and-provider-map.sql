-- Paynow BillPay integration: catalog mirror + provider routing.
--
-- Two halves:
--   1. billpay_billers / billpay_products — a local mirror of BillPay's
--      ListBillers payload, refreshed by the biller-config webhook and a
--      daily cron. We cache because the full catalog is heavy and BillPay
--      asks vendors not to poll it.
--   2. service_provider_map — provider-agnostic routing metadata. Each row
--      says "provider X can fulfil TopMe service Y via their product Z at
--      this cost/commission". The dynamic selector (src/lib/fulfillment/
--      select.ts) reads this to pick between aggregators: healthy first,
--      then cheapest, then best net benefit to TopMe.

create table if not exists public.billpay_billers (
  code                          text primary key,           -- e.g. "ZETDC"
  name                          text not null,
  description                   text,
  icon_url                      text,
  logo_url                      text,
  reference_prefix              text,
  enabled                       boolean not null default true,
  member_number_label           text,
  member_number_desc            text,
  member_number_regex           text,
  allow_multiple_products       boolean not null default false,
  vendor_must_invoice           boolean not null default false,
  meta_title                    text,
  meta_description              text,
  raw                           jsonb not null default '{}'::jsonb,
  synced_at                     timestamptz not null default now()
);

create table if not exists public.billpay_products (
  biller_code                   text not null references public.billpay_billers(code) on delete cascade,
  code                          text not null,
  name                          text not null,
  description                   text,
  price                         numeric(12,2),              -- null = priced at AUTH or customer-specified
  department                    text,
  requires_forex                boolean,                    -- true = USD wallet; null = AUTH decides
  returns_vouchers              boolean not null default false,
  icon_url                      text,
  logo_url                      text,
  pre_purchase_instructions     text,
  post_purchase_instructions    text,
  amount_field_label            text,
  amount_field_desc             text,
  min_amount                    numeric(12,2),
  max_amount                    numeric(12,2),
  new_product                   boolean not null default false,
  invoice_title                 text,
  enabled                       boolean not null default true,
  reminder_days                 integer,
  auth_amount_mandated          boolean,                    -- null = vendor price; false = AUTH price, part-pay ok; true = AUTH price, full only
  allow_quantity                boolean not null default false,
  quantity_field_label          text,
  quantity_field_desc           text,
  metadata_fields               jsonb not null default '[]'::jsonb,
  raw                           jsonb not null default '{}'::jsonb,
  synced_at                     timestamptz not null default now(),
  primary key (biller_code, code)
);

create index if not exists billpay_products_enabled_idx on public.billpay_products(enabled) where enabled;

-- Provider-agnostic routing. One row per (service, provider, provider
-- product, network) — airtime uses network_id to split Econet vs NetOne vs
-- Telecel across providers since each may cover a different subset.
create table if not exists public.service_provider_map (
  id                    uuid primary key default gen_random_uuid(),
  service_id            text not null references public.services(id) on delete cascade,
  provider              text not null,                      -- 'vitalpay' | 'billpay' | … (matches api_modules.provider)
  provider_product_id   text not null default '',           -- biller code / operator id ('' = n/a)
  provider_sku          text not null default '',           -- product code / bill type ('' = provider infers)
  network_id            text not null default '',           -- econet|netone|telecel for airtime ('' = n/a)
  cost_amount           numeric(12,2),                      -- wholesale cost per unit/transaction, null = priced at fulfil time
  cost_currency         text not null default 'USD',
  commission_pct        numeric(8,4),                       -- BillPay: (VendorCommission/Price)*100 — net benefit to TopMe
  margin_pct            numeric(8,4),                       -- markup we add on top of cost
  enabled               boolean not null default true,
  priority              integer not null default 0,         -- admin override: higher = considered first after health
  notes                 text,
  meta                  jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (service_id, provider, provider_product_id, provider_sku, network_id)
);

create index if not exists service_provider_map_service_idx on public.service_provider_map(service_id) where enabled;

-- Health row so recordIntegrationHealth can track BillPay alongside
-- 'vitalpay' / 'vitalpay_gateway' — the selector reads consecutive_failures.
insert into public.integration_health (id, label) values
  ('billpay', 'Paynow BillPay Vendor API')
on conflict (id) do nothing;

-- Seed VitalPay's confirmed live coverage so the selector has a complete
-- picture from day one (mirrors BILLERS/SERVICE_HANDLERS in
-- src/lib/fulfillment/vitalpay.ts). EXISTS-guarded per row so a missing
-- service can't fail the migration.
insert into public.service_provider_map
  (service_id, provider, provider_product_id, provider_sku, network_id, cost_amount, cost_currency, meta)
select v.service_id, 'vitalpay', v.biller, v.sku, v.network, null, 'USD', '{}'::jsonb
from (values
  ('airtime',  'econet',                  '',        'econet'),
  ('airtime',  'netone',                  '',        'netone'),
  ('zesa',     'zedc',                    '',        ''),
  ('dstv',     'dstv_zw',                 'tv',      ''),
  ('zol',      'zol_zw',                  'internet',''),
  ('telone',   'telone_zw',               'telecom', ''),
  ('bulawayo_city_council', 'bulawayo_city_zw', 'municipal', '')
) as v(service_id, biller, sku, network)
where exists (select 1 from public.services s where s.id = v.service_id)
on conflict (service_id, provider, provider_product_id, provider_sku, network_id) do nothing;

alter table public.billpay_billers        enable row level security;
alter table public.billpay_products       enable row level security;
alter table public.service_provider_map   enable row level security;

-- Catalog rows are world-readable (they power the service browse UI);
-- routing map is admin-only since it exposes wholesale cost/commission.
drop policy if exists billpay_billers_select_public on public.billpay_billers;
create policy billpay_billers_select_public on public.billpay_billers for select using (true);

drop policy if exists billpay_products_select_public on public.billpay_products;
create policy billpay_products_select_public on public.billpay_products for select using (true);

drop policy if exists billpay_billers_write_admin on public.billpay_billers;
create policy billpay_billers_write_admin on public.billpay_billers for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists billpay_products_write_admin on public.billpay_products;
create policy billpay_products_write_admin on public.billpay_products for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists service_provider_map_admin on public.service_provider_map;
create policy service_provider_map_admin on public.service_provider_map for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
