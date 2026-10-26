-- Seed the editable top-up / gateway processing fee.
-- Owner directive 2026-10-26: "Processing fee should be $0.50 + 2.5%",
-- editable from Super Admin -> Settings -> Processing fee.
-- Shape: {"flat": <dollars>, "pct": <decimal>} — read by
-- src/lib/data/fee-config.ts (getTopupFeeConfig) and written by the
-- updateTopupFee admin action (upserts, so it works even without this seed).
insert into public.app_settings (key, value, description) values
  ('topup_fee', '{"flat": 0.5, "pct": 0.025}'::jsonb,
   'Wallet top-up / gateway processing fee: $ flat + % of amount (uniform across all payment rails).')
on conflict (key) do nothing;
