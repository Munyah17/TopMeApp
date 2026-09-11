-- Confirmed against the real live TariqifyIMS API (2026-09-12, once real
-- credentials existed to check against): GET /products doesn't return
-- signup_fields, currency, image_url or is_active at all — the shape this
-- table was originally built for was a placeholder guess. What it DOES
-- return, and what insurance_products was missing a place to put, is a
-- flat headline premium per product plus its cover terms. Adding those
-- columns is what lets the storefront actually show a price.
--
-- Also drops the default markup from 10% to 5% (owner's instruction: "just
-- add a 5% markup") — existing rows keep whatever markup_percent they
-- already have; this only changes what a newly-synced product defaults to.
alter table public.insurance_products
  add column if not exists premium numeric(12,2) not null default 0,
  add column if not exists cover_amount numeric(12,2),
  add column if not exists waiting_period_days integer,
  add column if not exists min_age integer,
  add column if not exists max_age integer,
  add column if not exists features jsonb not null default '[]'::jsonb;

alter table public.insurance_products alter column markup_percent set default 5.00;
