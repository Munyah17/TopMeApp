-- Abuse protection for the one unauthenticated, money-moving entry point
-- in the app: guest checkout (src/lib/actions/guest-payments.ts). Nobody
-- needs an account to reach startGuestCheckout, and every call to it
-- triggers a real request to Paynow/EcoCash/Stripe — hammering it costs
-- real money in gateway calls even when every attempt fails, and it's a
-- plausible way to probe card/phone numbers. Login and signup aren't
-- covered here: both call Supabase Auth directly from the browser (see
-- src/app/(auth)/login, signup — "use client", supabase.auth.*), which
-- never touches this app's own server at all, so there's nothing of ours
-- to rate-limit in front of them — Supabase's own platform-level auth
-- rate limits (Authentication -> Rate Limits in the Supabase dashboard)
-- are what actually guards that surface, and already apply by default.
--
-- Deliberately DB-backed rather than an in-memory counter: a Vercel
-- serverless function has no shared memory between invocations (each
-- request can land on a different instance), so an in-process counter
-- would silently reset constantly and protect nothing. This is also the
-- same "always validate against the database" principle already applied
-- everywhere else money is involved.
create table if not exists public.rate_limit_hits (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  identifier  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists rate_limit_hits_lookup_idx on public.rate_limit_hits(bucket, identifier, created_at);

-- Prunes its own old rows opportunistically (bounded to the bucket/
-- identifier being checked, so this never scans the whole table) rather
-- than needing a separate cron job just to keep this table small.
create or replace function public.check_rate_limit(
  p_bucket text,
  p_identifier text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  delete from public.rate_limit_hits
    where bucket = p_bucket and identifier = p_identifier
      and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count from public.rate_limit_hits
    where bucket = p_bucket and identifier = p_identifier
      and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket, identifier) values (p_bucket, p_identifier);
  return true;
end;
$$;
revoke all on function public.check_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

alter table public.rate_limit_hits enable row level security;
-- Service-role only — no client (anon or authenticated) ever reads or
-- writes this table directly, only through check_rate_limit().
