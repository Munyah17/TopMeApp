"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTopupFee } from "@/lib/actions/settings";

// Friendly editor for app_settings.topup_fee — the customer-facing
// "Processing fee" on wallet top-ups and gateway surcharges. Two plain
// number inputs + Update; no JSON editing. The generic SettingsClient row
// for this key is filtered out on the page so this is the single edit path.
export function TopupFeeClient({ flat, pct }: { flat: number; pct: number }) {
  const router = useRouter();
  const [flatText, setFlatText] = useState(flat.toString());
  const [pctText, setPctText] = useState((pct * 100).toString());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const flatNum = parseFloat(flatText);
  const pctNum = parseFloat(pctText);
  const valid = Number.isFinite(flatNum) && flatNum >= 0 && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100;

  function save() {
    if (!valid) {
      setError("Enter a non-negative flat amount and a percentage between 0 and 100.");
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateTopupFee(flatNum, pctNum);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="card card-pad mb-2">
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Processing fee</div>
      <div className="muted mt-1" style={{ fontSize: 12 }}>
        Charged on wallet top-ups and when a customer pays by Paynow/Stripe/EcoCash instead of their wallet — a flat
        dollar amount plus a percentage of the amount. Applies everywhere immediately after saving.
      </div>
      <div className="row gap-2 mt-2" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 110, flex: 1 }}>
          <label className="field-label">Flat fee ($)</label>
          <input className="field" inputMode="decimal" value={flatText} onChange={(e) => setFlatText(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <div style={{ minWidth: 110, flex: 1 }}>
          <label className="field-label">Percentage (%)</label>
          <input className="field" inputMode="decimal" value={pctText} onChange={(e) => setPctText(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <button className="btn btn-secondary" disabled={pending || !valid} onClick={save}>
          {pending ? "Saving…" : "Update"}
        </button>
      </div>
      {valid && (
        <div className="muted mt-2" style={{ fontSize: 12 }}>
          e.g. a $20 top-up charges <strong>${((20 * pctNum) / 100 + flatNum).toFixed(2)}</strong> — customer pays $20,
          we collect ${(20 + (20 * pctNum) / 100 + flatNum).toFixed(2)}.
        </div>
      )}
      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="muted mt-2" style={{ color: "var(--success)" }}>
          Saved — new fee is live.
        </div>
      )}
    </div>
  );
}
