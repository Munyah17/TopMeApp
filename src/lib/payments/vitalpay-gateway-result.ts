import { createAdminClient } from "@/lib/supabase/server";
import { notifyTopupResult } from "@/lib/email/notify";
import { finalizeGuestCheckout, failGuestCheckout } from "@/lib/payments/guest-checkout";
import { recordIntegrationHealth } from "@/lib/integrations/health";
import { logTransactionEvent } from "@/lib/transaction-events";
import type { VitalPayPaymentStatus } from "@/lib/payments/vitalpay-gateway";
import type { TopupIntent } from "@/types/database";

// Twin of applyPaynowResult (src/lib/payments/paynow-result.ts) for the
// VitalPay Payments Gateway — same dedup shape (a concurrent webhook
// delivery and the customer's own "Check Payment" poll can both land here
// for the same reference; wallet_topup_from_intent's `for update` lock and
// the conditional UPDATE on the failure path are what actually make this
// safe, not this read). Shared by both the /payments/verify poll and,
// once VitalPay's webhook signature scheme is confirmed, its webhook
// handler — deliberately built provider-agnostic at the call site so
// adding the webhook later doesn't touch this function at all.
export async function applyVitalPayGatewayResult(reference: string, status: VitalPayPaymentStatus) {
  const admin = createAdminClient();
  const success = status === "successful";
  const failed = status === "failed";
  if (success || failed) {
    void recordIntegrationHealth(admin, "vitalpay_gateway", { success: true });
  }

  const { data: intent } = await admin.from("topup_intents").select("*").eq("reference", reference).maybeSingle();

  if (intent) {
    const row = intent as TopupIntent;
    if (row.status !== "pending") {
      return { kind: "topup" as const, success, failed };
    }
    if (success) {
      const { data: ledgerRow, error } = await admin.rpc("wallet_topup_from_intent", { p_reference: reference, p_extra_meta: {} });
      if (error) {
        if (!error.message.includes("not_found_or_processed")) {
          console.error(`[vitalpay-gateway] wallet_topup_from_intent failed for ${reference}:`, error.message);
          void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: `VitalPay Gateway: wallet_topup_from_intent failed — ${error.message}` });
        }
        return { kind: "topup" as const, success, failed };
      }
      void logTransactionEvent(admin, { reference, eventType: "payment_confirmed", message: `Wallet top-up confirmed via VitalPay — $${row.amount.toFixed(2)}.` });
      await notifyTopupResult(admin, { userId: row.user_id, amount: (ledgerRow as { amount: number }).amount, provider: "vitalpay", reference, success: true });
    } else if (failed) {
      const { data: updated } = await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference).eq("status", "pending").select().maybeSingle();
      if (updated) {
        await notifyTopupResult(admin, { userId: row.user_id, amount: row.amount, provider: "vitalpay", reference, success: false });
        void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: `Wallet top-up via VitalPay failed (status: ${status}).` });
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
        console.error(`[vitalpay-gateway] finalizeGuestCheckout failed for ${reference}:`, e instanceof Error ? e.message : e);
      }
    } else if (failed) {
      await failGuestCheckout(reference);
    }
    return { kind: "guest" as const, success, failed };
  }

  return { kind: "unknown" as const, success, failed };
}
