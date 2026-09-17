-- Airtime platform fee: 2% flat percentage, no fixed component.
--
-- Owner directive 2026-09-17: "we agreed long ago to charge a percentage,
-- like 2% as platform (TopMe) processing fee." The previous revision of this
-- function (2026-09-15-airtime-competitive-fee.sql) used 3%; this supersedes
-- it. The flat $0.10 a customer was actually charged on a $0.50 top-up shows
-- the pre-2026-09-15 formula is still live in the production database — this
-- migration (or at least the 2026-09-15 one) must be applied there.
--
-- Must stay in sync with calculatePlatformFee() in src/lib/fees.ts, which is
-- the display-side source of truth shown to the customer before they pay.
create or replace function public.calculate_platform_fee(p_service_id text, p_amount numeric)
returns numeric language sql immutable as $$
  select case
    when p_amount <= 0 then 0
    when p_service_id = 'airtime' then round(p_amount * 0.02, 2)
    else round(0.50 + p_amount * 0.015, 2)
  end;
$$;
