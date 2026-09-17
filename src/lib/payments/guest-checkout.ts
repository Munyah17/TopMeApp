import { createAdminClient } from "@/lib/supabase/server";
import { getFulfillmentProvider } from "@/lib/fulfillment";
import { sendEmail } from "@/lib/email/client";
import { paymentReceiptEmail } from "@/lib/email/templates";
import { logTransactionEvent } from "@/lib/transaction-events";
import type { ApiModuleSafe, Transaction } from "@/types/database";

/**
 * Called server-side only, after a gateway (Paynow/Stripe/EcoCash) confirms a
 * guest payment actually went through. Mirrors payService()'s tail — resolve
 * fulfillment, record the result, email a receipt — but for a transaction
 * with no profile behind it (see finalize_guest_payment RPC).
 */
export async function finalizeGuestCheckout(reference: string): Promise<Transaction> {
  const admin = createAdminClient();

  // Resolve the fulfillment provider BEFORE recording the payment so the
  // transaction carries the real provider name — hardcoding "simulated"
  // made live VitalPay attempts indistinguishable from demo runs.
  const [{ data: intent }, { data: apiModules }] = await Promise.all([
    admin.from("guest_checkout_intents").select("service_id").eq("reference", reference).single(),
    admin.from("api_modules_safe").select("*").eq("status", "active"),
  ]);
  const provider = getFulfillmentProvider(intent?.service_id ?? "", (apiModules as ApiModuleSafe[]) ?? []);

  const { data: txData, error } = await admin.rpc("finalize_guest_payment", {
    p_reference: reference,
    p_fulfillment_provider: provider.name,
  });
  if (error) throw new Error(error.message);
  const tx = txData as Transaction;
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference: tx.reference,
    eventType: "payment_confirmed",
    message: `Payment confirmed via ${tx.fulfillment_provider ?? "gateway"} — $${tx.amount.toFixed(2)} captured.`,
  });

  const { data: service } = await admin.from("services").select("name").eq("id", tx.service_id).single();
  const fulfillmentInput = {
    transactionId: tx.id,
    serviceId: tx.service_id,
    recipient: tx.recipient_identifier,
    extraValue: tx.extra_value,
    networkId: tx.network_id,
    amount: tx.amount,
  };
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference: tx.reference,
    eventType: "fulfillment_started",
    message: `Calling ${provider.name} to fulfil this order.`,
  });
  let fulfillmentResult;
  try {
    fulfillmentResult = await provider.fulfil(fulfillmentInput);
  } catch (e) {
    // Payment is already captured at this point — the honest thing to do is
    // record a real failure so it's visible for a manual retry/refund, not
    // fake a "simulated" success that hides that nothing was delivered.
    fulfillmentResult = {
      status: "failed" as const,
      message: e instanceof Error ? `${provider.name} error: ${e.message}` : `${provider.name} failed to fulfil this order.`,
    };
  }
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference: tx.reference,
    eventType: fulfillmentResult.status === "fulfilled" ? "fulfillment_success" : fulfillmentResult.status === "failed" ? "fulfillment_failed" : "fulfillment_started",
    message: fulfillmentResult.message || `${provider.name} returned status: ${fulfillmentResult.status}.`,
    meta: { provider: provider.name, providerRef: fulfillmentResult.providerRef ?? null },
  });

  const { data: updatedTx } = await admin.rpc("set_fulfillment_result", {
    p_transaction_id: tx.id,
    p_status: fulfillmentResult.status,
    p_receipt: {
      provider: provider.name,
      providerRef: fulfillmentResult.providerRef ?? null,
      message: fulfillmentResult.message ?? null,
    },
  });

  // Gateway payment is captured. A failed fulfilment goes to the refund
  // queue (guest checkouts have no wallet, so these are always manual —
  // see 2026-09-10-fulfilment-auto-refund).
  if (fulfillmentResult.status === "failed") {
    const { recordFailedFulfilmentRefund } = await import("@/lib/payments/refunds");
    await recordFailedFulfilmentRefund(admin, {
      transactionId: tx.id,
      reference: tx.reference,
      serviceName: (service as { name: string } | null)?.name ?? tx.service_id,
      reason: fulfillmentResult.message || `${provider.name} could not fulfil this order.`,
    });
    // Delivery failed — the refund path already emailed the customer. Sending
    // a success receipt on top of that is exactly the contradictory pair of
    // emails behind the 2026-09-17 airtime incident.
    return (updatedTx as Transaction) ?? tx;
  }

  const finalTx = (updatedTx as Transaction) ?? tx;

  if (finalTx.guest_email) {
    const { subject, html } = paymentReceiptEmail({
      serviceName: (service as { name: string } | null)?.name ?? finalTx.service_id,
      amount: finalTx.amount,
      reference: finalTx.reference,
      recipient: finalTx.recipient_identifier,
      date: new Date(finalTx.created_at).toLocaleString("en-GB"),
    });
    void sendEmail({ sender: "noreply", to: finalTx.guest_email, subject, html, replyTo: "accounts@topme.co.zw" });
  }

  return finalTx;
}

/** Marks a guest intent failed/cancelled — called server-side only. */
export async function failGuestCheckout(reference: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("fail_guest_checkout", { p_reference: reference });
  void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: "Payment did not go through — gateway declined or the customer cancelled." });
}
