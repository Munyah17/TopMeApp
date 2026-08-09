-- Real, per-transaction event log — "what actually happened" for a
-- payment/fulfillment lifecycle, distinct from admin_audit_log (which
-- records staff actions, not system/provider events). Populated at every
-- meaningful step: payment confirmed/failed, fulfillment attempted/
-- succeeded/failed with the real provider error, webhook received. Staff
-- can then see the real chain of events for a stuck or failed transaction
-- instead of just a final status with no story behind it.

create table if not exists public.transaction_events (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete cascade,
  reference      text,
  event_type     text not null,
  message        text not null,
  meta           jsonb not null default '{}',
  created_at     timestamptz not null default now()
);
create index if not exists transaction_events_tx_idx on public.transaction_events(transaction_id);
create index if not exists transaction_events_ref_idx on public.transaction_events(reference);
create index if not exists transaction_events_created_idx on public.transaction_events(created_at desc);

alter table public.transaction_events enable row level security;
drop policy if exists transaction_events_select on public.transaction_events;
create policy transaction_events_select on public.transaction_events for select using (public.is_admin(auth.uid()));
-- No client insert/update/delete policy — only service-role writes (via
-- logTransactionEvent, src/lib/transaction-events.ts).
