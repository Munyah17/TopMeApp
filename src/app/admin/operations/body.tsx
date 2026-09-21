import Link from "next/link";
import { Icon } from "@/components/icons";
import { StuckPaymentActions } from "@/components/admin/stuck-payment-actions";
import { fmt, statusTone } from "@/lib/data/catalog-helpers";
import { getAttentionQueue } from "@/lib/data/admin-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export async function OperationsBody({ basePath }: { basePath: string }) {
  const permissions = await getMyPermissions();
  if (!permissions.includes("transactions.view")) {
    return <div className="muted">You don&apos;t have permission to view operations.</div>;
  }

  const { stuckTransactions, stuckTopups, stuckGuestCheckouts } = await getAttentionQueue();
  const totalCount = stuckTransactions.length + stuckTopups.length + stuckGuestCheckouts.length;

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Operations Center</h2>

      {totalCount === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div className="ibadge round" style={{ width: 56, height: 56, background: "var(--green-50)", color: "var(--success)", margin: "0 auto" }}>
            <Icon name="check" size={24} stroke={2} />
          </div>
          <div style={{ fontWeight: 700, marginTop: 14 }}>Nothing needs attention</div>
          <div className="muted mt-1">Every recent payment has settled cleanly.</div>
        </div>
      ) : (
        <>
          {stuckTransactions.length > 0 && (
            <>
              <div className="section-title mt-3 mb-2">Stuck transactions ({stuckTransactions.length})</div>
              <div className="card" style={{ overflow: "hidden" }}>
                {stuckTransactions.map((t, i) => (
                  <Link
                    key={t.id}
                    href={`${basePath}/transactions/${t.id}`}
                    className="row between tap"
                    style={{ padding: "12px 16px", borderBottom: i < stuckTransactions.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.reference}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {t.service_id} · {t.recipient_identifier}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(t.amount + t.fee)}</div>
                      <span className={`status-badge ${statusTone(t.fulfillment_status)}`} style={{ marginTop: 4 }}>
                        {t.fulfillment_status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {stuckTopups.length > 0 && (
            <>
              <div className="section-title mt-3 mb-2">Stuck wallet top-ups ({stuckTopups.length})</div>
              <div className="card" style={{ overflow: "hidden" }}>
                {stuckTopups.map((t, i) => (
                  <div key={t.id} style={{ padding: "12px 16px", borderBottom: i < stuckTopups.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div className="row between">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.reference}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {t.provider} · {new Date(t.created_at).toLocaleString("en-GB")}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(t.amount)}</div>
                    </div>
                    <StuckPaymentActions kind="topup" reference={t.reference} provider={t.provider} />
                  </div>
                ))}
              </div>
            </>
          )}

          {stuckGuestCheckouts.length > 0 && (
            <>
              <div className="section-title mt-3 mb-2">Stuck guest checkouts ({stuckGuestCheckouts.length})</div>
              <div className="card" style={{ overflow: "hidden" }}>
                {stuckGuestCheckouts.map((g, i) => (
                  <div key={g.id} style={{ padding: "12px 16px", borderBottom: i < stuckGuestCheckouts.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div className="row between">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{g.reference}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {g.service_id} · {g.provider} · {g.guest_email || g.guest_phone}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(g.amount + g.fee)}</div>
                    </div>
                    <StuckPaymentActions kind="guest" reference={g.reference} provider={g.provider} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
