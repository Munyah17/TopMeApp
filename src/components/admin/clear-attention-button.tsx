"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminClearAttentionQueue } from "@/lib/actions/rectification";

// "Clear all" on the dashboard attention alert — dismisses every queued item
// (stuck transactions, top-ups, guest checkouts) without changing statuses.
export function ClearAttentionButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ height: 28, padding: "0 10px", fontSize: 11.5 }}
        disabled={pending}
        title="Dismiss everything in the attention queue without changing statuses"
        onClick={() => {
          if (!confirm("Clear every item in the attention queue? Their statuses stay unchanged — they just stop showing here.")) return;
          setError(null);
          startTransition(async () => {
            try {
              await adminClearAttentionQueue();
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't clear the queue.");
            }
          });
        }}
      >
        {pending ? "Clearing…" : "Clear all"}
      </button>
      {error && <div style={{ color: "var(--error)", fontSize: 11, marginTop: 4 }}>{error}</div>}
    </>
  );
}
