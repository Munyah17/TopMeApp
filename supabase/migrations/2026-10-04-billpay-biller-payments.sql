-- BillPay Biller API: payments received through BillPay on TopMe's own
-- biller account, delivered via the signed /api/billpay/payments webhook.
-- Distinct from vendor-side flows (buying other billers' products) — these
-- are payments OTHER BillPay vendors' customers made to us.

create table if not exists public.billpay_member_payments (
  payment_id          bigint primary key,          -- BillPay's unique payment id
  billpay_reference   text not null,               -- e.g. "TOPME-241004123456789"
  bank_reference      text,
  paid_date           text not null,               -- BillPay sends "dd-MMM-yyyy HH:mm:ss"; kept verbatim
  member_number       text not null,
  member_name         text,
  product_code        text not null,
  product_price       numeric(12,2) not null,
  product_department  text,
  reconciled          boolean not null default false,
  raw                 jsonb not null default '{}'::jsonb,
  received_at         timestamptz not null default now()
);

create index if not exists billpay_member_payments_member_idx
  on public.billpay_member_payments (member_number, received_at desc);

alter table public.billpay_member_payments enable row level security;

-- Webhook inserts via service role only; admins read for reconciliation.
revoke all on public.billpay_member_payments from anon, authenticated;
