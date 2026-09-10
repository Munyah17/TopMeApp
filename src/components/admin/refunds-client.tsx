"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { decideRefundRequest, markRefundSettled } from "@/lib/actions/rectification";
import type { RefundRequestView } from "@/lib/data/admin-queries";

const STATUS_STYLE: Record<RefundRequestView["status"], { label: string; color: string; bg: string }> = {
  pending: { label: "Needs decision", color: "var(--warning)", bg: "var(--warning-bg)" },
  approved: { label: "Approved · pay guest", color: "var(--info)", bg: "var(--info-bg)" },
  paid: { label: "Refunded", color: "var(--success)", bg: "var(--green-50)" },
  rejected: { label: "Rejected", color: "var(--error)", bg: "var(--error-bg)" },
};

function Row({ r, basePath }: { r: RefundRequestView; basePath: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = STATUS_STYLE[r.status];
  const actionable = r.status === "pending" || r.status === "approved";
  const isGuest = !r.user_id;

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
        setOpen(false);
        setNote("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
            {r.reference ? (
              <Link href={`${basePath}/transactions/${r.transaction_id}`} style={{ fontWeight: 700, fontSize: 13.5, textDecoration: "none" }}>
                {r.reference}
              </Link>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{r.transaction_id.slice(0, 8)}</span>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: s.color, background: s.bg }}>
              {s.label}
            </span>
            {r.auto_eligible && r.status === "paid" && (
              <span className="muted" style={{ fontSize: 10 }}>auto</span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {r.service_id ?? "—"} · {isGuest ? `guest ${r.guest_email ?? ""}` : r.customer_name ?? "customer"} · {new Date(r.requested_at).toLocaleString("en-GB")}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.reason}</div>
          {r.decision_note && <div className="muted" style={{ fontSize: 11, marginTop: 2, fontStyle: "italic" }}>“{r.decision_note}”</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{fmt(r.amount)}</div>
          {actionable && (
            <button className="btn btn-ghost" style={{ height: 28, padding: "0 8px", fontSize: 11.5 }} onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Resolve"}
            </button>
          )}
        </div>
      </div>

      {open && actionable && (
        <div className="mt-2" style={{ background: "var(--muted)", borderRadius: 10, padding: 12 }}>
          {isGuest && r.status === "pending" && (
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
              Guest checkout — approving records the decision. Pay the customer on a rail (EcoCash / bank), then mark it settled.
            </div>
          )}
          <input className="field" placeholder="Note (recorded in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} style={{ height: 38 }} />
          {err && <div className="muted mt-2" style={{ color: "var(--error)", fontSize: 11.5 }}>{err}</div>}
          <div className="row gap-2 mt-2" style={{ flexWrap: "wrap" }}>
            {r.status === "pending" && (
              <>
                <button className="btn btn-primary" style={{ flex: "1 1 130px", height: 38, fontSize: 12.5 }} disabled={pending} onClick={() => run(() => decideRefundRequest(r.id, true, note))}>
                  {isGuest ? "Approve" : "Approve & pay to wallet"}
                </button>
                <button className="btn btn-secondary" style={{ flex: "1 1 100px", height: 38, fontSize: 12.5, color: "var(--error)" }} disabled={pending} onClick={() => run(() => decideRefundRequest(r.id, false, note))}>
                  Reject
                </button>
              </>
            )}
            {r.status === "approved" && (
              <button className="btn btn-primary" style={{ flex: 1, height: 38, fontSize: 12.5 }} disabled={pending} onClick={() => run(() => markRefundSettled(r.id, note))}>
                Mark settled (customer paid)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RefundsClient({ refunds, basePath }: { refunds: RefundRequestView[]; basePath: string }) {
  const queue = refunds.filter((r) => r.status === "pending" || r.status === "approved");
  const history = refunds.filter((r) => r.status === "paid" || r.status === "rejected");
  const paidTotal = history.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <div className="row gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="muted" style={{ fontSize: 11.5 }}>Awaiting decision</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{queue.length}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="muted" style={{ fontSize: 11.5 }}>Refunded (30d)</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmt(paidTotal)}</div>
        </div>
      </div>

      <div className="section-title mb-2">Queue ({queue.length})</div>
      {queue.length === 0 ? (
        <div className="card card-pad muted" style={{ textAlign: "center" }}>Nothing waiting. Failed payments under $49 refund automatically.</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {queue.map((r) => (
            <Row key={r.id} r={r} basePath={basePath} />
          ))}
        </div>
      )}

      <div className="section-title mt-4 mb-2">Recent history</div>
      {history.length === 0 ? (
        <div className="card card-pad muted" style={{ textAlign: "center" }}>No settled refunds in the last 30 days.</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {history.map((r) => (
            <Row key={r.id} r={r} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}
