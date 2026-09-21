import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/client";
import { getPublicSetting } from "@/lib/data/flags";
import { refundIssuedEmail, refundQueuedEmail, staffFulfilmentFailureEmail } from "@/lib/email/templates";
import { logTransactionEvent } from "@/lib/transaction-events";

export interface RefundRequestRow {
  id: string;
  transaction_id: string;
  user_id: string | null;
  guest_email: string | null;
  amount: number;
  reason: string;
  status: "pending" | "paid" | "approved" | "rejected";
  auto_eligible: boolean;
  refund_reference: string | null;
}

/**
 * Call the instant a synchronous fulfilment comes back `failed` (from
 * payService, finalizeGuestCheckout, retryFulfillment or the reconcile
 * cron). Records a refund_request — which auto-credits the wallet for a
 * small wallet-funded failure, or queues it for staff otherwise — then
 * notifies the customer and the ops inbox. Never throws; a refund/alert
 * problem must not mask the original failure.
 */
export async function recordFailedFulfilmentRefund(
  admin: SupabaseClient,
  opts: {
    transactionId: string;
    reference: string;
    serviceName: string;
    reason: string;
    origin?: "auto" | "staff" | "reconcile";
  }
): Promise<RefundRequestRow | null> {
  let req: RefundRequestRow | null = null;
  try {
    const { data, error } = await admin.rpc("record_failed_fulfilment_refund", {
      p_transaction_id: opts.transactionId,
      p_reason: opts.reason,
      p_origin: opts.origin ?? "auto",
    });
    if (error) {
      console.error(`[refund] RPC failed for ${opts.reference}: ${error.message}`);
      await logTransactionEvent(admin, {
        transactionId: opts.transactionId,
        reference: opts.reference,
        eventType: "refund_error",
        message: `Auto-refund could not be recorded: ${error.message}. Needs manual handling.`,
      });
      return null;
    }
    req = data as RefundRequestRow;
  } catch (e) {
    console.error(`[refund] threw for ${opts.reference}:`, e);
    return null;
  }

  // Fire-and-forget notifications.
  void notify(admin, req, opts).catch((e) => console.error(`[refund] notify failed for ${opts.reference}:`, e));
  return req;
}

async function notify(
  admin: SupabaseClient,
  req: RefundRequestRow,
  opts: { transactionId: string; reference: string; serviceName: string; reason: string }
) {
  const paidNow = req.status === "paid";

  // Customer
  const email =
    req.guest_email ||
    (req.user_id
      ? ((await admin.from("profiles").select("email").eq("id", req.user_id).single()).data?.email as string | undefined)
      : undefined);
  if (email) {
    if (paidNow) {
      const balance =
        req.user_id != null
          ? ((await admin.from("wallets").select("balance").eq("user_id", req.user_id).single()).data?.balance as number) ?? 0
          : 0;
      const { subject, html } = refundIssuedEmail({
        serviceName: opts.serviceName,
        amount: req.amount,
        reference: opts.reference,
        balance,
      });
      void sendEmail({ sender: "noreply", to: email, subject, html, replyTo: "info@topme.co.zw" });
    } else {
      const { subject, html } = refundQueuedEmail({ serviceName: opts.serviceName, amount: req.amount, reference: opts.reference });
      void sendEmail({ sender: "noreply", to: email, subject, html, replyTo: "info@topme.co.zw" });
    }
  }

  // Ops inbox
  const opsEmail =
    (await getPublicSetting<string>("ops_alert_email")) ||
    ((await admin.from("profiles").select("email").eq("role", "superadmin").limit(1).single()).data?.email as string | undefined);
  if (opsEmail) {
    const { subject, html } = staffFulfilmentFailureEmail({
      serviceName: opts.serviceName,
      reference: opts.reference,
      amount: req.amount,
      reason: opts.reason,
      refundState: paidNow ? "auto-refunded" : "needs approval",
      customer: req.guest_email || req.user_id || "—",
    });
    void sendEmail({ sender: "noreply", to: opsEmail, subject, html });
  }
}
