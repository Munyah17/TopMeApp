-- Lets the owner upload a real banner image (PNG) for Paynow/EcoCash/Stripe
-- on the payment-method picker, stored as a setting so the checkout pages
-- can read it publicly without exposing the whole app_settings table.
-- Wallet Balance is deliberately excluded — there's no third-party brand to
-- represent, so it always stays the plain styled button.

insert into public.app_settings (key, value, description) values
  ('payment_method_banners', '{}', 'Uploaded banner images (PNG) for the Paynow/EcoCash/Stripe payment buttons. Keys: paynow, ecocash, stripe.')
on conflict (key) do nothing;

insert into storage.buckets (id, name, public)
values ('payment-banners', 'payment-banners', true)
on conflict (id) do nothing;

drop policy if exists payment_banners_public_read on storage.objects;
create policy payment_banners_public_read on storage.objects
  for select using (bucket_id = 'payment-banners');

drop policy if exists payment_banners_superadmin_write on storage.objects;
create policy payment_banners_superadmin_write on storage.objects
  for insert with check (bucket_id = 'payment-banners' and public.is_superadmin(auth.uid()));

drop policy if exists payment_banners_superadmin_update on storage.objects;
create policy payment_banners_superadmin_update on storage.objects
  for update using (bucket_id = 'payment-banners' and public.is_superadmin(auth.uid()));

drop policy if exists payment_banners_superadmin_delete on storage.objects;
create policy payment_banners_superadmin_delete on storage.objects
  for delete using (bucket_id = 'payment-banners' and public.is_superadmin(auth.uid()));
