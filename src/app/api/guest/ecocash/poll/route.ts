import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getEcocashStatus } from "@/lib/payments/ecocash";
import { finalizeGuestCheckout, failGuestCheckout } from "@/lib/payments/guest-checkout";
import { recordIntegrationHealth } from "@/lib/integrations/health";
import { logTransactionEvent } from "@/lib/transaction-events";
import type { Transaction } from "@/types/database";

type Admin = ReturnType<typeof createAdminClient>;

// Every caller of this route reads `data.transaction.reference` (and
// .amount/.recipient_identifier/.created_at) as soon as it sees
// status === "completed", so a "completed" reply without the transaction
// row is a guaranteed client-side crash on the success screen — the intent
// row's own status is never enough on its own.
async function completedPayload(admin: Admin, reference: string) {
  const { data: tx } = await admin.from("transactions").select("*").eq("reference", reference).maybeSingle();
  // finalize_guest_payment inserts the transaction and flips the intent to
  // 'completed' in one transaction, so a visible 'completed' intent always
  // has a visible transaction. If that somehow doesn't hold, keep the
  // client polling (it resolves on the next 3s tick) rather than handing
  // it a null it will immediately dereference.
  if (!tx) return NextResponse.json({ status: "pending" });
  return NextResponse.json({ status: "completed", transaction: tx as Transaction });
}

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
  if (intent.status === "completed") return completedPayload(admin, reference);
  if (intent.status !== "pending") return NextResponse.json({ status: intent.status });

  const endUserId = (intent.meta as { endUserId?: string })?.endUserId;
  if (!endUserId) return NextResponse.json({ status: "pending" });
  const providerStatus = await getEcocashStatus(endUserId, reference);

  if (providerStatus === "completed") {
    void recordIntegrationHealth(admin, "ecocash", { success: true });
    try {
      const tx = await finalizeGuestCheckout(reference);
      return NextResponse.json({ status: "completed", transaction: tx });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!message.includes("not_found_or_processed")) {
        // EcoCash has already taken the customer's money at this point —
        // letting this throw would 500 with no trace and leave the client
        // polling a payment it can never see resolve.
        console.error(`[guest ecocash poll] finalizeGuestCheckout failed for ${reference}:`, message);
        void logTransactionEvent(admin, { reference, eventType: "fulfillment_failed", message: `Guest EcoCash poll: finalizeGuestCheckout threw — ${message}` });
        return NextResponse.json({ error: "finalize_failed" }, { status: 500 });
      }
      // Expected: the client polls every 3s and finalizeGuestCheckout does a
      // full fulfilment round-trip plus a receipt email, so overlapping
      // calls are normal. finalize_guest_payment's `for update` means only
      // the first one did the work — return its transaction, not a 500.
      return completedPayload(admin, reference);
    }
  }
  if (providerStatus === "failed" || providerStatus === "cancelled") {
    await failGuestCheckout(reference);
    return NextResponse.json({ status: "failed" });
  }
  return NextResponse.json({ status: "pending" });
}
