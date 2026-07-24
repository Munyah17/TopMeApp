"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { startEcocashTopup, startPaynowTopup, startStripeTopup } from "@/lib/actions/wallet";

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
          We sent a USSD prompt to {phone}. Enter your EcoCash PIN to approve the ${amt.toFixed(2)} top up.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row gap-2 mb-3">
        {(
          [
            { id: "paynow", label: "Paynow" },
            { id: "stripe", label: "Card (Stripe)" },
            { id: "ecocash", label: "EcoCash" },
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
        {busy ? "Starting…" : `Top up $${amt > 0 ? amt.toFixed(2) : "0.00"}`}
      </button>
      <div className="muted mt-2" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="lock" size={13} stroke={2} /> Secured by {gateway === "paynow" ? "Paynow Zimbabwe" : gateway === "stripe" ? "Stripe" : "EcoCash"}
      </div>
    </div>
  );
}
