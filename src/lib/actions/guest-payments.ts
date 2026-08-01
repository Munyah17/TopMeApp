"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { initiatePaynowPayment } from "@/lib/payments/paynow";
import { createGuestCheckoutSession } from "@/lib/payments/stripe";
import { initiateEcocashPush } from "@/lib/payments/ecocash";
import { failGuestCheckout } from "@/lib/payments/guest-checkout";

const FRIENDLY_ERRORS: Record<string, string> = {
  invalid_amount: "Enter a valid amount.",
  not_found_or_processed: "This payment has already been processed or expired.",
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
  guestEmail: string;
  guestPhone?: string;
  gateway: GuestGateway;
}

export async function startGuestCheckout(input: StartGuestCheckoutInput) {
  if (!(input.amount > 0)) throw new Error(FRIENDLY_ERRORS.invalid_amount);
  if (!input.guestEmail?.trim()) throw new Error("Enter your email so we can send your receipt.");
  if (input.gateway === "ecocash" && !input.guestPhone?.trim()) {
    throw new Error("Enter your EcoCash number.");
  }

  const supabase = await createClient();
  const reference = newReference();

  const { error: insertError } = await supabase.from("guest_checkout_intents").insert({
    reference,
    service_id: input.serviceId,
    network_id: input.networkId ?? null,
    recipient_identifier: input.recipient,
    extra_value: input.extraValue ?? null,
    amount: input.amount,
    guest_email: input.guestEmail,
    guest_phone: input.guestPhone ?? null,
    provider: input.gateway,
  });
  if (insertError) throw new Error(friendlyError(insertError.message));

  if (input.gateway === "paynow") {
    const result = await initiatePaynowPayment({
      reference,
      amount: input.amount,
      authEmail: input.guestEmail,
      additionalInfo: `TopMe: ${input.serviceName}`,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/pay/guest/confirm?reference=${encodeURIComponent(reference)}`,
    });
    if (!result.ok || !result.browserUrl) {
      await failGuestCheckout(reference);
      throw new Error(result.error || "Could not start Paynow payment.");
    }
    return { gateway: "paynow" as const, redirectUrl: result.browserUrl, reference };
  }

  if (input.gateway === "stripe") {
    const session = await createGuestCheckoutSession({
      amount: input.amount,
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
  const result = await initiateEcocashPush({ phone: input.guestPhone!, amount: input.amount, reference });
  if (!result.ok) {
    await failGuestCheckout(reference);
    throw new Error(result.error || "Could not start EcoCash payment.");
  }
  await supabase
    .from("guest_checkout_intents")
    .update({ meta: { sourceReference: result.sourceReference } })
    .eq("reference", reference);
  return { gateway: "ecocash" as const, reference };
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
          service_name: string;
          recipient: string;
          fulfillment_status: string;
          created_at: string;
        };
      };
}
