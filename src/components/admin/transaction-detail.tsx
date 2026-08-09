"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { ReviewRow } from "@/components/payment-flow/flow-shared";
import { forceFulfilTransaction, refundTransaction, retryFulfillment } from "@/lib/actions/rectification";
import type { TransactionTimelineEntry } from "@/lib/data/admin-queries";
import type { Transaction, WalletLedgerRow } from "@/types/database";

const EVENT_STYLE: Record<string, { icon: string; color: string }> = {
  payment_confirmed: { icon: "check", color: "var(--success)" },
  payment_failed: { icon: "alert", color: "var(--error)" },
  fulfillment_started: { icon: "refresh", color: "var(--blue)" },
  fulfillment_success: { icon: "check", color: "var(--success)" },
  fulfillment_failed: { icon: "alert", color: "var(--error)" },
  webhook_received: { icon: "plug", color: "var(--text-soft)" },
};

function TransactionTimeline({ timeline }: { timeline: TransactionTimelineEntry[] }) {
  if (timeline.length === 0) {
    return (
      <div className="card card-pad mb-3">
        <div className="section-title" style={{ fontSize: 14 }}>
          What happened
        </div>
        <div className="muted mt-1">No events logged yet for this transaction.</div>
      </div>
    );
  }

  return (
    <div className="card card-pad mb-3">
      <div className="section-title" style={{ fontSize: 14 }}>
        What happened
      </div>
      <div className="mt-2">
        {timeline.map((entry) => {
          const style = entry.source === "admin" ? { icon: "user", color: "var(--navy)" } : EVENT_STYLE[entry.eventType] ?? { icon: "clock", color: "var(--text-soft)" };
          return (
            <div key={entry.id} className="row gap-2" style={{ padding: "8px 0", alignItems: "flex-start" }}>
              <div className="ibadge round" style={{ width: 26, height: 26, background: `${style.color}1a`, color: style.color, flexShrink: 0, marginTop: 1 }}>
                <Icon name={style.icon} size={13} stroke={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {entry.message}
                  {entry.source === "admin" && entry.actorName && <span className="muted"> — {entry.actorName}</span>}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{new Date(entry.createdAt).toLocaleString("en-GB")}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FULFILLMENT_LABEL: Record<string, { label: string; color: string }> = {
  fulfilled: { label: "Fulfilled", color: "var(--success)" },
  pending: { label: "Pending", color: "var(--warning)" },
  failed: { label: "Failed", color: "var(--error)" },
  simulated: { label: "Simulated", color: "var(--warning)" },
};

export function TransactionDetail({
  transaction,
  ledgerRows,
  timeline,
}: {
  transaction: Transaction;
  ledgerRows: WalletLedgerRow[];
  timeline: TransactionTimelineEntry[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"retry" | "force" | "refund" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const already = transaction.fulfillment_status === "fulfilled";
  const alreadyRefunded = transaction.status === "failed" && ledgerRows.some((r) => r.type === "refund");
  const fulfillmentMeta = FULFILLMENT_LABEL[transaction.fulfillment_status] ?? { label: transaction.fulfillment_status, color: "var(--text)" };

  function run(action: "retry" | "force" | "refund", fn: () => Promise<unknown>) {
    setError(null);
    setMessage(null);
    setBusyAction(action);
    startTransition(async () => {
      try {
        await fn();
        setMessage("Done — the transaction has been updated.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusyAction(null);
      }
    });
  }

  return (
    <div>
      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <div className="card-pad" style={{ textAlign: "center", borderBottom: "1px dashed var(--border)" }}>
          <div className="muted">Amount + fee</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmt(transaction.amount + transaction.fee)}</div>
          <span
            style={{
              display: "inline-block",
              marginTop: 8,
              background: `${fulfillmentMeta.color}1a`,
              color: fulfillmentMeta.color,
              fontSize: 11,
              fontWeight: 800,
              padding: "4px 10px",
              borderRadius: 8,
            }}
          >
            {fulfillmentMeta.label}
          </span>
        </div>
        <div style={{ padding: "6px 18px" }}>
          <ReviewRow label="Reference" value={transaction.reference} />
          <ReviewRow label="Service" value={transaction.service_id} />
          <ReviewRow label="Recipient" value={transaction.recipient_identifier} />
          <ReviewRow label="Amount" value={fmt(transaction.amount)} />
          <ReviewRow label="Fee" value={fmt(transaction.fee)} />
          <ReviewRow label="Provider" value={transaction.fulfillment_provider} />
          <ReviewRow label="Payer" value={transaction.user_id ? "TopMe Wallet" : transaction.guest_email || transaction.guest_phone || "Guest"} />
          <ReviewRow label="Created" value={new Date(transaction.created_at).toLocaleString("en-GB")} />
        </div>
      </div>

      <TransactionTimeline timeline={timeline} />

      {Object.keys(transaction.receipt ?? {}).length > 0 && (
        <div className="card card-pad mb-3">
          <div className="section-title" style={{ fontSize: 13 }}>
            Receipt / provider response
          </div>
          <pre style={{ fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8, color: "var(--text-soft)" }}>
            {JSON.stringify(transaction.receipt, null, 2)}
          </pre>
        </div>
      )}

      {ledgerRows.length > 0 && (
        <div className="card mb-3" style={{ overflow: "hidden" }}>
          <div className="card-pad" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="section-title" style={{ fontSize: 13 }}>
              Wallet ledger entries
            </div>
          </div>
          {ledgerRows.map((r, i) => (
            <div key={r.id} className="row between" style={{ padding: "10px 16px", borderBottom: i < ledgerRows.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.type}</div>
                <div className="muted" style={{ fontSize: 11 }}>{new Date(r.created_at).toLocaleString("en-GB")}</div>
              </div>
              <div style={{ fontWeight: 800, color: r.amount >= 0 ? "var(--success)" : "var(--text)" }}>{fmt(r.amount)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad">
        <div className="section-title" style={{ fontSize: 14 }}>
          Manual rectification
        </div>
        <div className="muted mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Only use these once you&apos;ve verified what actually happened (e.g. checked the provider&apos;s own
          dashboard). Every action here is logged to the audit trail.
        </div>

        <label className="field-label mt-3">Note (recorded with the action)</label>
        <input className="field" placeholder="e.g. confirmed delivered via VitalPay dashboard" value={note} onChange={(e) => setNote(e.target.value)} />

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

        <div className="row gap-2 mt-3" style={{ flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary"
            style={{ flex: "1 1 160px" }}
            disabled={pending || already}
            onClick={() => run("retry", () => retryFulfillment(transaction.id, note))}
          >
            <Icon name="refresh" size={15} stroke={2} /> {busyAction === "retry" ? "Retrying…" : "Retry fulfillment"}
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: "1 1 160px" }}
            disabled={pending || already}
            onClick={() => run("force", () => forceFulfilTransaction(transaction.id, note))}
          >
            <Icon name="check" size={15} stroke={2} /> {busyAction === "force" ? "Marking…" : "Force mark fulfilled"}
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: "1 1 160px", color: "var(--error)" }}
            disabled={pending || !transaction.user_id || alreadyRefunded}
            title={!transaction.user_id ? "Guest checkout — no wallet to refund into" : alreadyRefunded ? "Already refunded" : undefined}
            onClick={() => run("refund", () => refundTransaction(transaction.id, note))}
          >
            <Icon name="arrowDnL" size={15} stroke={2} /> {busyAction === "refund" ? "Refunding…" : "Refund to wallet"}
          </button>
        </div>
        {!transaction.user_id && (
          <div className="muted mt-2" style={{ fontSize: 11.5 }}>
            This was a guest checkout — there&apos;s no TopMe wallet to refund into. A real refund needs to go
            through Paynow/Stripe/EcoCash&apos;s own dashboard.
          </div>
        )}
      </div>
    </div>
  );
}
