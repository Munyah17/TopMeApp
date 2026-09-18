-- Platform fee: flat 2% of the amount on EVERY service.
--
-- Owner directive 2026-09-17: "we agreed long ago to charge a percentage,
-- like 2% as platform (TopMe) processing fee." The 2026-09-17 migration
-- applied that to airtime only; this extends it to everything else, retiring
-- the $0.50 flat + 1.5% formula — a pure percentage scales fairly from a $1
-- top-up to a $200 bill where a flat component is disproportionate.
--
-- Must stay in sync with calculatePlatformFee() in src/lib/fees.ts, which is
-- the display-side source of truth shown to the customer before they pay.
create or replace function public.calculate_platform_fee(p_service_id text, p_amount numeric)
returns numeric language sql immutable as $$
  select case
    when p_amount <= 0 then 0
    else round(p_amount * 0.02, 2)
  end;
$$;
