import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaynowCallback } from "@/lib/payments/paynow";
import { notifyTopupResult } from "@/lib/email/notify";
import { finalizeGuestCheckout, failGuestCheckout } from "@/lib/payments/guest-checkout";
import type { TopupIntent } from "@/types/database";

// Paynow POSTs application/x-www-form-urlencoded to this URL (PAYNOW_RESULT_URL).
// Shared between wallet top-ups (topup_intents) and guest checkout
// (guest_checkout_intents) — both use the same PAYNOW_RESULT_URL, so we look
// up the reference in whichever table actually has it.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const fields = Object.fromEntries(new URLSearchParams(raw));

  if (!verifyPaynowCallback(fields)) {
    return NextResponse.json({ error: "invalid_hash" }, { status: 400 });
  }

  const reference = fields.reference;
  const status = (fields.status || "").toLowerCase();
  const admin = createAdminClient();
  const success = status === "paid" || status === "awaiting delivery" || status === "delivered";
  const failed = status === "cancelled" || status === "disputed";

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
        p_meta: fields,
      });
      await admin.from("topup_intents").update({ status: "completed" }).eq("reference", reference);
      await notifyTopupResult(admin, { userId: row.user_id, amount: row.amount, provider: "paynow", reference, success: true });
    } else if (failed) {
      await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
      await notifyTopupResult(admin, { userId: row.user_id, amount: row.amount, provider: "paynow", reference, success: false });
    }
    return NextResponse.json({ ok: true });
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
  }

  // Already processed, or unknown reference — acknowledge so Paynow stops retrying.
  return NextResponse.json({ ok: true });
}
