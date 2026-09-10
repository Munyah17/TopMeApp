"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { cancelWithdrawal, requestWithdrawal, RAIL_LABEL, WITHDRAWAL_RAILS, type WithdrawalRail } from "@/lib/actions/withdrawals";
import type { Withdrawal } from "@/types/database";

const FEE_RATE = 0.013;
const MIN = 5;

const STATUS_LABEL: Record<Withdrawal["status"], { label: string; color: string }> = {
  requested: { label: "Pending review", color: "var(--warning)" },
  approved: { label: "Approved · paying out", color: "var(--info)" },
  paid: { label: "Paid", color: "var(--success)" },
  rejected: { label: "Rejected · refunded", color: "var(--error)" },
  cancelled: { label: "Cancelled · refunded", color: "var(--text-secondary)" },
};

// Which detail fields each rail needs from the customer.
const RAIL_FIELDS: Record<WithdrawalRail, { key: string; label: string; placeholder: string }[]> = {
  bank_transfer: [
    { key: "account_name", label: "Account name", placeholder: "As it appears at the bank" },
    { key: "bank_name", label: "Bank", placeholder: "e.g. CBZ, Steward" },
    { key: "account_number", label: "Account number", placeholder: "" },
  ],
  zipit: [
    { key: "account_name", label: "Account name", placeholder: "" },
    { key: "bank_name", label: "Bank", placeholder: "" },
    { key: "account_number", label: "Account number / mobile", placeholder: "" },
  ],
  ecocash: [{ key: "phone", label: "EcoCash number", placeholder: "077…" }, { key: "account_name", label: "Registered name", placeholder: "" }],
  innbucks: [{ key: "phone", label: "InnBucks number", placeholder: "" }, { key: "account_name", label: "Registered name", placeholder: "" }],
  omari: [{ key: "phone", label: "O'mari number", placeholder: "071…" }, { key: "account_name", label: "Registered name", placeholder: "" }],
};

export function WithdrawPanel({
  withdrawable,
  giftLocked,
  withdrawals,
}: {
  withdrawable: number;
  giftLocked: number;
  withdrawals: Withdrawal[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [rail, setRail] = useState<WithdrawalRail>("ecocash");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const amt = parseFloat(amount) || 0;
  const fee = useMemo(() => Math.round(amt * FEE_RATE * 100) / 100, [amt]);
  const net = Math.max(0, Math.round((amt - fee) * 100) / 100);
  const fields = RAIL_FIELDS[rail];
  const detailsComplete = fields.every((f) => (details[f.key] ?? "").trim().length > 0);
  const canSubmit = amt >= MIN && amt <= withdrawable && detailsComplete && !pending;

  function submit() {
    setErr(null);
    start(async () => {
      try {
        await requestWithdrawal({ amount: amt, rail, railDetails: details });
        setDone(true);
        setOpen(false);
        setAmount("");
        setDetails({});
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't submit that.");
      }
    });
  }

  function cancel(id: string) {
    start(async () => {
      try {
        await cancelWithdrawal(id);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't cancel that.");
      }
    });
  }

  return (
    <div>
      <div className="row between" style={{ alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Withdraw to cash</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {fmt(withdrawable)} available{giftLocked > 0 ? ` · ${fmt(giftLocked)} gift balance can't be withdrawn` : ""}
          </div>
        </div>
        <button className="btn btn-secondary" style={{ height: 38, padding: "0 14px" }} onClick={() => { setOpen((v) => !v); setDone(false); }}>
          {open ? "Close" : "Withdraw"}
        </button>
      </div>

      {done && !open && (
        <div className="mt-2" style={{ color: "var(--success)", fontSize: 13 }}>
          Withdrawal requested — we&apos;ll review it and pay out shortly.
        </div>
      )}

      {open && (
        <div className="mt-3" style={{ background: "var(--muted)", borderRadius: 12, padding: 14 }}>
          <label className="field-label">Amount (USD)</label>
          <input
            className="field"
            inputMode="decimal"
            placeholder={`Min $${MIN.toFixed(2)}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />

          <label className="field-label mt-3">Send to</label>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {WITHDRAWAL_RAILS.map((r) => (
              <button
                key={r}
                type="button"
                className="chip"
                onClick={() => { setRail(r); setDetails({}); }}
                style={rail === r ? { background: "var(--green-50)", borderColor: "var(--green)", color: "var(--green)" } : undefined}
              >
                {RAIL_LABEL[r]}
              </button>
            ))}
          </div>

          {fields.map((f) => (
            <div key={f.key} className="mt-2">
              <label className="field-label">{f.label}</label>
              <input
                className="field"
                placeholder={f.placeholder}
                value={details[f.key] ?? ""}
                onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </div>
          ))}

          {amt > 0 && (
            <div className="mt-3" style={{ fontSize: 13 }}>
              <div className="row between"><span className="muted">Withdrawal fee (1.3%)</span><span>{fmt(fee)}</span></div>
              <div className="row between" style={{ fontWeight: 700, marginTop: 2 }}><span>You receive</span><span>{fmt(net)}</span></div>
            </div>
          )}
          {amt > withdrawable && <div className="mt-2" style={{ color: "var(--error)", fontSize: 12.5 }}>That&apos;s more than your withdrawable balance.</div>}
          {err && <div className="mt-2" style={{ color: "var(--error)", fontSize: 12.5 }}>{err}</div>}

          <button className="btn btn-primary btn-block mt-3" disabled={!canSubmit} onClick={submit}>
            {pending ? "Submitting…" : `Withdraw ${amt > 0 ? fmt(amt) : ""}`.trim()}
          </button>
          <div className="muted mt-2" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            Payouts are reviewed by our team before the money is sent. The amount leaves your wallet now and
            comes straight back if the withdrawal is rejected or you cancel it before it&apos;s processed.
          </div>
        </div>
      )}

      {withdrawals.length > 0 && (
        <div className="mt-3">
          {withdrawals.map((w) => {
            const s = STATUS_LABEL[w.status];
            return (
              <div key={w.id} className="row between" style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{fmt(w.amount)} → {RAIL_LABEL[w.rail as WithdrawalRail] ?? w.rail}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {new Date(w.requested_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
                  </div>
                </div>
                {w.status === "requested" && (
                  <button className="btn btn-ghost" style={{ height: 28, padding: "0 8px", fontSize: 11.5, color: "var(--error)" }} disabled={pending} onClick={() => cancel(w.id)}>
                    Cancel
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
