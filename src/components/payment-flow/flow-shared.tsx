"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
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
    <button
      type="button"
      className="tap"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        flex: "1 1 100px",
        padding: "16px 12px",
        borderRadius: 14,
        textAlign: "center",
        cursor: "pointer",
        font: "inherit",
        border: `1px solid ${selected ? "var(--green)" : "var(--border)"}`,
        background: selected ? "var(--green-50)" : "var(--surface)",
        boxShadow: selected ? "0 0 0 3px rgba(0, 200, 83, 0.12)" : "none",
        transition: "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          margin: "0 auto 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: network.logo_url ? "var(--surface)" : network.color,
          border: network.logo_url ? "1px solid var(--border)" : "none",
          color: "#fff",
          fontWeight: 800,
          fontSize: 16,
        }}
      >
        {network.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded operator logo, arbitrary host
          <img
            src={network.logo_url}
            alt={network.name}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          network.name.slice(0, 1)
        )}
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{network.name}</div>
    </button>
  );
}

export type PaymentMethod = "wallet" | GuestGateway;

const METHOD_STYLES: Record<PaymentMethod, { label: string; background: string; color: string; icon: string }> = {
  wallet: { label: "Pay With Wallet Balance", background: "var(--green)", color: "#fff", icon: "wallet" },
  paynow: { label: "Pay With Paynow", background: "#155EAB", color: "#fff", icon: "lock" },
  ecocash: { label: "Pay With Ecocash Instant", background: "#E4032E", color: "#fff", icon: "phone" },
  stripe: { label: "Pay With Stripe", background: "#635BFF", color: "#fff", icon: "smartphone" },
};

export type PaymentBanners = Partial<Record<GuestGateway, string>>;

// EcoCash Instant is hidden from checkout — ECOCASH_USERNAME/BASE_URL are
// still sandbox-only (no live merchant account yet), so every real
// customer who picked it was guaranteed a failed payment attempt. This is
// the one place to flip it back on: add "ecocash" back to the array below
// once EcoCashUSERNAME/PASSWORD/BASE_URL are switched to live production
// values in Vercel's env vars. The type, the backend RPC path, and
// startGuestCheckout's gateway handling are all untouched — this only
// changes what's offered in the UI.
const ENABLED_GATEWAYS: readonly GuestGateway[] = ["paynow", "stripe"];

// Payment method picker: wallet balance and whichever of the gateways
// above are enabled — none pre-selected, none the "default" with the
// others as fallbacks. A logged-in user picking a gateway still gets
// attributed to their account (not treated as an anonymous guest — see
// startGuestCheckout); a guest only ever sees the enabled gateways.
// Wallet is always the plain styled button (there's nothing to brand);
// gateways use an admin-uploaded banner image when one is set (see
// /admin/settings), falling back to the styled button until one is.
// Kept as its own component so bespoke flows don't have to duplicate the
// gateway logic, while payment handling itself never changes per-service.
export function PaymentMethodSection({
  showWallet,
  walletBalance,
  banners,
  method,
  setMethod,
  guestEmail,
  setGuestEmail,
  guestPhone,
  setGuestPhone,
}: {
  showWallet: boolean;
  walletBalance?: number;
  banners?: PaymentBanners;
  method: PaymentMethod | null;
  setMethod: (v: PaymentMethod) => void;
  guestEmail: string;
  setGuestEmail: (v: string) => void;
  guestPhone: string;
  setGuestPhone: (v: string) => void;
}) {
  const methods: PaymentMethod[] = showWallet ? ["wallet", ...ENABLED_GATEWAYS] : [...ENABLED_GATEWAYS];
  const isGateway = method !== null && method !== "wallet";

  return (
    <div className="mt-3">
      <label className="field-label">Pay with</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {methods.map((m) => {
          const style = METHOD_STYLES[m];
          const selected = method === m;
          const bannerUrl = m !== "wallet" ? banners?.[m] : undefined;

          if (bannerUrl) {
            return (
              <button
                key={m}
                type="button"
                className="tap"
                onClick={() => setMethod(m)}
                style={{
                  display: "block",
                  padding: 0,
                  border: "none",
                  borderRadius: 14,
                  overflow: "hidden",
                  cursor: "pointer",
                  boxShadow: selected ? "0 0 0 3px var(--green)" : "0 0 0 1px var(--border)",
                  lineHeight: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded banner, arbitrary host */}
                <img src={bannerUrl} alt={style.label} style={{ width: "100%", display: "block" }} />
              </button>
            );
          }

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
            {showWallet ? "We'll email and SMS your receipt." : "No account needed. Pay directly and we'll email and SMS your receipt."}
          </div>
          <label className="field-label">Email for receipt</label>
          <input className="field" type="email" placeholder="you@example.com" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />

          <label className="field-label mt-2">{method === "ecocash" ? "EcoCash Number" : "Phone (for SMS receipt)"}</label>
          <input className="field" placeholder="077 123 4567" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />

          <div className="muted mt-2" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="lock" size={13} stroke={2} /> Secured by {method === "paynow" ? "Paynow Zimbabwe" : method === "stripe" ? "Stripe" : "EcoCash"}
          </div>
        </>
      )}
    </div>
  );
}
