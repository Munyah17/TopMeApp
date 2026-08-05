"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getFulfillmentProvider } from "@/lib/fulfillment";
import type { Transaction } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  transaction_not_found: "That transaction couldn't be found.",
  guest_refund_not_supported: "This was a guest checkout — there's no TopMe wallet to refund into. Use the gateway's own dashboard (Paynow/Stripe/EcoCash) for a real refund.",
  already_rectified: "This transaction has already been refunded.",
};

function friendlyError(message: string) {
  const key = Object.keys(FRIENDLY_ERRORS).find((k) => message.includes(k));
  return key ? FRIENDLY_ERRORS[key] : "Something went wrong. Please try again.";
}

function revalidate(transactionId: string) {
  revalidatePath("/admin/operations");
  revalidatePath("/admin/transactions");
  revalidatePath(`/admin/transactions/${transactionId}`);
}

export async function forceFulfilTransaction(transactionId: string, note: string) {
  await requirePermission("transactions.rectify");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_force_fulfil_transaction", {
    p_transaction_id: transactionId,
    p_note: note || null,
  });
  if (error) throw new Error(friendlyError(error.message));
  revalidate(transactionId);
  return data as Transaction;
}

export async function refundTransaction(transactionId: string, note: string) {
  await requirePermission("transactions.rectify");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_refund_transaction", {
    p_transaction_id: transactionId,
    p_note: note || null,
  });
  if (error) throw new Error(friendlyError(error.message));
  revalidate(transactionId);
  return data as Transaction;
}

// Re-invokes the same real fulfillment call payService/finalizeGuestCheckout
// make originally — for a transaction that's stuck pending/failed because
// the provider call itself failed or never ran (e.g. today's Paynow webhook
// incident). Not an RPC: needs the same active-modules lookup and provider
// abstraction the original payment used.
export async function retryFulfillment(transactionId: string, note: string) {
  const { user } = await requirePermission("transactions.rectify");
  const admin = createAdminClient();

  const { data: tx, error: txError } = await admin.from("transactions").select("*").eq("id", transactionId).single();
  if (txError || !tx) throw new Error("That transaction couldn't be found.");
  const transaction = tx as Transaction;

  const { data: apiModules } = await admin.from("api_modules_safe").select("*").eq("status", "active");
  const provider = getFulfillmentProvider(transaction.service_id, apiModules ?? []);

  const fulfillmentResult = await provider.fulfil({
    transactionId: transaction.id,
    serviceId: transaction.service_id,
    recipient: transaction.recipient_identifier,
    extraValue: transaction.extra_value,
    networkId: transaction.network_id,
    amount: transaction.amount,
  });

  const { data: updated } = await admin.rpc("set_fulfillment_result", {
    p_transaction_id: transaction.id,
    p_status: fulfillmentResult.status,
    p_receipt: {
      ...(transaction.receipt as Record<string, unknown>),
      provider: provider.name,
      providerRef: fulfillmentResult.providerRef ?? null,
      message: fulfillmentResult.message ?? null,
      retried_by: user.id,
      retried_note: note || null,
      retried_at: new Date().toISOString(),
    },
  });

  await admin.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "transaction.retry_fulfillment",
    target_table: "transactions",
    target_id: transactionId,
    meta: { note, result_status: fulfillmentResult.status },
  });

  revalidate(transactionId);
  return (updated as Transaction) ?? transaction;
}

export async function adjustWallet(userId: string, amount: number, reason: string) {
  await requirePermission("wallet.adjust");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_adjust_wallet", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw new Error(friendlyError(error.message));
  revalidatePath(`/admin/users/${userId}`);
  return data;
}
