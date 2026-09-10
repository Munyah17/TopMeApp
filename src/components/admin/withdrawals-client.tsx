"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/data/catalog-helpers";
import { decideWithdrawal, markWithdrawalPaid, RAIL_LABEL, type WithdrawalRail } from "@/lib/actions/withdrawals";
import type { WithdrawalView } from "@/lib/data/admin-queries";

const STATUS: Record<WithdrawalView["status"], { label: string; color: string; bg: string }> = {
  requested: { label: "Needs review", color: "var(--warning)", bg: "var(--warning-bg)" },
  approved: { label: "Approved · pay & confirm", color: "var(--info)", bg: "var(--info-bg)" },
  paid: { label: "Paid", color: "var(--success)", bg: "var(--green-50)" },
  rejected: { label: "Rejected · refunded", color: "var(--error)", bg: "var(--error-bg)" },
  cancelled: { label: "Cancelled", color: "var(--text-secondary)", bg: "var(--muted)" },
};

function Row({ w }: { w: WithdrawalView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [ext, setExt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = STATUS[w.status];

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
        setOpen(false);
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
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{w.reference}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: s.color, background: s.bg }}>{s.label}</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {w.customer_name ?? "customer"} {w.customer_phone ? `· ${w.customer_phone}` : ""} · {new Date(w.requested_at).toLocaleString("en-GB")}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {RAIL_LABEL[w.rail as WithdrawalRail] ?? w.rail}: {Object.entries(w.rail_details).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}
          </div>
          {w.note && <div className="muted" style={{ fontSize: 11, marginTop: 2, fontStyle: "italic" }}>“{w.note}”</div>}
          {w.external_ref && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Rail ref: {w.external_ref}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{fmt(w.net)}</div>
          <div className="muted" style={{ fontSize: 10.5 }}>from {fmt(w.amount)} · fee {fmt(w.fee)}</div>
          {(w.status === "requested" || w.status === "approved") && (
            <button className="btn btn-ghost" style={{ height: 28, padding: "0 8px", fontSize: 11.5 }} onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : w.status === "requested" ? "Review" : "Confirm payout"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2" style={{ background: "var(--muted)", borderRadius: 10, padding: 12 }}>
          {w.status === "approved" && (
            <input className="field" placeholder="Rail transaction ID / reference" value={ext} onChange={(e) => setExt(e.target.value)} style={{ height: 38, marginBottom: 8 }} />
          )}
          <input className="field" placeholder="Note (audit log)" value={note} onChange={(e) => setNote(e.target.value)} style={{ height: 38 }} />
          {err && <div className="muted mt-2" style={{ color: "var(--error)", fontSize: 11.5 }}>{err}</div>}
          <div className="row gap-2 mt-2" style={{ flexWrap: "wrap" }}>
            {w.status === "requested" && (
              <>
                <button className="btn btn-primary" style={{ flex: "1 1 120px", height: 38, fontSize: 12.5 }} disabled={pending} onClick={() => run(() => decideWithdrawal(w.id, true, note))}>
                  Approve
                </button>
                <button className="btn btn-secondary" style={{ flex: "1 1 100px", height: 38, fontSize: 12.5, color: "var(--error)" }} disabled={pending} onClick={() => run(() => decideWithdrawal(w.id, false, note))}>
                  Reject &amp; refund
                </button>
              </>
            )}
            {w.status === "approved" && (
              <button className="btn btn-primary" style={{ flex: 1, height: 38, fontSize: 12.5 }} disabled={pending} onClick={() => run(() => markWithdrawalPaid(w.id, ext, note))}>
                Mark paid
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function WithdrawalsClient({ withdrawals }: { withdrawals: WithdrawalView[] }) {
  const queue = withdrawals.filter((w) => w.status === "requested" || w.status === "approved");
  const history = withdrawals.filter((w) => !["requested", "approved"].includes(w.status));
  const paidTotal = history.filter((w) => w.status === "paid").reduce((s, w) => s + w.net, 0);

  return (
    <div>
      <div className="row gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="muted" style={{ fontSize: 11.5 }}>In the queue</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{queue.length}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="muted" style={{ fontSize: 11.5 }}>Paid out (30d)</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmt(paidTotal)}</div>
        </div>
      </div>

      <div className="section-title mb-2">Queue ({queue.length})</div>
      {queue.length === 0 ? (
        <div className="card card-pad muted" style={{ textAlign: "center" }}>No withdrawals waiting.</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>{queue.map((w) => <Row key={w.id} w={w} />)}</div>
      )}

      <div className="section-title mt-4 mb-2">Recent history</div>
      {history.length === 0 ? (
        <div className="card card-pad muted" style={{ textAlign: "center" }}>Nothing in the last 30 days.</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>{history.map((w) => <Row key={w.id} w={w} />)}</div>
      )}
    </div>
  );
}
