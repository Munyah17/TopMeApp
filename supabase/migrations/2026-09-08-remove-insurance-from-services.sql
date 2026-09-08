-- Remove insurance services from the main services table
-- Insurance has its own dedicated flow at /insurance and uses insurance_products table
-- These services should not be in the services table as they don't use the standard payment flow

delete from public.services where id in (
  'vehicleinsurance',
  'legalinsurance',
  'agriinsurance',
  'hospitalcash',
  'funeralcash'
);
