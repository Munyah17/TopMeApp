"use server";

import { randomUUID } from "crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { checkPaynowStatus, initiatePaynowPayment } from "@/lib/payments/paynow";
import { applyPaynowResult } from "@/lib/payments/paynow-result";
import { createTopupCheckoutSession } from "@/lib/payments/stripe";
import { initiateEcocashPush } from "@/lib/payments/ecocash";
import { calculateTopupFee } from "@/lib/fees";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please log in again to continue.");
  return { supabase, user };
}

function newReference(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

// topup_intents grants users select/insert on their own row only — every
// update (status, meta.pollUrl/sessionId/endUserId) is service-role only
// (see supabase/schema.sql). Updating via the session-scoped `supabase`
// client silently no-ops under RLS instead of erroring, which is what left
// "Check Payment" with no pollUrl to poll — always use the admin client
// for these writes.

export async function startPaynowTopup(amount: number) {
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();
  const reference = newReference("PNW");
  const fee = calculateTopupFee("paynow", amount);

  await supabase.from("topup_intents").insert({ user_id: user.id, amount, fee, provider: "paynow", reference });

  const result = await initiatePaynowPayment({
    reference,
    amount: amount + fee,
    authEmail: user.email || "",
    returnUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/wallet?paynow_ref=${encodeURIComponent(reference)}`,
  });
  if (!result.ok || !result.browserUrl) {
    await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
    throw new Error(result.error || "Could not start Paynow payment.");
  }
  if (result.pollUrl) {
    await admin.from("topup_intents").update({ meta: { pollUrl: result.pollUrl } }).eq("reference", reference);
  }
  return { redirectUrl: result.browserUrl, reference };
}

export async function startStripeTopup(amount: number) {
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();
  const reference = newReference("STR");
  const fee = calculateTopupFee("stripe", amount);

  await supabase.from("topup_intents").insert({ user_id: user.id, amount, fee, provider: "stripe", reference });

  const session = await createTopupCheckoutSession({ amount: amount + fee, reference, userId: user.id, customerEmail: user.email });
  if (!session.url) throw new Error("Could not start Stripe checkout.");
  await admin.from("topup_intents").update({ meta: { sessionId: session.id } }).eq("reference", reference);
  return { redirectUrl: session.url };
}

export async function startEcocashTopup(amount: number, phone: string) {
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();
  const reference = newReference("ECO");
  const fee = calculateTopupFee("ecocash", amount);

  await supabase.from("topup_intents").insert({ user_id: user.id, amount, fee, provider: "ecocash", reference, meta: { phone } });

  const result = await initiateEcocashPush({ phone, amount: amount + fee, reference });
  if (!result.ok) {
    await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
    throw new Error(result.error || "Could not start EcoCash payment.");
  }
  await admin
    .from("topup_intents")
    .update({ meta: { phone, endUserId: result.endUserId } })
    .eq("reference", reference);
  return { reference };
}

export async function checkTopupStatus(reference: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("topup_intents").select("status").eq("reference", reference).single();
  return data?.status ?? "pending";
}

// Forces an immediate Paynow status check instead of waiting for their
// result_url webhook, which can be slow or never arrive at all. Powers the
// "Check Payment" button on the wallet top-up screen.
export async function checkTopupPaymentNow(reference: string): Promise<{ checked: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data: intent } = await supabase
    .from("topup_intents")
    .select("status, provider, meta")
    .eq("reference", reference)
    .eq("user_id", user.id)
    .single();
  if (!intent) return { checked: false, error: "We couldn't find that payment." };
  if (intent.status !== "pending") return { checked: true };
  if (intent.provider !== "paynow") return { checked: false, error: "Manual check is only available for Paynow payments." };

  const pollUrl = (intent.meta as { pollUrl?: string } | null)?.pollUrl;
  if (!pollUrl) return { checked: false, error: "This payment doesn't have a status handle yet — try again in a moment." };

  const result = await checkPaynowStatus(pollUrl);
  if (!result.ok || !result.status) return { checked: false, error: result.error || "Paynow didn't respond. Try again shortly." };

  await applyPaynowResult(reference, result.status, result.fields);
  return { checked: true };
}
