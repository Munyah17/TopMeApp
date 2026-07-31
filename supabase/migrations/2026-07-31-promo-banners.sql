-- Super-admin-managed promotional banner shown on the customer home page.
-- Only one is typically active at a time (home page shows the first active
-- one by sort_order), but the table supports several so admin can prep the
-- next banner before switching over.
create table if not exists public.promo_banners (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,
  link_url    text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.promo_banners enable row level security;

drop policy if exists promo_banners_select on public.promo_banners;
create policy promo_banners_select on public.promo_banners for select using (is_active = true);

drop policy if exists promo_banners_select_admin on public.promo_banners;
create policy promo_banners_select_admin on public.promo_banners for select using (public.is_superadmin(auth.uid()));

drop policy if exists promo_banners_write on public.promo_banners;
create policy promo_banners_write on public.promo_banners for all
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));
