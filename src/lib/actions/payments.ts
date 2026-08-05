"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getFulfillmentProvider, hasRealCoverage } from "@/lib/fulfillment";
import { isFeatureEnabled } from "@/lib/data/flags";
import { findProfileByPhone } from "@/lib/data/queries";
import { sendEmail } from "@/lib/email/client";
import { giftSentEmail, moneyReceivedEmail, moneySentEmail, paymentReceiptEmail } from "@/lib/email/templates";
import type { ApiModuleSafe, P2pTransfer, Transaction } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  insufficient_funds: "Your wallet balance is too low for this payment. Top up and try again.",
  not_authenticated: "Please log in again to continue.",
  wallet_not_found: "We couldn't find your wallet. Please contact support.",
  invalid_amount: "Enter a valid amount.",
  recipient_not_found: "No TopMe account found with that phone number.",
  cannot_pay_self: "You can't send money to your own number.",
  service_unavailable: "This service isn't available right now. Please check back soon.",
  feature_disabled: "This feature is temporarily turned off. Please check back soon.",
};

function friendlyError(message: string) {
  const key = Object.keys(FRIENDLY_ERRORS).find((k) => message.includes(k));
  return key ? FRIENDLY_ERRORS[key] : "Something went wrong processing that payment. Please try again.";
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

  // Never debit a wallet for a service with no real provider behind it —
  // this must run before wallet_pay, not after (see /pay/[serviceId]/page.tsx
  // for the same check gating the checkout UI itself).
  const admin = createAdminClient();
  const { data: activeModules } = await admin.from("api_modules_safe").select("*").eq("status", "active");
  if (!hasRealCoverage(input.serviceId, (activeModules as ApiModuleSafe[]) ?? [])) {
    throw new Error(FRIENDLY_ERRORS.service_unavailable);
  }

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

  // Resolve fulfillment: first active aggregator that covers this service
  // (already confirmed to exist by the coverage check above).
  const provider = getFulfillmentProvider(input.serviceId, (activeModules as ApiModuleSafe[]) ?? []);
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
    // Wallet is already debited at this point — the honest thing to do is
    // record a real failure so it's visible for a manual refund/retry, not
    // fake a "simulated" success that hides that nothing was delivered.
    fulfillmentResult = {
      status: "failed" as const,
      message: e instanceof Error ? `${provider.name} error: ${e.message}` : `${provider.name} failed to fulfil this order.`,
    };
  }

  const { data: updatedTx } = await admin.rpc("set_fulfillment_result", {
    p_transaction_id: tx.id,
    p_status: fulfillmentResult.status,
    p_receipt: {
      provider: provider.name,
      providerRef: fulfillmentResult.providerRef ?? null,
      message: fulfillmentResult.message ?? null,
      ...(fulfillmentResult.extra ?? {}),
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
  if (!(await isFeatureEnabled("gift_vouchers_enabled"))) throw new Error(FRIENDLY_ERRORS.feature_disabled);

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
  if (!(await isFeatureEnabled("p2p_transfers_enabled"))) throw new Error(FRIENDLY_ERRORS.feature_disabled);

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
