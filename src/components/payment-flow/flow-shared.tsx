"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { hexA } from "@/lib/data/catalog-helpers";
import type { GuestGateway } from "@/lib/actions/guest-payments";
import type { Network } from "@/types/database";

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{value}</span>
    </div>
  );
}

// A review-screen field the customer can fix without backing all the way up
// the step flow — matches the pencil-to-edit pattern from the reference UX.
export function EditableRow({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (next: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <div className="muted" style={{ marginBottom: 6 }}>
          {label}
        </div>
        <div className="row gap-2">
          <input
            className="field"
            autoFocus
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(draft);
                setEditing(false);
              }
            }}
          />
          <button
            className="btn btn-primary"
            style={{ height: 44, width: 44, padding: 0, flexShrink: 0 }}
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
          >
            <Icon name="check" size={16} stroke={2.4} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div className="muted">{label}</div>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{value || "—"}</div>
      </div>
      <button
        className="tap"
        style={{ background: "none", border: "none", color: "var(--text-faint)", padding: 6 }}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <Icon name="edit" size={15} stroke={2} />
      </button>
    </div>
  );
}

export function DenomTile({ amount, selected, onClick }: { amount: number; selected: boolean; onClick: () => void }) {
  return (
    <div
      className="tap"
      onClick={onClick}
      style={{
        flex: "1 1 90px",
        padding: "14px 10px",
        borderRadius: 14,
        textAlign: "center",
        cursor: "pointer",
        border: `1.5px solid ${selected ? "var(--green)" : "var(--border)"}`,
        background: selected ? "var(--green-50)" : "var(--surface)",
        boxShadow: selected ? "0 0 0 3px rgba(0,200,83,0.14)" : "none",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16, color: selected ? "var(--green-600)" : "var(--text)" }}>${amount}</div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        USD {amount.toFixed(2)}
      </div>
    </div>
  );
}

export function NetworkTile({ network, selected, onClick }: { network: Network; selected: boolean; onClick: () => void }) {
  return (
    <div
      className="tap"
      onClick={onClick}
      style={{
        flex: "1 1 100px",
        padding: "16px 10px",
        borderRadius: 16,
        textAlign: "center",
        cursor: "pointer",
        border: `1.5px solid ${selected ? network.color : "var(--border)"}`,
        background: selected ? hexA(network.color, 0.08) : "var(--surface)",
        boxShadow: selected ? `0 0 0 3px ${hexA(network.color, 0.14)}` : "none",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          margin: "0 auto 8px",
          background: network.color,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 15,
        }}
      >
        {network.name.slice(0, 1)}
      </div>
      <div style={{ fontWeight: 700, fontSize: 12.5 }}>{network.name}</div>
    </div>
  );
}

export type PaymentMethod = "wallet" | GuestGateway;

const METHOD_STYLES: Record<PaymentMethod, { label: string; background: string; color: string; icon: string }> = {
  wallet: { label: "Pay With Wallet Balance", background: "var(--green)", color: "#fff", icon: "wallet" },
  paynow: { label: "Pay With Paynow", background: "#155EAB", color: "#fff", icon: "lock" },
  ecocash: { label: "Pay With Ecocash Instant", background: "#E4032E", color: "#fff", icon: "phone" },
  stripe: { label: "Pay With Stripe", background: "#635BFF", color: "#fff", icon: "smartphone" },
};

// Payment method picker: wallet balance, Paynow, EcoCash Instant, and
// Stripe are four equal options — none pre-selected, none the "default"
// with the others as fallbacks. A logged-in user picking a gateway still
// gets attributed to their account (not treated as an anonymous guest —
// see startGuestCheckout); a guest only ever sees the 3 gateways. Kept as
// its own component so bespoke flows don't have to duplicate the gateway
// logic, while payment handling itself never changes per-service.
export function PaymentMethodSection({
  showWallet,
  walletBalance,
  method,
  setMethod,
  guestEmail,
  setGuestEmail,
  guestPhone,
  setGuestPhone,
}: {
  showWallet: boolean;
  walletBalance?: number;
  method: PaymentMethod | null;
  setMethod: (v: PaymentMethod) => void;
  guestEmail: string;
  setGuestEmail: (v: string) => void;
  guestPhone: string;
  setGuestPhone: (v: string) => void;
}) {
  const methods: PaymentMethod[] = showWallet ? ["wallet", "paynow", "ecocash", "stripe"] : ["paynow", "ecocash", "stripe"];
  const isGateway = method !== null && method !== "wallet";

  return (
    <div className="mt-3">
      <label className="field-label">Pay with</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {methods.map((m) => {
          const style = METHOD_STYLES[m];
          const selected = method === m;
          return (
            <button
              key={m}
              type="button"
              className="tap"
              onClick={() => setMethod(m)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderRadius: 14,
                border: "none",
                cursor: "pointer",
                background: style.background,
                color: style.color,
                fontWeight: 800,
                fontSize: 14,
                boxShadow: selected ? "0 0 0 3px rgba(0,0,0,0.18) inset" : "none",
                opacity: selected ? 1 : 0.88,
              }}
            >
              <Icon name={style.icon} size={18} stroke={2} />
              <span style={{ flex: 1, textAlign: "left" }}>{style.label}</span>
              {m === "wallet" && typeof walletBalance === "number" && (
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>${walletBalance.toFixed(2)}</span>
              )}
              {selected && <Icon name="check" size={16} stroke={2.4} />}
            </button>
          );
        })}
      </div>

      {isGateway && (
        <>
          <div className="muted mt-3 mb-2" style={{ fontSize: 13 }}>
            {showWallet ? "We'll email your receipt." : "No account needed. Pay directly and we'll email your receipt."}
          </div>
          <label className="field-label">Email for receipt</label>
          <input className="field" type="email" placeholder="you@example.com" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />

          {method === "ecocash" && (
            <>
              <label className="field-label mt-2">EcoCash Number</label>
              <input className="field" placeholder="077 123 4567" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
            </>
          )}

          <div className="muted mt-2" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="lock" size={13} stroke={2} /> Secured by {method === "paynow" ? "Paynow Zimbabwe" : method === "stripe" ? "Stripe" : "EcoCash"}
          </div>
        </>
      )}
    </div>
  );
}
