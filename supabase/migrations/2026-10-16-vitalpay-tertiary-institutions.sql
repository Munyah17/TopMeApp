-- Add VitalPay tertiary institution mappings to service_provider_map
-- Confirmed 2026-10-16 after developer agreement signed

-- Insert schoolfees mapping with VitalPay (default to MSU, others selectable via extraValue)
-- FX spread support: VitalPay can handle USD→GBP conversion with live rates + spread
insert into public.service_provider_map
  (service_id, provider, provider_product_id, provider_sku, network_id, cost_amount, cost_currency, meta)
values
  ('schoolfees', 'vitalpay', 'edu_msu_zw', 'education_university', '', null, 'USD',
   '{"default_institution": "edu_msu_zw", "available_institutions": ["edu_cut_zw", "edu_cuz_zw", "edu_zou_zw", "edu_rcu_zw", "edu_msu_zw", "edu_solusi_zw", "edu_lsu_zw", "edu_sis_zw", "edu_ajs_zw", "edu_cuza_zw"], "fx_enabled": true, "fx_default_from": "USD", "fx_default_to": "GBP"}'::jsonb)
on conflict (service_id, provider, provider_product_id, provider_sku, network_id) do update set
  meta = excluded.meta;
