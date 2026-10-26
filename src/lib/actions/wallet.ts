"use server";

import { randomUUID } from "crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { checkPaynowStatus, initiatePaynowPayment } from "@/lib/payments/paynow";
import { applyPaynowResult } from "@/lib/payments/paynow-result";
import { createTopupCheckoutSession } from "@/lib/payments/stripe";
import { initiateEcocashPush } from "@/lib/payments/ecocash";
import { initializeVitalPayGatewayPayment, verifyVitalPayGatewayPayment } from "@/lib/payments/vitalpay-gateway";
import { applyVitalPayGatewayResult } from "@/lib/payments/vitalpay-gateway-result";
import { calculateTopupFee } from "@/lib/fees";
import { getTopupFeeConfig } from "@/lib/data/fee-config";

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

export interface TopupStartResult {
  redirectUrl?: string;
  reference?: string;
  error?: string;
}

// These actions return { error } instead of throwing: a thrown server-action
// error's message is ALWAYS production-redacted into the generic digest
// string, so callers could never see the real reason (missing Paynow config,
// a rejected request, a network hiccup). Returning it keeps the real message.
export async function startPaynowTopup(amount: number): Promise<TopupStartResult> {
  let reference = "";
  try {
    const { supabase, user } = await requireUser();
    const admin = createAdminClient();
    reference = newReference("PNW");
    const feeConfig = await getTopupFeeConfig();
    const fee = calculateTopupFee("paynow", amount, feeConfig);

    await supabase.from("topup_intents").insert({ user_id: user.id, amount, fee, provider: "paynow", reference });

    const result = await initiatePaynowPayment({
      reference,
      amount: amount + fee,
      authEmail: user.email || "",
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.topme.co.zw"}/wallet?paynow_ref=${encodeURIComponent(reference)}`,
    });
    if (!result.ok || !result.browserUrl) {
      await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
      return { error: result.error || "Could not start Paynow payment." };
    }
    if (result.pollUrl) {
      await admin.from("topup_intents").update({ meta: { pollUrl: result.pollUrl } }).eq("reference", reference);
    }
    return { redirectUrl: result.browserUrl, reference };
  } catch (e) {
    console.error(`[topup] paynow ${reference} start failed:`, e);
    return { error: e instanceof Error ? e.message : "Could not start Paynow payment." };
  }
}

export async function startStripeTopup(amount: number): Promise<TopupStartResult> {
  let reference = "";
  try {
    const { supabase, user } = await requireUser();
    const admin = createAdminClient();
    reference = newReference("STR");
    const feeConfig = await getTopupFeeConfig();
    const fee = calculateTopupFee("stripe", amount, feeConfig);

    await supabase.from("topup_intents").insert({ user_id: user.id, amount, fee, provider: "stripe", reference });

    const session = await createTopupCheckoutSession({ amount: amount + fee, reference, userId: user.id, customerEmail: user.email });
    if (!session.url) {
      await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
      return { error: "Could not start Stripe checkout." };
    }
    await admin.from("topup_intents").update({ meta: { sessionId: session.id } }).eq("reference", reference);
    return { redirectUrl: session.url };
  } catch (e) {
    console.error(`[topup] stripe ${reference} start failed:`, e);
    return { error: e instanceof Error ? e.message : "Could not start Stripe checkout." };
  }
}

export async function startEcocashTopup(amount: number, phone: string): Promise<TopupStartResult> {
  let reference = "";
  try {
    const { supabase, user } = await requireUser();
    const admin = createAdminClient();
    reference = newReference("ECO");
    const feeConfig = await getTopupFeeConfig();
    const fee = calculateTopupFee("ecocash", amount, feeConfig);

    await supabase.from("topup_intents").insert({ user_id: user.id, amount, fee, provider: "ecocash", reference, meta: { phone } });

    const result = await initiateEcocashPush({ phone, amount: amount + fee, reference });
    if (!result.ok) {
      await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
      return { error: result.error || "Could not start EcoCash payment." };
    }
    await admin
      .from("topup_intents")
      .update({ meta: { phone, endUserId: result.endUserId } })
      .eq("reference", reference);
    return { reference };
  } catch (e) {
    console.error(`[topup] ecocash ${reference} start failed:`, e);
    return { error: e instanceof Error ? e.message : "Could not start EcoCash payment." };
  }
}

// Not wired into the top-up UI yet — VITALPAY_GATEWAY_SECRET_KEY isn't
// configured (see src/lib/payments/vitalpay-gateway.ts), so this returns a
// clear "not configured" error the moment it's called. Built ahead of the
// key existing so turning it on is just adding the env var + a button,
// not writing this from scratch under pressure once the key arrives.
export async function startVitalPayTopup(amount: number): Promise<TopupStartResult> {
  let reference = "";
  try {
    const { supabase, user } = await requireUser();
    const admin = createAdminClient();
    reference = newReference("VPY");
    const feeConfig = await getTopupFeeConfig();
    const fee = calculateTopupFee("vitalpay", amount, feeConfig);

    await supabase.from("topup_intents").insert({ user_id: user.id, amount, fee, provider: "vitalpay", reference });

    const result = await initializeVitalPayGatewayPayment({
      amount: amount + fee,
      currency: "USD",
      email: user.email || "",
      reference,
      name: undefined,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.topme.co.zw"}/wallet?vitalpay_ref=${encodeURIComponent(reference)}`,
      description: "TopMe wallet top up",
    });

    if (result.status === "successful") {
      // Test-mode sandbox scenario resolves synchronously with no redirect —
      // apply it immediately instead of sending the customer to a blank page.
      await applyVitalPayGatewayResult(reference, "successful");
      return { redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.topme.co.zw"}/wallet?vitalpay_ref=${encodeURIComponent(reference)}`, reference };
    }
    if (result.status === "failed") {
      await admin.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
      return { error: "VitalPay declined this payment." };
    }
    if (!result.payment_url) {
      return { error: "VitalPay didn't return a checkout link — try again shortly." };
    }
    await admin.from("topup_intents").update({ meta: { platformReference: result.platform_reference } }).eq("reference", reference);
    return { redirectUrl: result.payment_url, reference };
  } catch (e) {
    console.error(`[topup] vitalpay ${reference} start failed:`, e);
    return { error: e instanceof Error ? e.message : "Could not start VitalPay payment." };
  }
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

  if (intent.provider === "vitalpay") {
    try {
      const verify = await verifyVitalPayGatewayPayment(reference);
      await applyVitalPayGatewayResult(reference, verify.status);
      return { checked: true };
    } catch (e) {
      return { checked: false, error: e instanceof Error ? e.message : "VitalPay didn't respond. Try again shortly." };
    }
  }

  if (intent.provider !== "paynow") return { checked: false, error: "Manual check is only available for Paynow and VitalPay payments." };

  const pollUrl = (intent.meta as { pollUrl?: string } | null)?.pollUrl;
  if (!pollUrl) return { checked: false, error: "This payment doesn't have a status handle yet — try again in a moment." };

  const result = await checkPaynowStatus(pollUrl);
  if (!result.ok || !result.status) return { checked: false, error: result.error || "Paynow didn't respond. Try again shortly." };

  await applyPaynowResult(reference, result.status, result.fields);
  return { checked: true };
}
