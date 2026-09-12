import Link from "next/link";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { getAllServices, getCurrentProfile } from "@/lib/data/queries";
import { getAttentionCount, getPendingRefundCount, getPendingWithdrawalCount, getRecentFailures } from "@/lib/data/admin-queries";
import { createClient } from "@/lib/supabase/server";
import type { IntegrationHealth, Transaction } from "@/types/database";

export async function AdminOverviewBody({ basePath }: { basePath: string }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const since7dDate = new Date();
  since7dDate.setDate(since7dDate.getDate() - 7);
  const since7d = since7dDate.toISOString();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [{ data: recentTx }, services, attentionCount, pendingRefunds, pendingWithdrawals, { data: healthData }, recentFailures] = await Promise.all([
    supabase.from("transactions").select("*").gte("created_at", since7d).order("created_at", { ascending: false }),
    getAllServices(true),
    getAttentionCount(),
    getPendingRefundCount(),
    getPendingWithdrawalCount(),
    supabase.from("integration_health").select("*").order("id"),
    getRecentFailures(6),
  ]);
  const health = (healthData as IntegrationHealth[]) ?? [];
  const tx = (recentTx as Transaction[]) ?? [];
  const serviceById = new Map(services.map((s) => [s.id, s]));

  const todayTx = tx.filter((t) => new Date(t.created_at) >= startOfToday);
  const todaySuccess = todayTx.filter((t) => t.status === "success");
  const todayGross = todaySuccess.reduce((s, t) => s + t.amount, 0);
  const todayRevenue = todaySuccess.reduce((s, t) => s + t.revenue, 0);
  const pending = tx.filter((t) => t.status === "pending").length;
  const failed = tx.filter((t) => t.status === "failed").length;
  const settled = tx.filter((t) => t.status === "success").reduce((s, t) => s + t.amount, 0);

  const successTx = tx.filter((t) => t.status === "success");
  const byOwner = new Map<string, { revenue: number; cost: number; count: number }>();
  for (const t of successTx) {
    const key = t.owner_label || serviceById.get(t.service_id)?.provider_label || "Unlabelled";
    const row = byOwner.get(key) ?? { revenue: 0, cost: 0, count: 0 };
    row.revenue += t.revenue;
    row.cost += t.provider_cost;
    row.count += 1;
    byOwner.set(key, row);
  }
  const ownerRows = Array.from(byOwner.entries())
    .map(([owner, v]) => ({ owner, ...v }))
    .sort((a, b) => b.cost + b.revenue - (a.cost + a.revenue));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const bars = days.map((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return tx.filter((t) => new Date(t.created_at) >= d && new Date(t.created_at) < next).length;
  });
  const maxBar = Math.max(1, ...bars);

  const byService = new Map<string, number>();
  for (const t of tx) byService.set(t.service_id, (byService.get(t.service_id) ?? 0) + 1);
  const top = Array.from(byService.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count, name: serviceById.get(id)?.name || id, color: serviceById.get(id)?.color || "#94A3B8" }));
  const topTotal = top.reduce((s, t) => s + t.count, 0) || 1;

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Main Instruments</h2>
      <div className="muted mb-3">Today&apos;s snapshot — see Reports for the full picture.</div>

      {attentionCount > 0 && (
        <Link
          href={`${basePath}/operations`}
          className="card card-pad tap row gap-2 mb-2"
          style={{ textDecoration: "none", borderColor: "var(--warning)", background: "#FEF6E7" }}
        >
          <div className="ibadge round" style={{ width: 34, height: 34, background: "#fff", color: "var(--warning)" }}>
            <Icon name="alert" size={17} stroke={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{attentionCount} item{attentionCount === 1 ? "" : "s"} need attention</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Stuck payments or top-ups — open Operations Center</div>
          </div>
          <Icon name="chevronR" size={16} stroke={2} />
        </Link>
      )}

      {pendingRefunds > 0 && (
        <Link
          href={`${basePath}/refunds`}
          className="card card-pad tap row gap-2 mb-2"
          style={{ textDecoration: "none", borderColor: "var(--warning)", background: "#FEF6E7" }}
        >
          <div className="ibadge round" style={{ width: 34, height: 34, background: "#fff", color: "var(--warning)" }}>
            <Icon name="refresh" size={17} stroke={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{pendingRefunds} refund{pendingRefunds === 1 ? "" : "s"} awaiting a decision</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Payments that failed after charging — open Refunds</div>
          </div>
          <Icon name="chevronR" size={16} stroke={2} />
        </Link>
      )}

      {pendingWithdrawals > 0 && (
        <Link
          href={`${basePath}/withdrawals`}
          className="card card-pad tap row gap-2 mb-2"
          style={{ textDecoration: "none", borderColor: "var(--warning)", background: "#FEF6E7" }}
        >
          <div className="ibadge round" style={{ width: 34, height: 34, background: "#fff", color: "var(--warning)" }}>
            <Icon name="arrowUpR" size={17} stroke={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{pendingWithdrawals} withdrawal{pendingWithdrawals === 1 ? "" : "s"} to process</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Customers cashing out — open Withdrawals</div>
          </div>
          <Icon name="chevronR" size={16} stroke={2} />
        </Link>
      )}

      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        {health.map((h) => {
          const healthy = h.consecutive_failures === 0 && !!h.last_success_at;
          const neverHeard = !h.last_success_at && !h.last_failure_at;
          const color = neverHeard ? "var(--text-faint)" : healthy ? "var(--success)" : "var(--error)";
          return (
            <div key={h.id} className="card card-pad" style={{ flex: "1 1 100px", textAlign: "center" }}>
              <div className="muted" style={{ fontSize: 11 }}>{h.label}</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4, color }}>
                {neverHeard ? "Unknown" : healthy ? "Healthy" : "Failing"}
              </div>
            </div>
          );
        })}
      </div>

      {recentFailures.length > 0 && (
        <>
          <div className="section-title mt-3 mb-2">Recent failures</div>
          <div className="card" style={{ overflow: "hidden" }}>
            {recentFailures.map((f, i) => (
              <Link
                key={f.id}
                href={f.transactionId ? `${basePath}/transactions/${f.transactionId}` : `${basePath}/transactions`}
                className="row gap-2 tap"
                style={{ padding: "12px 16px", borderBottom: i < recentFailures.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none" }}
              >
                <div className="ibadge round" style={{ width: 30, height: 30, background: "#FDECEC", color: "var(--error)", flexShrink: 0 }}>
                  <Icon name="alert" size={14} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                    {f.message}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {f.reference ?? f.serviceId ?? "—"} · {new Date(f.createdAt).toLocaleString("en-GB")}
                  </div>
                </div>
                <span style={{ flexShrink: 0 }}>
                  <Icon name="chevronR" size={16} stroke={2} />
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="row gap-2 mt-2" style={{ flexWrap: "wrap" }}>
          <div className="card card-pad" style={{ flex: "1 1 160px" }}>
            <div className="ibadge round" style={{ width: 32, height: 32, background: "var(--green-50)", color: "var(--green-600)" }}>
              <Icon name="wallet" size={16} stroke={2} />
            </div>
            <div className="muted mt-2">Today&apos;s gross volume</div>
            <div style={{ fontWeight: 800, fontSize: 19, marginTop: 2 }}>{fmt(todayGross)}</div>
          </div>
          <div className="card card-pad" style={{ flex: "1 1 160px" }}>
            <div className="ibadge round" style={{ width: 32, height: 32, background: "var(--blue-50)", color: "var(--blue)" }}>
              <Icon name="book" size={16} stroke={2} />
            </div>
            <div className="muted mt-2">Today&apos;s net revenue</div>
            <div style={{ fontWeight: 800, fontSize: 19, marginTop: 2, color: "var(--success)" }}>{fmt(todayRevenue)}</div>
          </div>
          <div className="card card-pad" style={{ flex: "1 1 160px" }}>
            <div className="ibadge round" style={{ width: 32, height: 32, background: "#FEF6E7", color: "var(--warning)" }}>
              <Icon name="zap" size={16} stroke={2} />
            </div>
            <div className="muted mt-2">Transactions today</div>
            <div style={{ fontWeight: 800, fontSize: 19, marginTop: 2 }}>{todayTx.length}</div>
          </div>
        </div>
        <div className="row gap-2 mt-2">
          <div className="card card-pad" style={{ flex: 1, textAlign: "center" }}>
            <div className="muted">Pending (7d)</div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{pending}</div>
          </div>
          <div className="card card-pad" style={{ flex: 1, textAlign: "center" }}>
            <div className="muted">Failed (7d)</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: "var(--error)" }}>{failed}</div>
          </div>
          <div className="card card-pad" style={{ flex: 1, textAlign: "center" }}>
            <div className="muted">Settled (7d)</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: "var(--success)" }}>{fmt(settled)}</div>
          </div>
        </div>

        <div className="section-title mt-3 mb-2">Transactions · last 7 days</div>
        <div className="card card-pad">
          <div className="row gap-1" style={{ alignItems: "flex-end", height: 110 }}>
            {bars.map((b, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 22,
                    height: Math.max(4, (b / maxBar) * 100),
                    borderRadius: "6px 6px 3px 3px",
                    background: "var(--green)",
                  }}
                />
                <span style={{ fontSize: 10.5, color: "var(--text-faint)", fontWeight: 700 }}>
                  {days[i].toLocaleDateString("en-GB", { weekday: "narrow" })}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="section-title mt-3 mb-2">Revenue split by provider · last 7 days</div>
        <div className="card" style={{ overflow: "hidden" }}>
          {ownerRows.length === 0 ? (
            <div className="card-pad muted">No settled transactions yet.</div>
          ) : (
            ownerRows.map((r, i) => (
              <div
                key={r.owner}
                className="row between"
                style={{ padding: "12px 16px", borderBottom: i < ownerRows.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.owner}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {r.count} sale{r.count === 1 ? "" : "s"} · sold by TopMe, processed &amp; paid to {r.owner}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--success)" }}>+{fmt(r.revenue)} ours</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{fmt(r.cost)} theirs</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="section-title mt-3 mb-2">Most purchased services · last 7 days</div>
        <div className="card card-pad">
          {top.length === 0 ? (
            <div className="muted">No transactions yet.</div>
          ) : (
            top.map((t) => (
              <div className="row gap-2 mb-2" key={t.id}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                <div style={{ width: 120, height: 8, background: "#F1F4F9", borderRadius: 100, overflow: "hidden" }}>
                  <div style={{ width: `${(t.count / topTotal) * 100}%`, height: "100%", background: t.color }} />
                </div>
                <div style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--text-soft)" }}>{t.count}</div>
              </div>
            ))
          )}
        </div>
    </div>
  );
}
