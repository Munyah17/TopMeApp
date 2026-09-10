-- Per-network active toggle for the airtime "Choose network" step.
--
-- Context: VitalPay (our only airtime provider) carries Econet and NetOne
-- for Zimbabwe but NOT Telecel — every Telecel airtime purchase debited the
-- wallet and then failed with nothing delivered. Telecel is now deactivated
-- so customers can't select it; it stays in the table (and visible in the
-- super-admin console) for when a provider covers it.
--
-- getNetworks() (customer-facing, src/lib/data/queries.ts) filters to
-- is_active = true. Admin/super-admin catalog screens use getAllNetworks()
-- and can toggle this.
alter table public.networks add column if not exists is_active boolean not null default true;
alter table public.networks add column if not exists logo_url text; -- (also in 2026-09-09-network-logos.sql; idempotent)

update public.networks set is_active = false where id = 'telecel';

-- Catalog copy that named Telecel as a covered network.
update public.services
  set description = 'Econet & NetOne top-ups'
  where id = 'airtime' and description ilike '%telecel%';
