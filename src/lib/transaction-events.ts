import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Real, per-transaction "what actually happened" log — see
// supabase/migrations/2026-08-09-transaction-events.sql. Called at every
// meaningful payment/fulfillment lifecycle step, always with the admin
// client (RLS grants no client insert). Fire-and-forget: a logging failure
// must never break the payment/fulfillment flow that triggered it.
export type TransactionEventType =
  | "payment_confirmed"
  | "payment_failed"
  | "fulfillment_started"
  | "fulfillment_success"
  | "fulfillment_failed"
  | "webhook_received"
  | "refund"
  | "refund_error";

export async function logTransactionEvent(
  admin: SupabaseClient,
  entry: { transactionId?: string | null; reference?: string | null; eventType: TransactionEventType; message: string; meta?: Record<string, unknown> }
) {
  try {
    await admin.from("transaction_events").insert({
      transaction_id: entry.transactionId ?? null,
      reference: entry.reference ?? null,
      event_type: entry.eventType,
      message: entry.message,
      meta: entry.meta ?? {},
    });
  } catch (e) {
    console.error(`[transaction-events] failed to log "${entry.eventType}" for ${entry.reference ?? entry.transactionId}:`, e instanceof Error ? e.message : e);
  }
}
