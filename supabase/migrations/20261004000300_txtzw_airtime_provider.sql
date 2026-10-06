-- Register txt.co.zw DirectRecharge as an optional airtime provider.
-- Selection still requires an active API module, credentials, and
-- TXTZW_AIRTIME_ENABLED=true.
insert into public.integration_health (id, label) values
  ('txtzw', 'txt.co.zw DirectRecharge')
on conflict (id) do nothing;

insert into public.service_provider_map
  (service_id, provider, provider_product_id, provider_sku, network_id, cost_amount, cost_currency, priority, notes, meta)
select 'airtime', 'txtzw', '', 'direct-recharge', n.network_id, null, 'ZWG', 0,
       'Pinless airtime via txt.co.zw DirectRecharge',
       jsonb_build_object('source', 'system', 'requires_explicit_env_enable', true)
from (values ('econet'), ('netone'), ('telecel')) as n(network_id)
where exists (select 1 from public.services where id = 'airtime')
on conflict (service_id, provider, provider_product_id, provider_sku, network_id) do nothing;
