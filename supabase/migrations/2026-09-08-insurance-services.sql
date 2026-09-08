-- Add insurance category to the main catalog for navigation
-- Insurance products are synced from TariqifyIMS into insurance_products table
-- and have their own dedicated UI flow at /insurance, not the standard /pay flow

-- Add insurance category
insert into public.service_categories (id, name, icon, color, bg, description, sort_order)
values (
  'insurance',
  'Insurance',
  'shield',
  '#6366f1',
  '#e0e7ff',
  'Vehicle, legal, agricultural, hospital cash, and funeral insurance policies',
  15
) on conflict (id) do nothing;
