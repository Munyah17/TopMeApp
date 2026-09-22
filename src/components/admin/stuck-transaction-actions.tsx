"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAcknowledgeTransaction, adminDeleteTransaction, adminSetFulfillmentStatus } from "@/lib/actions/rectification";

// Inline triage for each stuck transaction row in the Operations Center —
// same pattern as StuckPaymentActions for top-ups/guest checkouts.
export function StuckTransactionActions({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't do that.");
      }
    });
  }

  const btn = { height: 28, padding: "0 10px", fontSize: 11.5 } as const;

  return (
    <div style={{ marginTop: 6 }}>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          style={btn}
          disabled={pending}
          title="Dismiss from this list without changing its status"
          onClick={() => run(() => adminAcknowledgeTransaction(transactionId))}
        >
          Mark read
        </button>
        <button
          className="btn btn-ghost"
          style={btn}
          disabled={pending}
          onClick={() => run(() => adminSetFulfillmentStatus(transactionId, "pending"))}
        >
          Pending
        </button>
        <button
          className="btn btn-ghost"
          style={{ ...btn, color: "var(--success)" }}
          disabled={pending}
          onClick={() => {
            if (!confirm("Mark this transaction as completed? Only do this if you've confirmed the service was actually delivered.")) return;
            run(() => adminSetFulfillmentStatus(transactionId, "fulfilled"));
          }}
        >
          Completed
        </button>
        <button
          className="btn btn-ghost"
          style={{ ...btn, color: "var(--error)" }}
          disabled={pending}
          onClick={() => {
            if (!confirm("Permanently delete this transaction? This does NOT refund anyone and can't be undone. Continue?")) return;
            run(() => adminDeleteTransaction(transactionId));
          }}
        >
          Delete
        </button>
      </div>
      {error && <div style={{ color: "var(--error)", fontSize: 11, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
