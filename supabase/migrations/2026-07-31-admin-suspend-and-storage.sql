-- Lets admin/superadmin staff temporarily suspend a customer account (blocks
-- sign-in via Supabase Auth's own ban_duration, mirrored onto profiles so the
-- admin UI can list/filter without a separate auth.admin.listUsers() call).
alter table public.profiles add column if not exists is_suspended boolean not null default false;

-- Storage bucket for product/service catalog logos, uploaded from
-- /admin/products instead of pasting an already-hosted URL.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists product_images_superadmin_write on storage.objects;
create policy product_images_superadmin_write on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_superadmin(auth.uid()));

drop policy if exists product_images_superadmin_update on storage.objects;
create policy product_images_superadmin_update on storage.objects
  for update using (bucket_id = 'product-images' and public.is_superadmin(auth.uid()));

drop policy if exists product_images_superadmin_delete on storage.objects;
create policy product_images_superadmin_delete on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_superadmin(auth.uid()));

-- Promotes the Super Admin account to the superadmin role. Run this AFTER
-- creating the user in Authentication > Users on the Supabase Dashboard —
-- until that account exists this update simply matches zero rows.
update public.profiles set role = 'superadmin'
where email = 'munyamuzvidziwa19@gmail.com';

