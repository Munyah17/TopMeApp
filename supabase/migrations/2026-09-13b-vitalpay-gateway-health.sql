-- Separate health row for the VitalPay Payments Gateway (pay.kmgvitallinks.
-- co.uk) from the existing 'vitalpay' row, which tracks the *other*
-- VitalPay product — airtime/bills/ZESA fulfilment (kmgvitallinks.co.uk).
-- Same company, two different products; conflating their health would mean
-- a checkout-gateway outage wrongly marks airtime/ZESA as unhealthy, or the
-- reverse.
insert into public.integration_health (id, label) values
  ('vitalpay_gateway', 'VitalPay Payments Gateway')
on conflict (id) do nothing;
