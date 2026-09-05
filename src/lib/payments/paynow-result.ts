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

  // Read-only lookup, just to route to the right flow — real safety against
  // double-processing (a webhook delivery landing at nearly the same
  // moment as the user's own manual "Check Payment" poll, or a provider's
  // own webhook retry) comes from wallet_topup_from_intent's atomic
  // `for update` lock on the success path, and the conditional UPDATE
  // (status='pending' in the WHERE clause) on the failure path below —
  // not from this read.
  const { data: intent } = await admin.from("topup_intents").select("*").eq("reference", reference).maybeSingle();

  if (intent) {
    const row = intent as TopupIntent;
    if (row.status !== "pending") {
      return { kind: "topup" as const, success, failed }; // already processed by a concurrent delivery
    }
    if (success) {
      const { data: ledgerRow, error } = await admin.rpc("wallet_topup_from_intent", { p_reference: reference, p_extra_meta: meta ?? {} });
      if (error) {
        if (!error.message.includes("not_found_or_processed")) {
          // Paynow has confirmed the money moved, so a failure to credit
          // the wallet is a real, customer-visible loss — it has to leave a
          // trace, not disappear the way the swallowed branch below can.
          console.error(`[paynow] wallet_topup_from_intent failed for ${reference}:`, error.message);
          void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: `Paynow: wallet_topup_from_intent failed — ${error.message}` });
        }
        // not_found_or_processed — a concurrent delivery already handled
        // this exact reference between the read above and this call.
        return { kind: "topup" as const, success, failed };
      }
      void logTransactionEvent(admin, { reference, eventType: "payment_confirmed", message: `Wallet top-up confirmed via Paynow — $${row.amount.toFixed(2)}.` });
      await notifyTopupResult(admin, { userId: row.user_id, amount: (ledgerRow as { amount: number }).amount, provider: "paynow", reference, success: true });
    } else if (failed) {
      // Conditional UPDATE, not a separate read-then-write — only the
      // first concurrent caller for this reference actually flips the row
      // (its WHERE clause stops matching once the first commits), so a
      // duplicate delivery can't send two failure notifications either.
      const { data: updated } = await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference).eq("status", "pending").select().maybeSingle();
      if (updated) {
        await notifyTopupResult(admin, { userId: row.user_id, amount: row.amount, provider: "paynow", reference, success: false });
        void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: `Wallet top-up via Paynow failed (status: ${status}).` });
      }
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
      try {
        await finalizeGuestCheckout(reference);
      } catch (e) {
        // Same overlap as the top-up path: Paynow's result_url webhook and
        // the customer's own "Check Payment" button both land here, and the
        // pending read above is not a lock. finalize_guest_payment's
        // `for update` means the loser gets not_found_or_processed for a
        // payment that did go through — surfacing that would show an error
        // to a customer whose order is already fulfilled.
        const message = e instanceof Error ? e.message : String(e);
        if (!message.includes("not_found_or_processed")) {
          console.error(`[paynow] finalizeGuestCheckout failed for ${reference}:`, message);
          void logTransactionEvent(admin, { reference, eventType: "fulfillment_failed", message: `Paynow: finalizeGuestCheckout threw — ${message}` });
          throw e;
        }
      }
    } else if (failed) {
      await failGuestCheckout(reference);
    }
    return { kind: "guest" as const, success, failed };
  }

  return { kind: "none" as const, success, failed };
}
