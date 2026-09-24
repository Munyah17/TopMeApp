import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { recordIntegrationHealth } from "@/lib/integrations/health";
import { logTransactionEvent } from "@/lib/transaction-events";
import { alertTransaction } from "@/lib/email/transaction-alerts";

/**
 * Receives VitalPay's async fulfillment webhooks (service.completed /
 * service.failed) for airtime/bills purchases that returned status=processing
 * synchronously. `reference` in the payload is the TopMe transaction
 * reference we passed as VitalPay's `reference` field when calling
 * /airtime/purchase or /bills/pay (see src/lib/fulfillment/vitalpay.ts).
 *
 * Two endpoints are registered on VitalPay's dashboard against this same
 * route — the real domain (VITALPAY_WEBHOOK_SECRET) and the raw Vercel
 * deployment URL as a fallback (VITALPAY_WEBHOOK_SECRET_FALLBACK), each
 * with its own signing secret. Accept either signature since delivery could
 * legitimately arrive signed with either one.
 *
 * Signature verification uses HMAC-SHA256 of the raw body with the webhook
 * secret (returned once by POST /webhooks) — this is the standard
 * convention but wasn't spelled out explicitly in the docs we have; if
 * verification always fails in practice, confirm the exact scheme with
 * VitalPay and adjust `verifySignature` below.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secrets = [process.env.VITALPAY_WEBHOOK_SECRET, process.env.VITALPAY_WEBHOOK_SECRET_FALLBACK].filter(
    (s): s is string => !!s
  );
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-vitalpay-signature");

  if (!verifySignature(rawBody, signature)) {
    // Rejected auth is NOT an integration-health signal — a signature that
    // doesn't verify says the request isn't provably from VitalPay (a stray
    // internet probe, a test ping), not that VitalPay is down. Counting it
    // flagged VitalPay as failing after random scans of this public URL.
    // console.error still captures it if the signature scheme itself is
    // misconfigured (real deliveries would all 401 and pile up pending).
    console.error(`[vitalpay webhook] invalid signature — header present: ${!!signature}, secrets configured: ${[
      !!process.env.VITALPAY_WEBHOOK_SECRET,
      !!process.env.VITALPAY_WEBHOOK_SECRET_FALLBACK,
    ].filter(Boolean).length}`);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const admin = createAdminClient();
  void recordIntegrationHealth(admin, "vitalpay", { success: true });

  const payload = JSON.parse(rawBody) as {
    event: string;
    data?: { reference?: string; status?: string };
  };

  const reference = payload.data?.reference;
  if (!reference || !["service.completed", "service.failed"].includes(payload.event)) {
    return NextResponse.json({ ok: true }); // acknowledge, nothing to do
  }

  const { data: tx } = await admin
    .from("transactions")
    .select("id, service_id, fulfillment_status, amount, fee, recipient_identifier, user_id, guest_email")
    .eq("reference", reference)
    .maybeSingle();
  if (!tx) return NextResponse.json({ ok: true });

  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference,
    eventType: "webhook_received",
    message: `VitalPay webhook: ${payload.event}.`,
    meta: { event: payload.event },
  });

  const failed = payload.event === "service.failed";
  await admin.rpc("set_fulfillment_result", {
    p_transaction_id: tx.id,
    p_status: failed ? "failed" : "fulfilled",
    p_receipt: { provider: "vitalpay", event: payload.event },
  });
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference,
    eventType: failed ? "fulfillment_failed" : "fulfillment_success",
    message: failed ? "VitalPay reported delivery failed." : "VitalPay confirmed delivery.",
    meta: { event: payload.event },
  });

  // A failed delivery must refund NOW — auto-credit the wallet for small
  // amounts, queue for staff otherwise. Previously this only flipped the
  // status and waited for the daily reconcile cron, leaving the customer's
  // money in limbo for up to 24h. Idempotent: safe if a refund already
  // exists (e.g. a duplicate webhook delivery).
  if (failed && tx.fulfillment_status !== "failed") {
    void alertTransaction(admin, {
      outcome: "failed",
      reference,
      service: tx.service_id,
      amount: tx.amount,
      fee: tx.fee,
      recipient: tx.recipient_identifier,
      method: "vitalpay",
      customer: tx.guest_email ?? tx.user_id,
      detail: "VitalPay reported delivery failed (service.failed webhook).",
    });
    const { data: svc } = await admin.from("services").select("name").eq("id", tx.service_id).single();
    const { recordFailedFulfilmentRefund } = await import("@/lib/payments/refunds");
    await recordFailedFulfilmentRefund(admin, {
      transactionId: tx.id,
      reference,
      serviceName: (svc as { name: string } | null)?.name ?? tx.service_id,
      reason: "VitalPay reported delivery failed (service.failed webhook).",
      origin: "auto",
    });
  }

  return NextResponse.json({ ok: true });
}
