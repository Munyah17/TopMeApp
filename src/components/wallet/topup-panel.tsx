"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { startEcocashTopup, startPaynowTopup, startStripeTopup } from "@/lib/actions/wallet";
import { calculateTopupFee } from "@/lib/fees";

type Gateway = "paynow" | "stripe" | "ecocash";

const AMOUNT_CHIPS = [5, 10, 20, 50, 100];

export function TopupPanel({ userPhone }: { userPhone?: string | null }) {
  const router = useRouter();
  const [gateway, setGateway] = useState<Gateway>("paynow");
  const [amount, setAmount] = useState<number | null>(20);
  const [customAmount, setCustomAmount] = useState("");
  const [phone, setPhone] = useState(userPhone || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ecocashPolling, setEcocashPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const amt = amount ?? (parseFloat(customAmount) || 0);
  const fee = calculateTopupFee(gateway, amt);
  const total = amt + fee;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (gateway === "paynow") {
        const { redirectUrl } = await startPaynowTopup(amt);
        window.location.href = redirectUrl;
        return;
      }
      if (gateway === "stripe") {
        const { redirectUrl } = await startStripeTopup(amt);
        window.location.href = redirectUrl;
        return;
      }
      if (gateway === "ecocash") {
        const { reference } = await startEcocashTopup(amt, phone);
        setEcocashPolling(true);
        pollRef.current = setInterval(async () => {
          const res = await fetch("/api/wallet/topup/ecocash/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference }),
          });
          const data = await res.json();
          if (data.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setEcocashPolling(false);
            router.refresh();
          } else if (data.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setEcocashPolling(false);
            setError("EcoCash payment was not approved.");
          }
        }, 3000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment.");
    } finally {
      setBusy(false);
    }
  }

  if (ecocashPolling) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0", textAlign: "center" }}>
        <div className="spinner-ring" />
        <div style={{ fontWeight: 700, marginTop: 20, fontSize: 15 }}>Approve on your phone</div>
        <div className="muted mt-1" style={{ maxWidth: 260 }}>
          We sent a USSD prompt to {phone}. Enter your EcoCash PIN to approve the ${total.toFixed(2)} top up.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row gap-2 mb-3">
        {(
          // EcoCash hidden here too — see the matching note in
          // flow-shared.tsx's ENABLED_GATEWAYS; same sandbox-only-keys
          // reason, same fix (add it back once EcoCash env vars are live).
          [
            { id: "paynow", label: "Paynow" },
            { id: "stripe", label: "Card (Stripe)" },
          ] as { id: Gateway; label: string }[]
        ).map((g) => (
          <div
            key={g.id}
            className={`chip tap ${gateway === g.id ? "selected" : ""}`}
            style={{ flex: 1, textAlign: "center" }}
            onClick={() => setGateway(g.id)}
          >
            {g.label}
          </div>
        ))}
      </div>

      <label className="field-label">Amount</label>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        {AMOUNT_CHIPS.map((c) => (
          <div
            key={c}
            className={`chip tap ${amount === c ? "selected" : ""}`}
            onClick={() => {
              setAmount(c);
              setCustomAmount("");
            }}
          >
            ${c}
          </div>
        ))}
      </div>
      <input
        className="field mt-2"
        placeholder="Custom amount"
        inputMode="decimal"
        value={customAmount}
        onChange={(e) => {
          setCustomAmount(e.target.value.replace(/[^0-9.]/g, ""));
          setAmount(null);
        }}
      />

      {gateway === "ecocash" && (
        <>
          <label className="field-label mt-2">EcoCash Number</label>
          <input className="field" placeholder="077 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </>
      )}

      {amt > 0 && (
        <div className="mt-3" style={{ fontSize: 13 }}>
          <div className="row between"><span className="muted">Added to wallet</span><span>${amt.toFixed(2)}</span></div>
          <div className="row between mt-1">
            <span className="muted">
              {gateway === "paynow" ? "Paynow" : gateway === "stripe" ? "Card" : "EcoCash"} processing fee
            </span>
            <span>${fee.toFixed(2)}</span>
          </div>
          <div className="row between mt-1" style={{ fontWeight: 700, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
            <span>You pay</span><span>${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      <button
        className="btn btn-primary btn-block mt-3"
        disabled={busy || !(amt > 0) || (gateway === "ecocash" && !phone)}
        onClick={submit}
      >
        {busy ? "Starting…" : `Pay $${total > 0 ? total.toFixed(2) : "0.00"}`}
      </button>
      <div className="muted mt-2" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="lock" size={13} stroke={2} /> Secured by {gateway === "paynow" ? "Paynow Zimbabwe" : gateway === "stripe" ? "Stripe" : "EcoCash"}
      </div>
    </div>
  );
}
