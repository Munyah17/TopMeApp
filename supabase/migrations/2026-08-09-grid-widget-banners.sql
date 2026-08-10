-- Fills the blank grid slots that show up when a Home category row has
-- fewer products than the desktop column count (see .cat-section-row in
-- globals.css — "leaves the remaining slots blank rather than stretching
-- existing cards"). Reuses promo_banners rather than a parallel table: a
-- grid widget is the same "admin-uploaded image, optional link" shape as
-- the existing home-top banner, just a different placement.

alter table public.promo_banners add column if not exists placement text not null default 'home_top';
do $$ begin
  alter table public.promo_banners add constraint promo_banners_placement_chk check (placement in ('home_top', 'grid_widget'));
exception when duplicate_object then null; end $$;
