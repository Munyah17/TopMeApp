import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getEcocashStatus } from "@/lib/payments/ecocash";
import { finalizeGuestCheckout, failGuestCheckout } from "@/lib/payments/guest-checkout";

// Called from the client while showing "Approve on your phone" during a
// guest checkout. There is no session to scope by (the payer has no
// account), so the random guest reference — known only to their browser —
// is the sole lookup key, same trust model as the confirm-page RPC.
export async function POST(request: NextRequest) {
  const { reference } = await request.json();
  if (!reference) return NextResponse.json({ error: "missing_reference" }, { status: 400 });

  const admin = createAdminClient();
  const { data: intent } = await admin
    .from("guest_checkout_intents")
    .select("*")
    .eq("reference", reference)
    .single();

  if (!intent) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (intent.status !== "pending") return NextResponse.json({ status: intent.status });

  const sourceReference = (intent.meta as { sourceReference?: string })?.sourceReference || reference;
  const providerStatus = await getEcocashStatus(sourceReference);

  if (providerStatus === "completed") {
    const tx = await finalizeGuestCheckout(reference);
    return NextResponse.json({ status: "completed", transaction: tx });
  }
  if (providerStatus === "failed" || providerStatus === "cancelled") {
    await failGuestCheckout(reference);
    return NextResponse.json({ status: "failed" });
  }
  return NextResponse.json({ status: "pending" });
}
