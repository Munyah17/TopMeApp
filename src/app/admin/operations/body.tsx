import Link from "next/link";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
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
      <div className="muted mb-3">
        Anything that took money (or reserved a gateway charge) but hasn&apos;t cleanly settled after 5 minutes.
      </div>

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
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.fulfillment_status === "failed" ? "var(--error)" : "var(--warning)" }}>
                        {t.fulfillment_status}
                      </div>
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
                  <div key={t.id} className="row between" style={{ padding: "12px 16px", borderBottom: i < stuckTopups.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.reference}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {t.provider} · {new Date(t.created_at).toLocaleString("en-GB")}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(t.amount)}</div>
                  </div>
                ))}
              </div>
              <div className="muted mt-1" style={{ fontSize: 11.5 }}>
                Ask the customer to use the &quot;Check Payment&quot; button on their wallet screen, or check the
                gateway&apos;s own dashboard for the real status.
              </div>
            </>
          )}

          {stuckGuestCheckouts.length > 0 && (
            <>
              <div className="section-title mt-3 mb-2">Stuck guest checkouts ({stuckGuestCheckouts.length})</div>
              <div className="card" style={{ overflow: "hidden" }}>
                {stuckGuestCheckouts.map((g, i) => (
                  <div key={g.id} className="row between" style={{ padding: "12px 16px", borderBottom: i < stuckGuestCheckouts.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{g.reference}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {g.service_id} · {g.provider} · {g.guest_email || g.guest_phone}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(g.amount + g.fee)}</div>
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
