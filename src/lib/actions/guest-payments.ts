"use server";

import { randomUUID } from "crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { checkPaynowStatus, initiatePaynowPayment } from "@/lib/payments/paynow";
import { applyPaynowResult } from "@/lib/payments/paynow-result";
import { createGuestCheckoutSession } from "@/lib/payments/stripe";
import { initiateEcocashPush } from "@/lib/payments/ecocash";
import { failGuestCheckout } from "@/lib/payments/guest-checkout";
import { hasRealCoverage } from "@/lib/fulfillment";
import { calculatePlatformFee } from "@/lib/fees";
import { resolveVerifiedAmount } from "@/lib/pricing";
import type { ApiModuleSafe } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  invalid_amount: "Enter a valid amount.",
  not_found_or_processed: "This payment has already been processed or expired.",
  service_unavailable: "This service isn't available right now. Please check back soon.",
};

function friendlyError(message: string) {
  const key = Object.keys(FRIENDLY_ERRORS).find((k) => message.includes(k));
  return key ? FRIENDLY_ERRORS[key] : "Something went wrong processing that payment. Please try again.";
}

function newReference() {
  return `GST-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export type GuestGateway = "paynow" | "stripe" | "ecocash";

export interface StartGuestCheckoutInput {
  serviceId: string;
  serviceName: string;
  amount: number;
  recipient: string;
  networkId?: string | null;
  extraValue?: string | null;
  bundleId?: string | null;
  pkgId?: string | null;
  packageIndex?: number | null;
  payFullBalance?: boolean;
  guestEmail: string;
  guestPhone?: string;
  gateway: GuestGateway;
}

export async function startGuestCheckout(input: StartGuestCheckoutInput) {
  if (!input.guestEmail?.trim()) throw new Error("Enter your email so we can send your receipt.");
  if (input.gateway === "ecocash" && !input.guestPhone?.trim()) {
    throw new Error("Enter your EcoCash number.");
  }

  // Never take a real card/mobile-money payment for a service with no
  // working provider behind it.
  const admin = createAdminClient();
  const [{ data: activeModules }, { data: service }] = await Promise.all([
    admin.from("api_modules_safe").select("*").eq("status", "active"),
    admin.from("services").select("id, amount_mode, outstanding").eq("id", input.serviceId).single(),
  ]);
  if (!service) throw new Error(FRIENDLY_ERRORS.service_unavailable);
  if (!hasRealCoverage(input.serviceId, (activeModules as ApiModuleSafe[]) ?? [])) {
    throw new Error(FRIENDLY_ERRORS.service_unavailable);
  }

  // Never trust a client-supplied amount for a fixed-price catalog item —
  // recompute it server-side from the real catalog row (see
  // src/lib/pricing.ts). A guest checkout has no session/auth at all
  // guarding the request, so this matters even more here than on the
  // wallet-paid path.
  const verifiedAmount = await resolveVerifiedAmount(service, {
    bundleId: input.bundleId,
    pkgId: input.pkgId,
    packageIndex: input.packageIndex,
    payFullBalance: input.payFullBalance,
    clientAmount: input.amount,
  });

  // Airtime: enforce the network operator's amount rules before taking any
  // money (see payService for the wallet-paid equivalent).
  if (input.serviceId === "airtime" && input.networkId) {
    const { getAirtimeOperatorRules } = await import("@/lib/data/queries");
    const { checkAirtimeAmount } = await import("@/lib/fulfillment/vitalpay");
    const rules = await getAirtimeOperatorRules();
    const check = checkAirtimeAmount(rules[input.networkId], verifiedAmount);
    if (!check.ok) throw new Error(check.message);
  }

  const supabase = await createClient();
  // A logged-in user can pay a specific purchase directly via a gateway
  // instead of their wallet — when signed in, the resulting transaction is
  // attributed to their account (not treated as an anonymous guest).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const reference = newReference();
  // Platform processing fee, absorbed by the payer on top of the service
  // amount — charged to the gateway as part of the same payment, and
  // remembered here so finalize_guest_payment can split it back out onto
  // the transaction without recomputing (it must always match what the
  // gateway actually collected).
  const fee = calculatePlatformFee(input.serviceId, verifiedAmount);
  const totalCharge = verifiedAmount + fee;

  const { error: insertError } = await supabase.from("guest_checkout_intents").insert({
    reference,
    user_id: user?.id ?? null,
    service_id: input.serviceId,
    network_id: input.networkId ?? null,
    recipient_identifier: input.recipient,
    extra_value: input.extraValue ?? null,
    amount: verifiedAmount,
    fee,
    guest_email: input.guestEmail,
    guest_phone: input.guestPhone ?? null,
    provider: input.gateway,
  });
  if (insertError) throw new Error(friendlyError(insertError.message));

  if (input.gateway === "paynow") {
    const result = await initiatePaynowPayment({
      reference,
      amount: totalCharge,
      authEmail: input.guestEmail,
      additionalInfo: `TopMe: ${input.serviceName}`,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/pay/guest/confirm?reference=${encodeURIComponent(reference)}`,
    });
    if (!result.ok || !result.browserUrl) {
      await failGuestCheckout(reference);
      throw new Error(result.error || "Could not start Paynow payment.");
    }
    if (result.pollUrl) {
      // guest_checkout_intents has no UPDATE grant for the session-scoped
      // client (only insert, and only service-role can update — see
      // supabase/migrations/2026-07-29-guest-checkout.sql) — using
      // `supabase` here silently no-ops under RLS instead of erroring,
      // which is exactly what left "Check Payment" with no pollUrl to poll.
      await admin.from("guest_checkout_intents").update({ meta: { pollUrl: result.pollUrl } }).eq("reference", reference);
    }
    return { gateway: "paynow" as const, redirectUrl: result.browserUrl, reference };
  }

  if (input.gateway === "stripe") {
    const session = await createGuestCheckoutSession({
      amount: totalCharge,
      reference,
      serviceName: input.serviceName,
      guestEmail: input.guestEmail,
    });
    if (!session.url) {
      await failGuestCheckout(reference);
      throw new Error("Could not start Stripe checkout.");
    }
    return { gateway: "stripe" as const, redirectUrl: session.url, reference };
  }

  // ecocash
  const result = await initiateEcocashPush({ phone: input.guestPhone!, amount: totalCharge, reference });
  if (!result.ok) {
    await failGuestCheckout(reference);
    throw new Error(result.error || "Could not start EcoCash payment.");
  }
  await admin
    .from("guest_checkout_intents")
    .update({ meta: { endUserId: result.endUserId } })
    .eq("reference", reference);
  return { gateway: "ecocash" as const, reference };
}

// Forces an immediate Paynow status check instead of waiting for their
// result_url webhook, which can be slow or (confirmed against a real
// transaction) never arrive at all. Powers the "Check Payment" button.
export async function checkGuestPaymentNow(reference: string): Promise<{ checked: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: intent } = await admin
    .from("guest_checkout_intents")
    .select("status, provider, meta")
    .eq("reference", reference)
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

export async function getGuestCheckoutStatus(reference: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_guest_checkout", { p_reference: reference });
  if (error) throw new Error(friendlyError(error.message));
  return data as
    | { status: "not_found" | "pending" | "failed" }
    | {
        status: "completed";
        transaction: {
          reference: string;
          amount: number;
          fee: number;
          service_name: string;
          recipient: string;
          fulfillment_status: string;
          created_at: string;
        };
      };
}
