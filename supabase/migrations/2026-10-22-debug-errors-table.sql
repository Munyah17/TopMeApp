-- Table to store raw errors for admin debugging
-- Only accessible via admin endpoints, not exposed to users
create table if not exists public.debug_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  error_message text not null,
  error_stack text,
  error_type text,
  service_id text,
  user_id uuid,
  request_path text,
  request_method text,
  metadata jsonb default '{}'::jsonb
);

-- Index for querying recent errors
create index if not exists debug_errors_created_at_idx on public.debug_errors(created_at desc);
create index if not exists debug_errors_user_id_idx on public.debug_errors(user_id);
create index if not exists debug_errors_service_id_idx on public.debug_errors(service_id);

-- Enable RLS
alter table public.debug_errors enable row level security;

-- Only service role can insert (server actions)
create policy "Service role can insert debug errors" on public.debug_errors
  for insert to service_role
  with check (true);

-- Only admins can read
create policy "Admins can read debug errors" on public.debug_errors
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'super_admin')
    )
  );

-- No one can delete (keep for audit trail)
create policy "No one can delete debug errors" on public.debug_errors
  for delete to authenticated
  using (false);
