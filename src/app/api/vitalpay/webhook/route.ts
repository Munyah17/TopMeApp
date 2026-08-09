import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { recordIntegrationHealth } from "@/lib/integrations/health";
import { logTransactionEvent } from "@/lib/transaction-events";

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
    console.error(`[vitalpay webhook] invalid signature — header present: ${!!signature}, secrets configured: ${[
      !!process.env.VITALPAY_WEBHOOK_SECRET,
      !!process.env.VITALPAY_WEBHOOK_SECRET_FALLBACK,
    ].filter(Boolean).length}`);
    void recordIntegrationHealth(createAdminClient(), "vitalpay", { success: false, error: "invalid_signature" });
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

  const { data: tx } = await admin.from("transactions").select("id").eq("reference", reference).maybeSingle();
  if (!tx) return NextResponse.json({ ok: true });

  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference,
    eventType: "webhook_received",
    message: `VitalPay webhook: ${payload.event}.`,
    meta: { event: payload.event },
  });

  await admin.rpc("set_fulfillment_result", {
    p_transaction_id: tx.id,
    p_status: payload.event === "service.completed" ? "fulfilled" : "failed",
    p_receipt: { provider: "vitalpay", event: payload.event },
  });
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference,
    eventType: payload.event === "service.completed" ? "fulfillment_success" : "fulfillment_failed",
    message: payload.event === "service.completed" ? "VitalPay confirmed delivery." : "VitalPay reported delivery failed.",
    meta: { event: payload.event },
  });

  return NextResponse.json({ ok: true });
}
