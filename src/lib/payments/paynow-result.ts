import { createAdminClient } from "@/lib/supabase/server";
import { notifyTopupResult } from "@/lib/email/notify";
import { finalizeGuestCheckout, failGuestCheckout } from "@/lib/payments/guest-checkout";
import { recordIntegrationHealth } from "@/lib/integrations/health";
import { logTransactionEvent } from "@/lib/transaction-events";
import type { TopupIntent } from "@/types/database";

// Shared by the Paynow result_url webhook and the manual "Check Payment"
// poll — both end up with a verified Paynow status string for a reference
// and need to apply it the same way, whichever pending intent it belongs to.
export async function applyPaynowResult(reference: string, status: string, meta?: Record<string, string>) {
  const admin = createAdminClient();
  const success = status === "paid" || status === "awaiting delivery" || status === "delivered";
  const failed = status === "cancelled" || status === "disputed";
  // A real status came back from Paynow either way — that's what "healthy"
  // means here, not whether the payment itself succeeded.
  if (success || failed) {
    void recordIntegrationHealth(admin, "paynow", { success: true });
  }

  const { data: intent } = await admin
    .from("topup_intents")
    .select("*")
    .eq("reference", reference)
    .eq("status", "pending")
    .single();

  if (intent) {
    const row = intent as TopupIntent;
    if (success) {
      await admin.rpc("wallet_topup", {
        p_user_id: row.user_id,
        p_amount: row.amount,
        p_provider: "paynow",
        p_reference: reference,
        p_meta: meta ?? {},
      });
      await admin.from("topup_intents").update({ status: "completed" }).eq("reference", reference);
      await notifyTopupResult(admin, { userId: row.user_id, amount: row.amount, provider: "paynow", reference, success: true });
      void logTransactionEvent(admin, { reference, eventType: "payment_confirmed", message: `Wallet top-up confirmed via Paynow — $${row.amount.toFixed(2)}.` });
    } else if (failed) {
      await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
      await notifyTopupResult(admin, { userId: row.user_id, amount: row.amount, provider: "paynow", reference, success: false });
      void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: `Wallet top-up via Paynow failed (status: ${status}).` });
    }
    return { kind: "topup" as const, success, failed };
  }

  const { data: guestIntent } = await admin
    .from("guest_checkout_intents")
    .select("reference")
    .eq("reference", reference)
    .eq("status", "pending")
    .single();

  if (guestIntent) {
    if (success) {
      await finalizeGuestCheckout(reference);
    } else if (failed) {
      await failGuestCheckout(reference);
    }
    return { kind: "guest" as const, success, failed };
  }

  return { kind: "none" as const, success, failed };
}
