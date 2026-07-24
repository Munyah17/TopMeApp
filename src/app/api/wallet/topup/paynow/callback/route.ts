import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaynowCallback } from "@/lib/payments/paynow";
import type { TopupIntent } from "@/types/database";

// Paynow POSTs application/x-www-form-urlencoded to this URL (PAYNOW_RESULT_URL).
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const fields = Object.fromEntries(new URLSearchParams(raw));

  if (!verifyPaynowCallback(fields)) {
    return NextResponse.json({ error: "invalid_hash" }, { status: 400 });
  }

  const reference = fields.reference;
  const status = (fields.status || "").toLowerCase();
  const admin = createAdminClient();

  const { data: intent } = await admin
    .from("topup_intents")
    .select("*")
    .eq("reference", reference)
    .eq("status", "pending")
    .single();

  if (!intent) {
    // Already processed, or unknown reference — acknowledge so Paynow stops retrying.
    return NextResponse.json({ ok: true });
  }
  const row = intent as TopupIntent;

  if (status === "paid" || status === "awaiting delivery" || status === "delivered") {
    await admin.rpc("wallet_topup", {
      p_user_id: row.user_id,
      p_amount: row.amount,
      p_provider: "paynow",
      p_reference: reference,
      p_meta: fields,
    });
    await admin.from("topup_intents").update({ status: "completed" }).eq("reference", reference);
  } else if (status === "cancelled" || status === "disputed") {
    await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
  }

  return NextResponse.json({ ok: true });
}
