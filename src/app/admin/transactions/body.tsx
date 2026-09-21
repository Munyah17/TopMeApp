import Link from "next/link";
import { Icon } from "@/components/icons";
import { fmt, statusTone } from "@/lib/data/catalog-helpers";
import { getTransactionsForAdmin } from "@/lib/data/admin-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export async function TransactionsBody({
  searchParams,
  basePath,
}: {
  searchParams: Promise<{ q?: string; status?: string; fulfillment?: string }>;
  basePath: string;
}) {
  const [params, permissions] = await Promise.all([searchParams, getMyPermissions()]);
  if (!permissions.includes("transactions.view")) {
    return <div className="muted">You don&apos;t have permission to view transactions.</div>;
  }

  const transactions = await getTransactionsForAdmin({
    q: params.q,
    status: params.status || undefined,
    fulfillmentStatus: params.fulfillment || undefined,
  });

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Transactions</h2>
      <div className="muted mb-3">Search the full ledger. Tap a row to view details and rectify.</div>

      <form method="get" className="row gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 240px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--input-bg)",
            border: "1.5px solid var(--border)",
            borderRadius: 14,
            padding: "11px 14px",
          }}
        >
          <Icon name="search" size={16} stroke={2} />
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Reference, recipient, or email"
            style={{ border: "none", outline: "none", fontFamily: "inherit", fontWeight: 600, fontSize: 13.5, flex: 1, background: "transparent" }}
          />
        </div>
        <select name="fulfillment" defaultValue={params.fulfillment ?? ""} className="field" style={{ flex: "0 1 180px" }}>
          <option value="">All delivery statuses</option>
          <option value="pending">Pending</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="failed">Failed</option>
          <option value="simulated">Simulated</option>
        </select>
        <button type="submit" className="btn btn-primary" style={{ height: 44, padding: "0 16px" }}>
          Search
        </button>
      </form>

      <div className="card" style={{ overflow: "hidden" }}>
        {transactions.length === 0 ? (
          <div className="card-pad muted">No transactions match.</div>
        ) : (
          transactions.map((t, i) => (
            <Link
              key={t.id}
              href={`${basePath}/transactions/${t.id}`}
              className="row between tap"
              style={{ padding: "12px 16px", borderBottom: i < transactions.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none" }}
            >
              <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{t.reference}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {t.service_id} · {t.recipient_identifier} · {new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(t.amount + t.fee)}</div>
                <span className={`status-badge ${statusTone(t.fulfillment_status)}`} style={{ marginTop: 4 }}>
                  {t.fulfillment_status}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
