-- Lets a delegated admin (role='admin' with the matching permission key on
-- their team_members row) actually SEE the pages their permission is
-- supposed to unlock. Their mutating actions already went through
-- requirePermission() + createAdminClient() (service role, bypasses RLS),
-- but the read-side pages use the cookie-scoped client, which was still
-- gated to superadmin-only on these three tables — so granting e.g.
-- staff.manage did nothing, the Staff page would just render empty.
-- Additive: existing superadmin "for all" policies are untouched, these are
-- extra permissive SELECT policies (multiple permissive policies on the
-- same command are OR'd by Postgres).

drop policy if exists team_members_select_delegated on public.team_members;
create policy team_members_select_delegated on public.team_members
  for select using (public.has_permission(auth.uid(), 'staff.manage'));

drop policy if exists api_modules_select_delegated on public.api_modules;
create policy api_modules_select_delegated on public.api_modules
  for select using (public.has_permission(auth.uid(), 'apis.manage'));

-- promo_banners already has a public "is_active = true" select policy for
-- customers; this adds full visibility (including drafts/inactive rows) for
-- whoever can actually manage announcements, matching the existing
-- superadmin-only admin-select policy it sits alongside.
drop policy if exists promo_banners_select_delegated on public.promo_banners;
create policy promo_banners_select_delegated on public.promo_banners
  for select using (public.has_permission(auth.uid(), 'announcements.manage'));
