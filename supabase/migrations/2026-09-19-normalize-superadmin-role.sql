-- Normalize profile role values: prod had 'super_admin' rows while every
-- code path, the user_role enum and RLS helpers compare 'superadmin'.
-- A superadmin with the wrong value was bounced /super-admin -> /admin ->
-- AccessLocked and could never reach the console.
-- profiles_guard_role reverts role changes for non-service_role callers, so
-- it is disabled for the duration of this data fix and re-enabled after.
alter table public.profiles disable trigger profiles_guard_role;
update public.profiles set role = 'superadmin' where role = 'super_admin';
alter table public.profiles enable trigger profiles_guard_role;
