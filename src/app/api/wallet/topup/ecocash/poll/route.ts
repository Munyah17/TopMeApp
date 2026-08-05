import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getEcocashStatus } from "@/lib/payments/ecocash";
import { notifyTopupResult } from "@/lib/email/notify";
import { recordIntegrationHealth } from "@/lib/integrations/health";
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
    await admin.rpc("wallet_topup", {
      p_user_id: intent.user_id,
      p_amount: intent.amount,
      p_provider: "ecocash",
      p_reference: reference,
      p_meta: intent.meta,
    });
    await admin.from("topup_intents").update({ status: "completed" }).eq("reference", reference);
    await notifyTopupResult(admin, { userId: intent.user_id, amount: intent.amount, provider: "ecocash", reference, success: true });
    return NextResponse.json({ status: "completed" });
  }
  if (providerStatus === "failed" || providerStatus === "cancelled") {
    await supabase.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
    const admin = createAdminClient();
    await notifyTopupResult(admin, { userId: intent.user_id, amount: intent.amount, provider: "ecocash", reference, success: false });
    return NextResponse.json({ status: "failed" });
  }
  return NextResponse.json({ status: "pending" });
}
