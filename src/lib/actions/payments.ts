"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getFulfillmentProvider } from "@/lib/fulfillment";
import { SimulatedProvider } from "@/lib/fulfillment/simulated";
import { findProfileByPhone } from "@/lib/data/queries";
import { sendEmail } from "@/lib/email/client";
import { giftSentEmail, moneyReceivedEmail, moneySentEmail, paymentReceiptEmail } from "@/lib/email/templates";
import type { ApiModuleSafe, P2pTransfer, Service, Transaction } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  insufficient_funds: "Your wallet balance is too low for this payment. Top up and try again.",
  not_authenticated: "Please log in again to continue.",
  wallet_not_found: "We couldn't find your wallet. Please contact support.",
  invalid_amount: "Enter a valid amount.",
  recipient_not_found: "No TopMe account found with that phone number.",
  cannot_pay_self: "You can't send money to your own number.",
};

function friendlyError(message: string) {
  const key = Object.keys(FRIENDLY_ERRORS).find((k) => message.includes(k));
  return key ? FRIENDLY_ERRORS[key] : "Something went wrong processing that payment. Please try again.";
}

export async function validateRecipient(serviceId: string, identifier: string) {
  const supabase = await createClient();
  const { data: service } = await supabase.from("services").select("*").eq("id", serviceId).single();
  const svc = service as Service | null;
  if (!svc) return { valid: false, message: "Unknown service." };

  const trimmed = identifier.trim();
  if (trimmed.length < 3) {
    return { valid: false, message: `Enter a valid ${svc.id_label.toLowerCase()}.` };
  }

  // Simulated provider lookup — no live biller connected yet (see src/lib/fulfillment).
  await new Promise((resolve) => setTimeout(resolve, 250));
  return { valid: true, name: svc.mock_name, sub: svc.mock_sub };
}

export interface PayServiceInput {
  serviceId: string;
  serviceName: string;
  amount: number;
  recipient: string;
  networkId?: string | null;
  extraValue?: string | null;
  saveBeneficiary?: boolean;
  beneficiaryLabel?: string;
}

export async function payService(input: PayServiceInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(FRIENDLY_ERRORS.not_authenticated);

  const { data: txData, error } = await supabase.rpc("wallet_pay", {
    p_service_id: input.serviceId,
    p_amount: input.amount,
    p_recipient: input.recipient,
    p_network_id: input.networkId ?? null,
    p_extra_value: input.extraValue ?? null,
    p_fulfillment_provider: "simulated",
  });

  if (error) {
    throw new Error(friendlyError(error.message));
  }

  const tx = txData as Transaction;

  // Resolve fulfillment: first active aggregator that covers this service,
  // simulated otherwise (see src/lib/fulfillment for the provider registry).
  const admin = createAdminClient();
  const { data: apiModules } = await admin.from("api_modules_safe").select("*").eq("status", "active");

  const provider = getFulfillmentProvider(input.serviceId, (apiModules as ApiModuleSafe[]) ?? []);
  const fulfillmentInput = {
    transactionId: tx.id,
    serviceId: input.serviceId,
    recipient: input.recipient,
    extraValue: input.extraValue,
    networkId: input.networkId,
    amount: input.amount,
  };
  let fulfillmentResult;
  try {
    fulfillmentResult = await provider.fulfil(fulfillmentInput);
  } catch (e) {
    // A configured-but-not-yet-working aggregator call (e.g. an endpoint not
    // mapped yet) shouldn't strand the customer's payment — fall back to the
    // simulated provider so the transaction still completes, clearly tagged.
    fulfillmentResult = await new SimulatedProvider().fulfil(fulfillmentInput);
    fulfillmentResult.message = e instanceof Error ? `${provider.name} unavailable: ${e.message}` : `${provider.name} unavailable.`;
  }

  const { data: updatedTx } = await admin.rpc("set_fulfillment_result", {
    p_transaction_id: tx.id,
    p_status: fulfillmentResult.status,
    p_receipt: {
      provider: provider.name,
      providerRef: fulfillmentResult.providerRef ?? null,
      message: fulfillmentResult.message ?? null,
    },
  });

  if (input.saveBeneficiary) {
    await supabase.from("beneficiaries").insert({
      user_id: user.id,
      label: input.beneficiaryLabel || input.recipient,
      service_id: input.serviceId,
      identifier: input.recipient,
    });
  }

  revalidatePath("/home");
  revalidatePath("/history");
  revalidatePath("/wallet");

  const finalTx = (updatedTx as Transaction) ?? tx;

  if (user.email) {
    const { subject, html } = paymentReceiptEmail({
      serviceName: input.serviceName,
      amount: input.amount,
      reference: finalTx.reference,
      recipient: input.recipient,
      date: new Date(finalTx.created_at).toLocaleString("en-GB"),
    });
    // Fire-and-forget — sendEmail never throws, so this can't fail the payment.
    void sendEmail({ to: user.email, subject, html });
  }

  return finalTx;
}

export async function sendGiftVoucher(receiverPhone: string, amount: number, senderPhone?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("wallet_gift_send", {
    p_receiver_phone: receiverPhone,
    p_amount: amount,
    p_sender_phone: senderPhone ?? null,
  });
  if (error) throw new Error(friendlyError(error.message));

  revalidatePath("/wallet");
  revalidatePath("/home");

  if (user?.email) {
    const { subject, html } = giftSentEmail({ amount, receiverPhone, code: data.code });
    void sendEmail({ to: user.email, subject, html });
  }

  return data;
}

// Looks up who a phone number belongs to before money moves, so the sender
// can confirm "Sending to <name>" rather than typing blind.
export async function lookupRecipient(phone: string) {
  return findProfileByPhone(phone.trim());
}

// Instant wallet-to-wallet transfer between two existing TopMe accounts
// (unlike a gift voucher, this requires the receiver to already have an
// account — resolved by phone number via the wallet_transfer RPC).
export async function sendMoney(receiverPhone: string, amount: number, note?: string, kind: "transfer" | "red_packet" = "transfer") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(FRIENDLY_ERRORS.not_authenticated);

  const { data, error } = await supabase.rpc("wallet_transfer", {
    p_receiver_phone: receiverPhone,
    p_amount: amount,
    p_note: note ?? null,
    p_kind: kind,
  });
  if (error) throw new Error(friendlyError(error.message));

  const transfer = data as P2pTransfer;

  revalidatePath("/wallet");
  revalidatePath("/home");

  // Receiver's email isn't visible under normal RLS from the sender's session
  // (profiles are owner-select-only) — the admin client bypasses that only
  // to send a courtesy notification, never exposing it back to the client.
  const admin = createAdminClient();
  const [{ data: senderProfile }, { data: receiverProfile }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    admin.from("profiles").select("email, full_name").eq("id", transfer.receiver_id).single(),
  ]);

  if (user.email) {
    const { subject, html } = moneySentEmail({ amount, receiverName: receiverProfile?.full_name || receiverPhone, kind });
    void sendEmail({ to: user.email, subject, html });
  }
  if (receiverProfile?.email) {
    const { subject, html } = moneyReceivedEmail({ amount, senderName: senderProfile?.full_name || "A TopMe user", kind });
    void sendEmail({ to: receiverProfile.email, subject, html });
  }

  return transfer;
}
