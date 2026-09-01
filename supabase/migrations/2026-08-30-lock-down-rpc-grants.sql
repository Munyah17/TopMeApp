-- Critical, found while applying 2026-08-29-atomic-wallet-topup.sql: every
-- SECURITY DEFINER money function in this project was executable by `anon`.
--
-- Why the existing guards didn't hold. Each migration ends with:
--     revoke all on function ... from public;
--     grant execute on function ... to service_role;
-- but Supabase ships a default-privileges rule for schema public:
--     alter default privileges in schema public
--       grant execute on functions to postgres, anon, authenticated, service_role;
-- so at CREATE time every function receives *explicit* EXECUTE grants for
-- anon and authenticated. `revoke ... from public` only clears the PUBLIC
-- pseudo-role entry, which was never where the grant came from — the
-- explicit anon/authenticated ACL entries survive untouched. The revoke
-- looked like it locked the function down and did nothing at all.
--
-- Impact: PostgREST exposes public-schema functions at /rest/v1/rpc/<name>
-- to whatever role the caller's key maps to, and the anon key ships in the
-- browser bundle. So anyone with the public key could call, unauthenticated:
--   * wallet_topup            — credit any wallet, any amount, out of thin air
--   * wallet_topup_from_intent— settle a pending top-up without ever paying
--   * finalize_guest_payment  — mark a guest order paid and trigger fulfilment
--   * set_fulfillment_result  — rewrite any transaction's fulfilment status
--   * fail_guest_checkout     — kill any in-flight checkout
--   * find_profile_by_phone   — enumerate customer profiles by phone number
--
-- Revoking explicitly by role name is the only thing that actually removes
-- these; every future SECURITY DEFINER function must do the same rather than
-- trusting `from public`.

-- ── Server-only: reached exclusively through createAdminClient() ─────────
-- (wallet_topup itself now has no callers at all — superseded by
-- wallet_topup_from_intent — but it stays revoked rather than dropped so an
-- old deploy mid-rollout fails closed instead of erroring on a missing fn.)
revoke execute on function public.wallet_topup(uuid, numeric, text, text, jsonb) from anon, authenticated;
revoke execute on function public.wallet_topup_from_intent(text, jsonb)          from anon, authenticated;
revoke execute on function public.finalize_guest_payment(text, text)             from anon, authenticated;
revoke execute on function public.fail_guest_checkout(text)                      from anon, authenticated;
revoke execute on function public.set_fulfillment_result(uuid, public.fulfillment_status, jsonb) from anon, authenticated;

-- ── Session-scoped: gated internally by auth.uid() / permission checks, so
-- they must stay callable by a signed-in user — but never anonymously.
revoke execute on function public.wallet_pay(text, numeric, text, text, text, text) from anon;
revoke execute on function public.wallet_gift_send(text, numeric, text)     from anon;
revoke execute on function public.wallet_transfer(text, numeric, text, text) from anon;
revoke execute on function public.start_conversation(uuid)                  from anon;
revoke execute on function public.has_permission(uuid, text)                from anon;
revoke execute on function public.admin_adjust_wallet(uuid, numeric, text)  from anon;
revoke execute on function public.admin_refund_transaction(uuid, text)      from anon;
revoke execute on function public.admin_force_fulfil_transaction(uuid, text) from anon;

-- find_profile_by_phone has no auth.uid() check of its own; it's a lookup the
-- signed-in send-money flow needs, but it must not be an open PII endpoint.
revoke execute on function public.find_profile_by_phone(text) from anon;

-- ── Deliberately left reachable by anon ──────────────────────────────────
-- get_guest_checkout   — the guest confirm page has no session; the random
--                        reference is the credential (same trust model as
--                        the guest poll route).
-- get_public_flag /
-- get_public_setting   — read by middleware before any session exists
--                        (maintenance_mode gate).
