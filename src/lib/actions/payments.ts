"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getFulfillmentProvider } from "@/lib/fulfillment";
import type { ApiModuleSafe, Service, Transaction } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  insufficient_funds: "Your wallet balance is too low for this payment. Top up and try again.",
  not_authenticated: "Please log in again to continue.",
  wallet_not_found: "We couldn't find your wallet. Please contact support.",
  invalid_amount: "Enter a valid amount.",
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

  // Resolve fulfillment (simulated by default, VitalPay once a superadmin activates it).
  const admin = createAdminClient();
  const { data: apiModule } = await admin
    .from("api_modules_safe")
    .select("*")
    .eq("provider", "vitalpay")
    .maybeSingle();

  const provider = getFulfillmentProvider((apiModule as ApiModuleSafe) ?? undefined);
  let fulfillmentResult;
  try {
    fulfillmentResult = await provider.fulfil({
      transactionId: tx.id,
      serviceId: input.serviceId,
      recipient: input.recipient,
      extraValue: input.extraValue,
      networkId: input.networkId,
      amount: input.amount,
    });
  } catch {
    fulfillmentResult = { status: "failed" as const, message: "Fulfillment provider unavailable." };
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

  return (updatedTx as Transaction) ?? tx;
}

export async function sendGiftVoucher(receiverPhone: string, amount: number, senderPhone?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("wallet_gift_send", {
    p_receiver_phone: receiverPhone,
    p_amount: amount,
    p_sender_phone: senderPhone ?? null,
  });
  if (error) throw new Error(friendlyError(error.message));

  revalidatePath("/wallet");
  revalidatePath("/home");
  return data;
}
