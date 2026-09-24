import Link from "next/link";
import { Icon } from "@/components/icons";
import { StuckPaymentActions } from "@/components/admin/stuck-payment-actions";
import { StuckTransactionActions } from "@/components/admin/stuck-transaction-actions";
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
              {stuckTransactions.map((t) => (
                <div key={t.id} className="card mb-2" style={{ padding: "12px 16px" }}>
                  <Link
                    href={`${basePath}/transactions/${t.id}`}
                    className="row between tap"
                    style={{ textDecoration: "none", color: "inherit" }}
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
                  <StuckTransactionActions transactionId={t.id} />
                </div>
              ))}
            </>
          )}

          {stuckTopups.length > 0 && (
            <>
              <div className="section-title mt-3 mb-2">Stuck wallet top-ups ({stuckTopups.length})</div>
              {stuckTopups.map((t) => (
                <div key={t.id} className="card mb-2" style={{ padding: "12px 16px" }}>
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
            </>
          )}

          {stuckGuestCheckouts.length > 0 && (
            <>
              <div className="section-title mt-3 mb-2">Stuck guest checkouts ({stuckGuestCheckouts.length})</div>
              {stuckGuestCheckouts.map((g) => (
                <div key={g.id} className="card mb-2" style={{ padding: "12px 16px" }}>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
