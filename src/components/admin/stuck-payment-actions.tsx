"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminForceCheckGuestCheckout, adminForceCheckTopup, adminMarkPendingFailed } from "@/lib/actions/admin";

// Attached to each stuck top-up / guest checkout row in the Operations
// Center — was previously just a list with nothing to click.
export function StuckPaymentActions({ kind, reference, provider }: { kind: "topup" | "guest"; reference: string; provider: string }) {
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

  return (
    <div style={{ marginTop: 6 }}>
      <div className="row gap-2">
        {provider === "paynow" && (
          <button
            className="btn btn-ghost"
            style={{ height: 28, padding: "0 10px", fontSize: 11.5 }}
            disabled={pending}
            onClick={() => run(() => (kind === "topup" ? adminForceCheckTopup(reference) : adminForceCheckGuestCheckout(reference)))}
          >
            Check now
          </button>
        )}
        <button
          className="btn btn-ghost"
          style={{ height: 28, padding: "0 10px", fontSize: 11.5, color: "var(--error)" }}
          disabled={pending}
          onClick={() => {
            if (!confirm("Only do this once you've confirmed with the gateway's own dashboard that no money was actually taken. If money WAS taken, use Refunds instead of this button — marking it failed here does not refund anyone. Continue?")) return;
            run(() => adminMarkPendingFailed(kind, reference));
          }}
        >
          Mark failed
        </button>
      </div>
      {error && <div style={{ color: "var(--error)", fontSize: 11, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
