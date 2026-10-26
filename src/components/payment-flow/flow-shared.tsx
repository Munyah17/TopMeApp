"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { textOn } from "@/lib/data/catalog-helpers";
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
        boxShadow: selected ? "0 0 0 3px rgba(5,150,105,0.14)" : "none",
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
  const hasLogo = !!network.logo_url;
  return (
    <button
      type="button"
      className="tap"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={network.name}
      style={{
        flex: "1 1 100px",
        minHeight: 88,
        padding: hasLogo ? "14px 16px" : "16px 12px",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: hasLogo ? 0 : 8,
        cursor: "pointer",
        font: "inherit",
        border: `1px solid ${selected ? "var(--green)" : "var(--border)"}`,
        background: selected ? "var(--green-50)" : "var(--surface)",
        boxShadow: selected ? "0 0 0 3px rgba(5, 150, 105, 0.12)" : "none",
        transition: "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
      }}
    >
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded operator logo, own Supabase Storage
        <img
          src={network.logo_url!}
          alt={network.name}
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: 44, objectFit: "contain" }}
        />
      ) : (
        <>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: network.color,
              color: textOn(network.color),
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            {network.name.slice(0, 1)}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{network.name}</div>
        </>
      )}
    </button>
  );
}

export type PaymentMethod = "wallet" | GuestGateway;

const METHOD_STYLES: Record<PaymentMethod, { label: string; sub: string; tint: string; fg: string; icon: string }> = {
  wallet: { label: "TopMe Wallet", sub: "Pay instantly from your balance", tint: "var(--green-50)", fg: "var(--green-600)", icon: "wallet" },
  paynow: { label: "Paynow", sub: "Cards, bank & mobile money", tint: "rgba(21, 94, 171, 0.10)", fg: "#155EAB", icon: "lock" },
  ecocash: { label: "EcoCash", sub: "Pay with EcoCash", tint: "rgba(228, 3, 46, 0.08)", fg: "#E4032E", icon: "phone" },
  stripe: { label: "Visa / Mastercard", sub: "Pay with your card", tint: "rgba(99, 91, 255, 0.10)", fg: "#635BFF", icon: "smartphone" },
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
  walletBalance?: number | null;
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
              aria-pressed={selected}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 14px",
                borderRadius: 14,
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
                border: `1.5px solid ${selected ? "var(--green)" : "var(--border)"}`,
                background: selected ? "var(--green-50)" : "var(--surface)",
                boxShadow: selected ? "0 0 0 3px rgba(5, 150, 105, 0.12)" : "none",
                transition: "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: style.tint,
                  color: style.fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={style.icon} size={17} stroke={2} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{style.label}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>
                  {m === "wallet" && typeof walletBalance === "number" ? `Balance: $${walletBalance.toFixed(2)}` : style.sub}
                </span>
              </span>
              {/* Radio affordance (checkout mockup) — hollow ring that gains a
                  green fill + white pip when the method is selected. */}
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: `2px solid ${selected ? "var(--green)" : "var(--border-strong)"}`,
                  background: selected ? "var(--green)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "border-color 160ms ease, background 160ms ease",
                }}
              >
                {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
              </span>
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
