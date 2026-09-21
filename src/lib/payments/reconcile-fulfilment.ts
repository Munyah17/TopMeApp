import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { recordFailedFulfilmentRefund } from "@/lib/payments/refunds";
import { alertTransaction } from "@/lib/email/transaction-alerts";

// Backstop sweep, run from the daily reconcile cron. The synchronous
// auto-refund in payService/finalizeGuestCheckout handles the normal case
// the moment a fulfilment fails; this catches the leftovers:
//   * failures from before the auto-refund shipped,
//   * failures where recording the refund itself errored, and
//   * async orders (airtime/bills) that have sat `pending` for over a day
//     because the provider webhook never arrived.
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;

export async function reconcileFulfilments() {
  const admin = createAdminClient();
  const summary = { failedSwept: 0, stalePendingSwept: 0, skipped: 0 };

  // 1. Every `failed` transaction with no refund_request yet.
  const { data: failed } = await admin
    .from("transactions")
    .select("id, reference, service_id, fee, amount, receipt")
    .eq("fulfillment_status", "failed")
    .order("created_at", { ascending: false })
    .limit(BATCH);

  // 2. Async orders stuck pending well past any webhook window.
  const staleCutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const { data: stale } = await admin
    .from("transactions")
    .select("id, reference, service_id, fee, amount, receipt")
    .eq("fulfillment_status", "pending")
    .lte("created_at", staleCutoff)
    .order("created_at", { ascending: false })
    .limit(BATCH);

  const rows = [
    ...((failed ?? []).map((t) => ({ t, kind: "failed" as const }))),
    ...((stale ?? []).map((t) => ({ t, kind: "stale" as const }))),
  ];
  if (rows.length === 0) return summary;

  const ids = rows.map((r) => r.t.id);
  const { data: existing } = await admin.from("refund_requests").select("transaction_id").in("transaction_id", ids);
  const haveRefund = new Set((existing ?? []).map((r) => r.transaction_id));

  const svcIds = [...new Set(rows.map((r) => r.t.service_id))];
  const { data: svcs } = await admin.from("services").select("id, name").in("id", svcIds);
  const svcName = new Map((svcs ?? []).map((s) => [s.id, s.name as string]));

  for (const { t, kind } of rows) {
    if (haveRefund.has(t.id)) {
      summary.skipped++;
      continue;
    }
    const receiptMsg = (t.receipt as { message?: string } | null)?.message;
    if (kind === "stale") {
      await admin.rpc("set_fulfillment_result", {
        p_transaction_id: t.id,
        p_status: "failed",
        p_receipt: { ...(t.receipt as Record<string, unknown> ?? {}), message: "No provider confirmation after 24h — treated as failed by reconciler." },
      });
      // This tx was alerted as a success when the money moved — the
      // reconciler just flipped it to failed, so ops needs the correction.
      void alertTransaction(admin, {
        outcome: "failed",
        reference: t.reference,
        service: svcName.get(t.service_id) ?? t.service_id,
        amount: t.amount,
        fee: t.fee,
        detail: "No provider confirmation after 24h — marked failed by the reconcile sweep.",
      });
    }
    await recordFailedFulfilmentRefund(admin, {
      transactionId: t.id,
      reference: t.reference,
      serviceName: svcName.get(t.service_id) ?? t.service_id,
      reason: receiptMsg || (kind === "stale" ? "No provider confirmation after 24 hours." : "Fulfilment failed."),
      origin: "reconcile",
    });
    haveRefund.add(t.id);
    if (kind === "stale") summary.stalePendingSwept++;
    else summary.failedSwept++;
  }

  return summary;
}
