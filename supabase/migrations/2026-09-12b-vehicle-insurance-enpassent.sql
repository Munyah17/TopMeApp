-- Insurance is no longer single-provider: Motions/TariqifyIMS only carries
-- medical, funeral, farming, legal and travel — vehicle cover is going
-- through a separate underwriter, EnpassentIMS, once that API key exists.
-- `provider` says which underwriter a product is fulfilled through, so the
-- Tariqify sync job and the purchase actions both know which rows they're
-- allowed to touch. `is_purchasable` is the actual buy-flow gate, kept
-- separate from `is_active` (catalog visibility) specifically so a product
-- can be shown as a preview — real marketing copy, real USPs — before its
-- provider is wired up, instead of being all-or-nothing.
alter table public.insurance_products
  add column if not exists provider text not null default 'tariqify' check (provider in ('tariqify', 'enpassent')),
  add column if not exists is_purchasable boolean not null default true;

-- The Tariqify sync job (src/app/api/cron/sync-insurance-products/route.ts)
-- only ever upserts rows whose id came back from Motions' own /products
-- response, so a manually-seeded row like this one is never touched by it.
insert into public.insurance_products (
  id, name, description, category, currency, provider, is_purchasable,
  premium, cover_amount, features, markup_percent, is_active, sort_order
) values (
  'vehicle-comprehensive-enpassent',
  'Vehicle Insurance — Comprehensive Cover',
  'Full comprehensive cover for accident damage, theft, fire and third-party liability. Buy it on TopMe and we''ll hand-deliver your insurance disc straight to your door — no office queues, no travel.',
  'vehicle',
  'USD',
  'enpassent',
  false,
  0,
  null,
  '["Accident, theft & fire cover", "Third-party liability included", "Free doorstep delivery of your insurance disc"]'::jsonb,
  5.00,
  true,
  -1
) on conflict (id) do nothing;
