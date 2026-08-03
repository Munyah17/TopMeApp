import { NextResponse, type NextRequest } from "next/server";
import { verifyPaynowCallback } from "@/lib/payments/paynow";
import { applyPaynowResult } from "@/lib/payments/paynow-result";

// Paynow POSTs application/x-www-form-urlencoded to this URL (PAYNOW_RESULT_URL).
// Shared between wallet top-ups (topup_intents) and guest checkout
// (guest_checkout_intents) — applyPaynowResult looks up the reference in
// whichever table actually has it.
//
// This callback is not fully reliable on its own — Paynow's result_url
// delivery can be delayed or, in at least one confirmed real transaction,
// never arrive at all. See checkPaynowStatus / the "Check Payment" button
// for the poll-based fallback that doesn't depend on this webhook firing.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const fields = Object.fromEntries(new URLSearchParams(raw));

  if (!verifyPaynowCallback(fields)) {
    return NextResponse.json({ error: "invalid_hash" }, { status: 400 });
  }

  await applyPaynowResult(fields.reference, (fields.status || "").toLowerCase(), fields);

  // Already processed, or unknown reference — acknowledge so Paynow stops retrying.
  return NextResponse.json({ ok: true });
}
