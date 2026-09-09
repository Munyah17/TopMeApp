-- Network operator logos for the airtime top-up flow's network picker.
-- A superadmin uploads a logo per network at
-- /super-admin/products → "Network operators"; it's stored in the public
-- `product-images` bucket and shown in place of the single-letter avatar
-- on the "Choose network" step. Nullable — networks with no logo keep the
-- lettered fallback, so this is safe to ship before any logo is uploaded.
alter table public.networks add column if not exists logo_url text;
