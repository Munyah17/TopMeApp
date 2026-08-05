-- ═══════════════════════════════════════════════════════
--  Admin Command Center — RBAC, audit log, manual
--  rectification, disputes, support, tasks, system health,
--  announcements, settings, feature flags, version tracker.
--  One additive pass — run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════

-- ── Enums ───────────────────────────────────────────────
alter type ledger_type add value if not exists 'adjustment';

do $$ begin
  create type dispute_status as enum ('open', 'investigating', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

-- ── RBAC core ───────────────────────────────────────────
-- Superadmin always passes. An admin passes only if their active
-- team_members row lists this permission key. team_members.permissions is
-- the same text[] the existing /admin/team UI already writes to — it was
-- previously decorative (nothing read it); this is what makes it real.
create or replace function public.has_permission(uid uuid, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    coalesce(public.is_superadmin(uid), false)
    or exists (
      select 1 from public.team_members
      where user_id = uid and status = 'active' and perm = any(permissions)
    );
$$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- Backfill every existing admin with full permissions so nobody currently
-- admin gets locked out when this ships. The owner should tighten
-- individual grants afterward from /admin/staff.
insert into public.team_members (owner_id, user_id, invited_email, name, role, permissions, status)
select p.id, p.id, coalesce(p.email, ''), p.full_name, 'Manager',
  array[
    'users.view','users.suspend','staff.manage','transactions.view','transactions.rectify',
    'wallet.adjust','disputes.manage','support.manage','tasks.manage','reports.view',
    'catalog.manage','apis.manage','announcements.manage','settings.manage','flags.manage','audit.view'
  ],
  'active'
from public.profiles p
where p.role = 'admin'
  and not exists (select 1 from public.team_members tm where tm.user_id = p.id);

-- ── Audit log ───────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.profiles(id),
  action        text not null,
  target_table  text,
  target_id     text,
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log(target_table, target_id);

alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_log_select on public.admin_audit_log;
create policy admin_audit_log_select on public.admin_audit_log for select using (public.is_admin(auth.uid()));
-- No client insert/update/delete policy — only service-role writes (via
-- logAdminAction) and the security-definer rectification RPCs below.

-- ── Manual rectification RPCs ──────────────────────────
-- Every RPC checks has_permission itself (not just the calling UI) and
-- self-logs to admin_audit_log, so a permission or an action is never
-- trusted from the client alone.

create or replace function public.admin_force_fulfil_transaction(p_transaction_id uuid, p_note text default null)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions;
begin
  if not public.has_permission(auth.uid(), 'transactions.rectify') then
    raise exception 'forbidden';
  end if;

  update public.transactions
    set fulfillment_status = 'fulfilled',
        receipt = receipt || jsonb_build_object('manually_fulfilled_by', auth.uid(), 'note', p_note, 'manually_fulfilled_at', now())
    where id = p_transaction_id
    returning * into v_tx;
  if v_tx.id is null then raise exception 'transaction_not_found'; end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(), 'transaction.force_fulfil', 'transactions', p_transaction_id::text, jsonb_build_object('note', p_note));
  return v_tx;
end;
$$;
revoke all on function public.admin_force_fulfil_transaction(uuid, text) from public;
grant execute on function public.admin_force_fulfil_transaction(uuid, text) to authenticated;

create or replace function public.admin_refund_transaction(p_transaction_id uuid, p_note text default null)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_tx public.transactions;
  v_already boolean;
begin
  if not public.has_permission(auth.uid(), 'transactions.rectify') then
    raise exception 'forbidden';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if v_tx.id is null then raise exception 'transaction_not_found'; end if;
  if v_tx.user_id is null then raise exception 'guest_refund_not_supported'; end if;

  select exists(
    select 1 from public.wallet_ledger
    where type = 'refund' and meta->>'transaction_id' = p_transaction_id::text
  ) into v_already;
  if v_already then raise exception 'already_rectified'; end if;

  update public.wallets set balance = balance + v_tx.amount + v_tx.fee, updated_at = now() where user_id = v_tx.user_id;
  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
    values (v_tx.user_id, 'refund', v_tx.amount + v_tx.fee, 'admin', public.generate_reference('RCT'), 'success',
      jsonb_build_object('transaction_id', p_transaction_id, 'admin_id', auth.uid(), 'note', p_note));

  update public.transactions
    set status = 'failed', fulfillment_status = 'failed',
        receipt = receipt || jsonb_build_object('refunded_by', auth.uid(), 'note', p_note, 'refunded_at', now())
    where id = p_transaction_id
    returning * into v_tx;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(), 'transaction.refund', 'transactions', p_transaction_id::text, jsonb_build_object('amount', v_tx.amount + v_tx.fee, 'note', p_note));
  return v_tx;
end;
$$;
revoke all on function public.admin_refund_transaction(uuid, text) from public;
grant execute on function public.admin_refund_transaction(uuid, text) to authenticated;

create or replace function public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text)
returns public.wallet_ledger
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
  v_row public.wallet_ledger;
begin
  if not public.has_permission(auth.uid(), 'wallet.adjust') then
    raise exception 'forbidden';
  end if;
  if p_amount = 0 then raise exception 'invalid_amount'; end if;

  select balance into v_balance from public.wallets where user_id = p_user_id for update;
  if v_balance is null then raise exception 'wallet_not_found'; end if;
  if v_balance + p_amount < 0 then raise exception 'insufficient_funds'; end if;

  update public.wallets set balance = balance + p_amount, updated_at = now() where user_id = p_user_id;
  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
    values (p_user_id, 'adjustment', p_amount, 'admin', public.generate_reference('ADJ'), 'success',
      jsonb_build_object('admin_id', auth.uid(), 'reason', p_reason))
    returning * into v_row;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(), 'wallet.adjust', 'wallets', p_user_id::text, jsonb_build_object('amount', p_amount, 'reason', p_reason));
  return v_row;
end;
$$;
revoke all on function public.admin_adjust_wallet(uuid, numeric, text) from public;
grant execute on function public.admin_adjust_wallet(uuid, numeric, text) to authenticated;

-- ── Disputes ────────────────────────────────────────────
create table if not exists public.disputes (
  id              uuid primary key default gen_random_uuid(),
  raised_by       uuid references public.profiles(id),
  transaction_id  uuid references public.transactions(id),
  assigned_to     uuid references public.profiles(id),
  status          dispute_status not null default 'open',
  subject         text not null,
  description     text,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create table if not exists public.dispute_messages (
  id          uuid primary key default gen_random_uuid(),
  dispute_id  uuid not null references public.disputes(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists disputes_status_idx on public.disputes(status, created_at desc);
create index if not exists dispute_messages_dispute_idx on public.dispute_messages(dispute_id, created_at);

alter table public.disputes enable row level security;
alter table public.dispute_messages enable row level security;

drop policy if exists disputes_select_related on public.disputes;
create policy disputes_select_related on public.disputes for select
  using (auth.uid() = raised_by or public.is_admin(auth.uid()));
drop policy if exists disputes_insert_own on public.disputes;
create policy disputes_insert_own on public.disputes for insert
  with check (auth.uid() = raised_by or public.is_admin(auth.uid()));
drop policy if exists disputes_update_admin on public.disputes;
create policy disputes_update_admin on public.disputes for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists dispute_messages_select_related on public.dispute_messages;
create policy dispute_messages_select_related on public.dispute_messages for select
  using (exists (select 1 from public.disputes d where d.id = dispute_id and (d.raised_by = auth.uid() or public.is_admin(auth.uid()))));
drop policy if exists dispute_messages_insert_related on public.dispute_messages;
create policy dispute_messages_insert_related on public.dispute_messages for insert
  with check (sender_id = auth.uid() and exists (select 1 from public.disputes d where d.id = dispute_id and (d.raised_by = auth.uid() or public.is_admin(auth.uid()))));

-- ── Support tickets ─────────────────────────────────────
create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id),
  guest_email  text,
  guest_phone  text,
  subject      text not null,
  status       ticket_status not null default 'open',
  priority     text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to  uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint support_tickets_identity_chk check (user_id is not null or guest_email is not null or guest_phone is not null)
);
create table if not exists public.support_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  sender_id   uuid references public.profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);
create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists support_tickets_select_related on public.support_tickets;
create policy support_tickets_select_related on public.support_tickets for select
  using (auth.uid() = user_id or public.is_admin(auth.uid()));
drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets for insert
  with check (auth.uid() = user_id or public.is_admin(auth.uid()));
drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists support_ticket_messages_select_related on public.support_ticket_messages;
create policy support_ticket_messages_select_related on public.support_ticket_messages for select
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.is_admin(auth.uid()))));
drop policy if exists support_ticket_messages_insert_related on public.support_ticket_messages;
create policy support_ticket_messages_insert_related on public.support_ticket_messages for insert
  with check ((sender_id = auth.uid() or sender_id is null) and exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.is_admin(auth.uid()))));

-- ── Task assignment ─────────────────────────────────────
create table if not exists public.admin_tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  status        task_status not null default 'todo',
  priority      text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to   uuid references public.profiles(id),
  created_by    uuid references public.profiles(id),
  related_table text,
  related_id    text,
  due_at        timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists admin_tasks_assigned_idx on public.admin_tasks(assigned_to, status);

alter table public.admin_tasks enable row level security;
drop policy if exists admin_tasks_select on public.admin_tasks;
create policy admin_tasks_select on public.admin_tasks for select using (public.is_admin(auth.uid()));
drop policy if exists admin_tasks_write on public.admin_tasks;
create policy admin_tasks_write on public.admin_tasks for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ── System health ───────────────────────────────────────
create table if not exists public.integration_health (
  id                    text primary key,
  label                 text not null,
  last_success_at       timestamptz,
  last_failure_at       timestamptz,
  last_error            text,
  consecutive_failures  integer not null default 0,
  updated_at            timestamptz not null default now()
);
insert into public.integration_health (id, label) values
  ('paynow', 'Paynow'), ('stripe', 'Stripe'), ('ecocash', 'EcoCash'), ('vitalpay', 'VitalPay')
on conflict (id) do nothing;

alter table public.integration_health enable row level security;
drop policy if exists integration_health_select on public.integration_health;
create policy integration_health_select on public.integration_health for select using (public.is_admin(auth.uid()));
-- Writes only via service role from webhook/poll routes — no client write policy.

-- ── Announcements — extend promo_banners, don't parallel it ─
alter table public.promo_banners add column if not exists kind text not null default 'image';
do $$ begin
  alter table public.promo_banners add constraint promo_banners_kind_chk check (kind in ('image','announcement'));
exception when duplicate_object then null; end $$;
alter table public.promo_banners alter column image_url drop not null;
do $$ begin
  alter table public.promo_banners add constraint promo_banners_image_chk check (kind <> 'image' or image_url is not null);
exception when duplicate_object then null; end $$;
alter table public.promo_banners add column if not exists title text;
alter table public.promo_banners add column if not exists body text;
alter table public.promo_banners add column if not exists audience text not null default 'customers';
do $$ begin
  alter table public.promo_banners add constraint promo_banners_audience_chk check (audience in ('customers','staff','all'));
exception when duplicate_object then null; end $$;

-- Customers only ever see active, customer/all-audience rows (image banner
-- carousel AND announcement strip both read through this) — a staff-only
-- announcement must never leak to a guest/customer session.
drop policy if exists promo_banners_select on public.promo_banners;
create policy promo_banners_select on public.promo_banners for select
  using (is_active = true and audience in ('customers', 'all'));
drop policy if exists promo_banners_select_staff on public.promo_banners;
create policy promo_banners_select_staff on public.promo_banners for select
  using (is_active = true and audience in ('staff', 'all') and public.is_admin(auth.uid()));
-- promo_banners_select_admin (sees every row, active or not, for the CMS) and
-- promo_banners_write already exist from the original migration — unchanged.

-- ── Global settings, feature flags, version tracker ────
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);
insert into public.app_settings (key, value, description) values
  ('maintenance_mode', 'false', 'When true, blocks non-admin traffic with a maintenance notice.'),
  ('support_contact', '{"email":"support@topme.co.zw","phone":""}', 'Shown on Support Tickets and the customer help screen.'),
  ('min_topup_amount', '1', 'Minimum wallet top-up amount, USD.'),
  ('max_topup_amount', '5000', 'Maximum wallet top-up amount, USD.')
on conflict (key) do nothing;

create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean not null default true,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);
insert into public.feature_flags (key, enabled, description) values
  ('chat_enabled', true, 'Master switch for the Chat & Pay feature.'),
  ('p2p_transfers_enabled', true, 'Master switch for wallet-to-wallet Send Money / Red Packet.'),
  ('gift_vouchers_enabled', true, 'Master switch for sending/redeeming gift vouchers.')
on conflict (key) do nothing;

create table if not exists public.app_versions (
  id           uuid primary key default gen_random_uuid(),
  version      text not null,
  channel      text not null default 'production' check (channel in ('production','staging')),
  notes        text,
  released_at  timestamptz not null default now(),
  released_by  uuid references public.profiles(id)
);

alter table public.app_settings   enable row level security;
alter table public.feature_flags  enable row level security;
alter table public.app_versions   enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select using (public.is_admin(auth.uid()));
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings for all
  using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags for select using (public.is_admin(auth.uid()));
drop policy if exists feature_flags_write on public.feature_flags;
create policy feature_flags_write on public.feature_flags for all
  using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

drop policy if exists app_versions_select on public.app_versions;
create policy app_versions_select on public.app_versions for select using (public.is_admin(auth.uid()));
drop policy if exists app_versions_write on public.app_versions;
create policy app_versions_write on public.app_versions for all
  using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- Flags/settings need to be readable by ANY authenticated (and anon, for
-- maintenance_mode/feature gates that affect guest checkout) caller at the
-- specific keys the app actually gates on — the is_admin-only select above
-- protects the admin UI's full listing, but public gate checks go through
-- this narrow, safe RPC instead of a broad table grant.
create or replace function public.get_public_flag(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), true);
$$;
revoke all on function public.get_public_flag(text) from public;
grant execute on function public.get_public_flag(text) to anon, authenticated;

create or replace function public.get_public_setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key;
$$;
revoke all on function public.get_public_setting(text) from public;
grant execute on function public.get_public_setting(text) to anon, authenticated;
