import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyWebhookSignature, verifyLegacyHash, type BillPayWebhookPayload } from "@/lib/billpay/biller-api";

/**
 * BillPay Biller payment-notification webhook.
 *
 * When TopMe is configured as a biller, BillPay POSTs { Payments: [...],
 * Hash } here after every transaction (or batched daily, depending on the
 * config their ops sets). Auth is by signature, not bearer:
 *   - X-Signature header = Base64 HMAC-SHA256 of the RAW body under the
 *     secret key BillPay gave us (BILLPAY_BILLER_WEBHOOK_SECRET)
 *   - legacy Hash field = SHA256 hex of concatenated payment fields + key
 *     (kept as a fallback only — HMAC is authoritative when present)
 *
 * BillPay retries up to 3× on non-200, so a signature mismatch returns
 * 401 (they'll retry and fail — that's correct, it means the key is
 * wrong or the payload was tampered with), while a DB error returns
 * 500 to trigger a redelivery.
 *
 * Rows land in billpay_member_payments keyed on PaymentId — re-deliveries
 * upsert rather than duplicate.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.BILLPAY_BILLER_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "BILLPAY_BILLER_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  let payload: BillPayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const signature = request.headers.get("x-signature");
  const verified = signature
    ? verifyWebhookSignature(rawBody, signature, secret)
    : verifyLegacyHash(payload, secret);
  if (!verified) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  const payments = payload.Payments ?? [];
  if (!payments.length) {
    // A signed empty batch is a valid delivery (daily flush with nothing).
    return NextResponse.json({ ok: true, received: 0 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("billpay_member_payments").upsert(
    payments.map((p) => ({
      payment_id: p.PaymentId,
      billpay_reference: p.BillPayReference,
      bank_reference: p.BankReference || null,
      paid_date: p.PaidDate,
      member_number: p.MemberNumber,
      member_name: p.MemberName || null,
      product_code: p.ProductCode,
      product_price: p.ProductPrice,
      product_department: p.ProductDepartment || null,
      raw: p as unknown as Record<string, unknown>,
    })),
    { onConflict: "payment_id" }
  );

  if (error) {
    console.error("[billpay/payments] insert failed:", error);
    return NextResponse.json({ error: "Failed to record payments" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, received: payments.length });
}
