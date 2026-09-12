import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { getAllServices, getCategories } from "@/lib/data/queries";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Transaction, WalletLedgerRow } from "@/types/database";

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const [params, permissions] = await Promise.all([searchParams, getMyPermissions()]);
  if (!permissions.includes("reports.view")) {
    return <div className="muted">You don&apos;t have permission to view reports.</div>;
  }

  const days = Math.max(1, parseInt(params.days ?? "30") || 30);
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const supabase = await createClient();
  // wallet_ledger has no *_select_admin RLS policy, so the session client
  // returns nothing here for staff — read it with the service client.
  const admin = createAdminClient();
  const [{ data: txData }, { data: ledgerData }, { data: disputeData }, { data: ticketData }, services, categories] = await Promise.all([
    supabase.from("transactions").select("*").gte("created_at", sinceIso).order("created_at", { ascending: false }),
    admin.from("wallet_ledger").select("*").in("type", ["refund", "adjustment"]).gte("created_at", sinceIso),
    supabase.from("disputes").select("id, status").gte("created_at", sinceIso),
    supabase.from("support_tickets").select("id, status").gte("created_at", sinceIso),
    getAllServices(true),
    getCategories(),
  ]);

  const tx = (txData as Transaction[]) ?? [];
  const ledger = (ledgerData as WalletLedgerRow[]) ?? [];
  const disputes = (disputeData as { id: string; status: string }[]) ?? [];
  const tickets = (ticketData as { id: string; status: string }[]) ?? [];

  const serviceById = new Map(services.map((s) => [s.id, s]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const successTx = tx.filter((t) => t.status === "success");
  const grossVolume = successTx.reduce((s, t) => s + t.amount + t.fee, 0);
  const netRevenue = successTx.reduce((s, t) => s + t.revenue, 0);
  const feeRevenue = successTx.reduce((s, t) => s + t.fee, 0);
  const refundTotal = ledger.filter((l) => l.type === "refund").reduce((s, l) => s + l.amount, 0);
  const adjustmentTotal = ledger.filter((l) => l.type === "adjustment").reduce((s, l) => s + l.amount, 0);

  const byCategory = new Map<string, { revenue: number; count: number }>();
  for (const t of successTx) {
    const catId = serviceById.get(t.service_id)?.category_id ?? "unknown";
    const row = byCategory.get(catId) ?? { revenue: 0, count: 0 };
    row.revenue += t.revenue;
    row.count += 1;
    byCategory.set(catId, row);
  }
  const categoryRows = Array.from(byCategory.entries())
    .map(([id, v]) => ({ id, name: categoryById.get(id)?.name ?? id, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const disputesOpen = disputes.filter((d) => d.status === "open" || d.status === "investigating").length;
  const ticketsOpen = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Reports & Analytics</h2>
      <div className="muted mb-3">Deeper cut of the numbers than the Cockpit summary.</div>

      <div className="row gap-2 mb-3">
        {RANGE_OPTIONS.map((r) => (
          <a key={r.days} href={`/admin/reports?days=${r.days}`} className={`filter-pill tap ${days === r.days ? "selected" : ""}`} style={{ textDecoration: "none" }}>
            {r.label}
          </a>
        ))}
      </div>

      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "var(--green-50)", color: "var(--green-600)" }}><Icon name="wallet" size={15} stroke={2} /></div>
          <div className="muted mt-2">Gross volume</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(grossVolume)}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "var(--green-50)", color: "var(--green-600)" }}><Icon name="grid" size={15} stroke={2} /></div>
          <div className="muted mt-2">Net revenue</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2, color: "var(--success)" }}>{fmt(netRevenue)}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "var(--blue-50)", color: "var(--blue)" }}><Icon name="book" size={15} stroke={2} /></div>
          <div className="muted mt-2">Fee revenue</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(feeRevenue)}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "#FEF6E7", color: "var(--warning)" }}><Icon name="zap" size={15} stroke={2} /></div>
          <div className="muted mt-2">Transactions</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{successTx.length}</div>
        </div>
      </div>

      <div className="row gap-2 mt-2" style={{ flexWrap: "wrap" }}>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "#FDECEC", color: "var(--error)" }}><Icon name="refresh" size={15} stroke={2} /></div>
          <div className="muted mt-2">Refunds issued</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2, color: "var(--error)" }}>{fmt(refundTotal)}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "var(--blue-50)", color: "var(--blue)" }}><Icon name="arrowUpR" size={15} stroke={2} /></div>
          <div className="muted mt-2">Wallet adjustments</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(adjustmentTotal)}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "#FEF6E7", color: "var(--warning)" }}><Icon name="shield" size={15} stroke={2} /></div>
          <div className="muted mt-2">Disputes open</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2, color: disputesOpen ? "var(--warning)" : undefined }}>{disputesOpen}</div>
        </div>
        <div className="card card-pad" style={{ flex: "1 1 140px" }}>
          <div className="ibadge round" style={{ width: 30, height: 30, background: "#FEF6E7", color: "var(--warning)" }}><Icon name="headset" size={15} stroke={2} /></div>
          <div className="muted mt-2">Tickets open</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2, color: ticketsOpen ? "var(--warning)" : undefined }}>{ticketsOpen}</div>
        </div>
      </div>

      <div className="section-title mt-3 mb-2">Revenue by category · last {days} days</div>
      <div className="card" style={{ overflow: "hidden" }}>
        {categoryRows.length === 0 ? (
          <div className="card-pad muted">No settled transactions in this range.</div>
        ) : (
          categoryRows.map((r, i) => (
            <div key={r.id} className="row between" style={{ padding: "12px 16px", borderBottom: i < categoryRows.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{r.count} sale{r.count === 1 ? "" : "s"}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--success)" }}>{fmt(r.revenue)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
