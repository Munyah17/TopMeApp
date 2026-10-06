update public.insurance_products
set is_active = false,
    is_purchasable = false
where category ilike '%agric%'
   or name ~* '(agric|farm|field\s*to\s*floor|tobacco|crop|livestock)'
   or coalesce(description, '') ~* '(agric|farm|field\s*to\s*floor|tobacco|crop|livestock)';
