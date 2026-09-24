"use server";

import { revalidateAdminPath } from "@/lib/actions/admin-cache";
import { logAdminAction } from "@/lib/actions/audit";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getFulfillmentProvider } from "@/lib/fulfillment";
import { logTransactionEvent } from "@/lib/transaction-events";
import type { Transaction } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  forbidden: "You don't have permission to do that. (Your account needs the wallet.adjust / transactions.rectify permission.)",
  not_authenticated: "Your session expired — sign in again and retry.",
  transaction_not_found: "That transaction couldn't be found.",
  wallet_not_found: "That customer doesn't have a wallet yet.",
  invalid_amount: "Enter an amount other than zero.",
  insufficient_funds: "That deduction would take the balance below zero.",
  guest_refund_not_supported: "This was a guest checkout — there's no TopMe wallet to refund into. Use the gateway's own dashboard (Paynow/Stripe/EcoCash) for a real refund.",
  already_rectified: "This transaction has already been refunded.",
  already_refunded: "This transaction has already been refunded.",
  refund_not_found: "That refund request couldn't be found.",
  already_resolved: "This refund has already been resolved.",
  not_approved: "This refund isn't in the approved state.",
};

function friendlyError(message: string) {
  const key = Object.keys(FRIENDLY_ERRORS).find((k) => message.includes(k));
  // Fall through to the raw DB message rather than a vague "something went
  // wrong" — staff tools need to show what actually failed.
  return key ? FRIENDLY_ERRORS[key] : `Couldn't apply that: ${message}`;
}

function revalidate(transactionId: string) {
  revalidateAdminPath("/operations");
  revalidateAdminPath("/transactions");
  revalidateAdminPath(`/transactions/${transactionId}`);
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

  void logTransactionEvent(admin, {
    transactionId: transaction.id,
    reference: transaction.reference,
    eventType: "fulfillment_started",
    message: `Staff retry: calling ${provider.name} again${note ? ` — ${note}` : ""}.`,
  });

  let fulfillmentResult;
  try {
    fulfillmentResult = await provider.fulfil({
      transactionId: transaction.id,
      serviceId: transaction.service_id,
      recipient: transaction.recipient_identifier,
      extraValue: transaction.extra_value,
      networkId: transaction.network_id,
      amount: transaction.amount,
    });
  } catch (e) {
    const message = e instanceof Error ? `${provider.name} error: ${e.message}` : `${provider.name} failed to fulfil this order.`;
    void logTransactionEvent(admin, { transactionId: transaction.id, reference: transaction.reference, eventType: "fulfillment_failed", message });
    throw new Error(message);
  }
  void logTransactionEvent(admin, {
    transactionId: transaction.id,
    reference: transaction.reference,
    eventType: fulfillmentResult.status === "fulfilled" ? "fulfillment_success" : fulfillmentResult.status === "failed" ? "fulfillment_failed" : "fulfillment_started",
    message: fulfillmentResult.message || `${provider.name} returned status: ${fulfillmentResult.status}.`,
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

  // Retry failed again — make sure a refund request exists for it (no-op if
  // one already does).
  if (fulfillmentResult.status === "failed") {
    const { data: svc } = await admin.from("services").select("name").eq("id", transaction.service_id).single();
    const { recordFailedFulfilmentRefund } = await import("@/lib/payments/refunds");
    await recordFailedFulfilmentRefund(admin, {
      transactionId: transaction.id,
      reference: transaction.reference,
      serviceName: (svc as { name: string } | null)?.name ?? transaction.service_id,
      reason: fulfillmentResult.message || `${provider.name} could not fulfil this order.`,
      origin: "staff",
    });
  }

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

// Approve (pay) or reject a queued refund. A wallet-backed approval credits
// the customer's wallet immediately; a guest approval just marks it
// "approved" — staff then settle it on a rail and call markRefundSettled.
export async function decideRefundRequest(refundId: string, approve: boolean, note: string) {
  await requirePermission("transactions.rectify");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_refund_request", {
    p_refund_id: refundId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw new Error(friendlyError(error.message));
  revalidateAdminPath("/refunds");
  revalidateAdminPath("/operations");
  return data;
}

// Guest refunds only: mark an approved request as settled after paying the
// customer out of band (EcoCash / bank / cash).
export async function markRefundSettled(refundId: string, note: string) {
  await requirePermission("transactions.rectify");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_refund_settled", {
    p_refund_id: refundId,
    p_note: note || null,
  });
  if (error) throw new Error(friendlyError(error.message));
  revalidateAdminPath("/refunds");
  return data;
}

// ── Operations Center row actions ──────────────────────
// The stuck-transactions list previously only linked to the detail page;
// these let staff triage an item inline.

// "Completed" delegates to the guarded RPC (writes receipt + audit, refuses
// to fulfil something already refunded). "Pending" is a plain status reset
// for items wrongly marked failed.
export async function adminSetFulfillmentStatus(transactionId: string, status: "pending" | "fulfilled") {
  const { user } = await requirePermission("transactions.rectify");
  if (status === "fulfilled") {
    return forceFulfilTransaction(transactionId, "Marked completed from Operations Center.");
  }
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("transactions")
    .update({ fulfillment_status: "pending" })
    .eq("id", transactionId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(friendlyError(error.message));
  if (!updated) throw new Error("That transaction couldn't be found.");
  await logAdminAction(admin, { actorId: user.id, action: "transaction.set_pending", targetTable: "transactions", targetId: transactionId });
  revalidate(transactionId);
}

// "Mark read": dismisses the row from the attention queue without touching
// fulfilment. The flag lives inside `receipt` so no schema change is needed
// and the detail page still shows the real status.
export async function adminAcknowledgeTransaction(transactionId: string) {
  const { user } = await requirePermission("transactions.rectify");
  const admin = createAdminClient();
  const { data: tx, error: txError } = await admin.from("transactions").select("receipt").eq("id", transactionId).single();
  if (txError || !tx) throw new Error("That transaction couldn't be found.");
  const { error } = await admin
    .from("transactions")
    .update({
      receipt: {
        ...((tx.receipt as Record<string, unknown>) ?? {}),
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
      },
    })
    .eq("id", transactionId);
  if (error) throw new Error(friendlyError(error.message));
  await logAdminAction(admin, { actorId: user.id, action: "transaction.acknowledge", targetTable: "transactions", targetId: transactionId });
  revalidate(transactionId);
}

// Hard delete — for junk/test rows. transaction_events and refund_requests
// cascade; anything else referencing the row (guest checkout intents,
// insurance records) blocks the delete and surfaces a friendly error.
export async function adminDeleteTransaction(transactionId: string) {
  const { user } = await requirePermission("transactions.rectify");
  const admin = createAdminClient();
  const { data: tx } = await admin.from("transactions").select("reference").eq("id", transactionId).single();
  if (!tx) throw new Error("That transaction couldn't be found.");
  // Audit BEFORE the delete — the row is gone after, the log isn't.
  await logAdminAction(admin, {
    actorId: user.id,
    action: "transaction.delete",
    targetTable: "transactions",
    targetId: transactionId,
    meta: { reference: tx.reference },
  });
  const { error } = await admin.from("transactions").delete().eq("id", transactionId);
  if (error) {
    if (error.code === "23503") {
      throw new Error("This transaction is linked to a checkout or insurance record — mark it read instead of deleting.");
    }
    throw new Error(friendlyError(error.message));
  }
  revalidateAdminPath("/operations");
  revalidateAdminPath("/transactions");
}

// "Clear all" on the dashboard alert: dismisses every item currently in the
// attention queue in one shot. Transactions get receipt.acknowledged_at (same
// flag as "Mark read"); pending top-up / guest-checkout intents get
// meta.cleared_at. Nothing's status is changed — this only hides them from
// the queue, so anything that later settles still reconciles normally.
export async function adminClearAttentionQueue() {
  const { user } = await requirePermission("transactions.rectify");
  const admin = createAdminClient();
  const graceWindow = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  let cleared = 0;

  const { data: txs } = await admin
    .from("transactions")
    .select("id, receipt")
    .in("fulfillment_status", ["pending", "failed"])
    .is("receipt->>acknowledged_at", null)
    .lte("created_at", graceWindow)
    .limit(50);
  for (const tx of txs ?? []) {
    const { error } = await admin
      .from("transactions")
      .update({
        receipt: {
          ...((tx.receipt as Record<string, unknown>) ?? {}),
          acknowledged_by: user.id,
          acknowledged_at: now,
        },
      })
      .eq("id", tx.id);
    if (!error) cleared++;
  }

  for (const table of ["topup_intents", "guest_checkout_intents"] as const) {
    const { data: intents } = await admin
      .from(table)
      .select("id, meta")
      .eq("status", "pending")
      .is("meta->>cleared_at", null)
      .lte("created_at", graceWindow)
      .limit(50);
    for (const intent of intents ?? []) {
      const { error } = await admin
        .from(table)
        .update({
          meta: {
            ...((intent.meta as Record<string, unknown>) ?? {}),
            cleared_by: user.id,
            cleared_at: now,
          },
        })
        .eq("id", intent.id);
      if (!error) cleared++;
    }
  }

  await logAdminAction(admin, {
    actorId: user.id,
    action: "attention_queue.clear_all",
    targetTable: "transactions",
    targetId: "bulk",
    meta: { cleared },
  });
  revalidateAdminPath("/operations");
  revalidateAdminPath("");
  return cleared;
}

export async function adjustWallet(userId: string, amount: number, reason: string) {
  await requirePermission("wallet.adjust");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_adjust_wallet", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw new Error(friendlyError(error.message));

  const admin = createAdminClient();
  const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", userId).single();

  revalidateAdminPath(`/users/${userId}`);
  revalidateAdminPath("/users");
  return { newBalance: (wallet?.balance as number) ?? 0, applied: amount };
}
