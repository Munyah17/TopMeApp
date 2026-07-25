-- Adds an optional real logo image per service (customer catalog cards now
-- show a provider logo + name only, no price/description on the card).
alter table public.services
  add column if not exists logo_url text;
