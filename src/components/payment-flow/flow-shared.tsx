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

// Guest checkout method picker — identical mechanics to the generic
// PaymentFlow's guest step (same gateways, same fields). Kept as its own
// component so bespoke flows don't have to duplicate the gateway logic,
// while payment handling itself never changes per-service.
export function GuestPaySection({
  guestEmail,
  setGuestEmail,
  guestPhone,
  setGuestPhone,
  gateway,
  setGateway,
}: {
  guestEmail: string;
  setGuestEmail: (v: string) => void;
  guestPhone: string;
  setGuestPhone: (v: string) => void;
  gateway: GuestGateway;
  setGateway: (v: GuestGateway) => void;
}) {
  return (
    <div className="mt-3">
      <div className="muted mb-2" style={{ fontSize: 13 }}>
        No account needed. Pay directly and we&apos;ll email your receipt.
      </div>
      <label className="field-label">Email for receipt</label>
      <input className="field" type="email" placeholder="you@example.com" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />

      <label className="field-label mt-2">Pay with</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(
          [
            { id: "paynow", label: "Paynow" },
            { id: "stripe", label: "Card" },
            { id: "ecocash", label: "EcoCash" },
          ] as { id: GuestGateway; label: string }[]
        ).map((g) => (
          <label
            key={g.id}
            className="card tap row gap-2"
            style={{ padding: "12px 14px", cursor: "pointer", borderColor: gateway === g.id ? "var(--green)" : "var(--border)" }}
          >
            <input type="radio" checked={gateway === g.id} onChange={() => setGateway(g.id)} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{g.label}</span>
          </label>
        ))}
      </div>

      {gateway === "ecocash" && (
        <>
          <label className="field-label mt-2">EcoCash Number</label>
          <input className="field" placeholder="077 123 4567" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
        </>
      )}

      <div className="muted mt-2" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="lock" size={13} stroke={2} /> Secured by {gateway === "paynow" ? "Paynow Zimbabwe" : gateway === "stripe" ? "Stripe" : "EcoCash"}
      </div>
    </div>
  );
}
