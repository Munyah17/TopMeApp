-- Lets an admin set a profile picture for a customer account from
-- /admin/users/[id] (see uploadUserAvatar/setUserAvatar in
-- src/lib/actions/admin.ts) — profiles never had anywhere to store one.
alter table public.profiles add column if not exists avatar_url text;
