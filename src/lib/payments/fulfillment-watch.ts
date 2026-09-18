import { getTransactionFulfillment } from "@/lib/actions/payments";

export type FulfillmentWatchOutcome = "fulfilled" | "failed" | "timeout";

// Polls getTransactionFulfillment() until the provider's webhook lands a
// final verdict on the transaction. VitalPay airtime/bills are async —
// payService returns fulfillment_status "pending" and the real result
// arrives seconds later via /api/vitalpay/webhook. Showing "successful" at
// that point is how customers saw a success screen for a purchase that was
// then refunded, so every wallet-paid flow waits here instead.
//
// Returns a cancel function (clear on unmount). "timeout" means the webhook
// is taking unusually long — the UI should then say "still processing,
// we'll notify you" rather than guessing either way.
export function watchFulfillment(
  reference: string,
  onDone: (outcome: FulfillmentWatchOutcome) => void,
  { intervalMs = 3000, timeoutMs = 90_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): () => void {
  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      const status = await getTransactionFulfillment(reference);
      if (status === "fulfilled" || status === "simulated") {
        clearInterval(timer);
        onDone("fulfilled");
      } else if (status === "failed") {
        clearInterval(timer);
        onDone("failed");
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        onDone("timeout");
      }
      // null / "pending" → keep polling
    } catch {
      // A transient action error must not break the watch — keep polling.
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
