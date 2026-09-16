-- Airtime platform fee: replace the flat $0.10 with a competitive
-- percentage-only rate (3%, no flat component). The flat fee under-charged
-- larger recharges, and the standard $0.50 + 1.5% formula would be
-- disproportionate on a $1 top-up. Mirrors src/lib/fees.ts
-- calculatePlatformFee() — keep the two in sync, since wallet_pay
-- recomputes the fee server-side and never trusts the client.

create or replace function public.calculate_platform_fee(p_service_id text, p_amount numeric)
returns numeric language sql immutable as $$
  select case
    when p_amount <= 0 then 0
    when p_service_id = 'airtime' then round(p_amount * 0.03, 2)
    else round(0.50 + p_amount * 0.015, 2)
  end;
$$;
