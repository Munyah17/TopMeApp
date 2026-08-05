"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustWallet } from "@/lib/actions/rectification";

export function WalletAdjustForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const parsed = parseFloat(amount);

  return (
    <div className="card card-pad">
      <div className="section-title" style={{ fontSize: 14 }}>
        Adjust wallet balance
      </div>
      <div className="muted mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
        A goodwill credit or correction not tied to one specific transaction. Use a negative amount to debit.
        Logged to the audit trail either way.
      </div>

      <label className="field-label mt-3">Amount (use - for a debit)</label>
      <input className="field" placeholder="5.00 or -5.00" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.-]/g, ""))} />

      <label className="field-label mt-2">Reason</label>
      <input className="field" placeholder="e.g. goodwill credit for delivery failure on TPM-1234567" value={reason} onChange={(e) => setReason(e.target.value)} />

      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      {message && (
        <div className="muted mt-2" style={{ color: "var(--success)" }}>
          {message}
        </div>
      )}

      <button
        className="btn btn-primary btn-block mt-3"
        disabled={pending || !(parsed !== 0 && !Number.isNaN(parsed)) || !reason.trim()}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            try {
              await adjustWallet(userId, parsed, reason);
              setMessage("Balance updated.");
              setAmount("");
              setReason("");
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not adjust balance.");
            }
          });
        }}
      >
        {pending ? "Applying…" : "Apply adjustment"}
      </button>
    </div>
  );
}
