import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getEcocashStatus } from "@/lib/payments/ecocash";
import { notifyTopupResult } from "@/lib/email/notify";
import { recordIntegrationHealth } from "@/lib/integrations/health";
import { logTransactionEvent } from "@/lib/transaction-events";
import type { TopupIntent } from "@/types/database";

// Called from the client while showing "Approve on your phone". Uses the
// user's own session (not the service role) to look up their own intent,
// then escalates to the admin client only to credit the wallet.
export async function POST(request: NextRequest) {
  const { reference } = await request.json();
  if (!reference) return NextResponse.json({ error: "missing_reference" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { data } = await supabase.from("topup_intents").select("*").eq("reference", reference).eq("user_id", user.id).single();
  const intent = data as TopupIntent | null;
  if (!intent) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (intent.status !== "pending") return NextResponse.json({ status: intent.status });

  const endUserId = (intent.meta as { endUserId?: string })?.endUserId;
  if (!endUserId) return NextResponse.json({ status: "pending" });
  const providerStatus = await getEcocashStatus(endUserId, reference);

  if (providerStatus === "completed") {
    const admin = createAdminClient();
    void recordIntegrationHealth(admin, "ecocash", { success: true });
    // Atomic: this client polls every few seconds while showing "Approve on
    // your phone", so overlapping/duplicate calls for the same reference
    // are expected, not an edge case — wallet_topup_from_intent's
    // `for update` lock means only the first one actually credits the
    // wallet, the rest safely no-op via not_found_or_processed.
    const { data: ledgerRow, error } = await admin.rpc("wallet_topup_from_intent", { p_reference: reference });
    if (error) {
      if (!error.message.includes("not_found_or_processed")) {
        console.error(`[ecocash poll] wallet_topup_from_intent failed for ${reference}:`, error.message);
        void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: `EcoCash poll: wallet_topup_from_intent failed — ${error.message}` });
        return NextResponse.json({ error: "topup_failed" }, { status: 500 });
      }
      return NextResponse.json({ status: "completed" });
    }
    await notifyTopupResult(admin, { userId: intent.user_id, amount: (ledgerRow as { amount: number }).amount, provider: "ecocash", reference, success: true });
    return NextResponse.json({ status: "completed" });
  }
  if (providerStatus === "failed" || providerStatus === "cancelled") {
    const admin = createAdminClient();
    const { data: updated } = await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference).eq("status", "pending").select().maybeSingle();
    if (updated) {
      await notifyTopupResult(admin, { userId: intent.user_id, amount: intent.amount, provider: "ecocash", reference, success: false });
    }
    return NextResponse.json({ status: "failed" });
  }
  return NextResponse.json({ status: "pending" });
}
