"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { adjustWallet } from "@/lib/actions/rectification";

export function WalletAdjustForm({ userId, currentBalance }: { userId: string; currentBalance?: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ applied: number; newBalance: number } | null>(null);

  const magnitude = parseFloat(amount);
  const valid = magnitude > 0 && !Number.isNaN(magnitude) && reason.trim().length > 0;

  return (
    <div className="card card-pad">
      <div className="section-title" style={{ fontSize: 14 }}>Top up / adjust wallet</div>
      <div className="muted mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Adds to (or removes from) this customer&apos;s TopMe balance directly — a goodwill credit, a
        correction, or a manual top-up. Every adjustment is logged to the audit trail.
      </div>

      <div className="row gap-2 mt-3">
        <button
          type="button"
          className="chip"
          onClick={() => setMode("credit")}
          style={mode === "credit" ? { background: "var(--green-50)", borderColor: "var(--green)", color: "var(--green)" } : undefined}
        >
          Top up (add)
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => setMode("debit")}
          style={mode === "debit" ? { background: "var(--error-bg)", borderColor: "var(--error)", color: "var(--error)" } : undefined}
        >
          Deduct
        </button>
      </div>

      <label className="field-label mt-3">Amount (USD)</label>
      <input
        className="field"
        placeholder="10.00"
        inputMode="decimal"
        value={amount}
        onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setResult(null); setError(null); }}
      />

      <label className="field-label mt-2">Reason</label>
      <input
        className="field"
        placeholder={mode === "credit" ? "e.g. manual top-up — paid cash in branch" : "e.g. reversing duplicate credit"}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error && <div className="mt-2" style={{ color: "var(--error)", fontSize: 13 }}>{error}</div>}
      {result && (
        <div className="row gap-2 mt-2" style={{ alignItems: "center", color: "var(--success)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="check" size={15} stroke={2.4} />
          <span>
            {result.applied >= 0 ? "Added " : "Removed "}{fmt(result.applied)} · new balance {fmt(result.newBalance)}
          </span>
        </div>
      )}

      <button
        className="btn btn-primary btn-block mt-3"
        disabled={pending || !valid}
        onClick={() => {
          setError(null);
          setResult(null);
          const signed = mode === "credit" ? magnitude : -magnitude;
          startTransition(async () => {
            try {
              const r = await adjustWallet(userId, signed, reason.trim());
              setResult({ applied: r.applied, newBalance: r.newBalance });
              setAmount("");
              setReason("");
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not adjust the balance.");
            }
          });
        }}
      >
        {pending
          ? "Applying…"
          : mode === "credit"
            ? `Top up${magnitude > 0 ? ` ${fmt(magnitude)}` : ""}`
            : `Deduct${magnitude > 0 ? ` ${fmt(magnitude)}` : ""}`}
      </button>

      {currentBalance !== undefined && (
        <div className="muted mt-2" style={{ fontSize: 11.5, textAlign: "center" }}>
          Current balance {fmt(currentBalance)}
        </div>
      )}
    </div>
  );
}
