-- Dual payment confirmation (TopMe wallet + TariqifyIMS) introduces two
-- new states: a policy whose payment couldn't be confirmed on the
-- underwriter's side sits in 'pending_verification', and its premium
-- payment record sits in 'pending_review', until a human verifies the
-- money landed. Both CHECK constraints need the new values.

alter table public.insurance_policies
  drop constraint if exists insurance_policies_status_check;
alter table public.insurance_policies
  add constraint insurance_policies_status_check
  check (status in ('pending_provider','active','pending_verification','failed','cancelled'));

alter table public.insurance_premium_payments
  drop constraint if exists insurance_premium_payments_status_check;
alter table public.insurance_premium_payments
  add constraint insurance_premium_payments_status_check
  check (status in ('captured','recorded_with_provider','provider_record_failed','pending_review'));
