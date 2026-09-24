import Link from "next/link";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { getAllServices, getCurrentProfile } from "@/lib/data/queries";
import { getAttentionCount, getPendingRefundCount, getPendingWithdrawalCount, getRecentFailures } from "@/lib/data/admin-queries";
import { ClearAttentionButton } from "@/components/admin/clear-attention-button";
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
    .map(([id, count]) => ({ id, count, name: serviceById.get(id)?.name || id, color: serviceById.get(id)?.color || "var(--text-faint)" }));
  const topTotal = top.reduce((s, t) => s + t.count, 0) || 1;

  const prevWeekFailed = tx.filter((t) => t.status === "failed").length;
  const successRate = tx.length === 0 ? null : Math.round((successTx.length / tx.length) * 100);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (profile.full_name || "").trim().split(/\s+/)[0] || "there";
  const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const alerts = [
    attentionCount > 0 && {
      href: `${basePath}/operations`,
      icon: "alert",
      title: `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention`,
      sub: "Stuck payments or top-ups — open Operations Center",
      clearable: true,
    },
    pendingRefunds > 0 && {
      href: `${basePath}/refunds`,
      icon: "refresh",
      title: `${pendingRefunds} refund${pendingRefunds === 1 ? "" : "s"} awaiting a decision`,
      sub: "Payments that failed after charging — open Refunds",
    },
    pendingWithdrawals > 0 && {
      href: `${basePath}/withdrawals`,
      icon: "arrowUpR",
      title: `${pendingWithdrawals} withdrawal${pendingWithdrawals === 1 ? "" : "s"} to process`,
      sub: "Customers cashing out — open Withdrawals",
    },
  ].filter((a): a is { href: string; icon: string; title: string; sub: string; clearable?: boolean } => Boolean(a));

  // 7-day line chart: 600x180 viewBox, 24px padding for the axis labels.
  const W = 600, H = 180, PX = 8, PT = 14, PB = 26;
  const chartPts = bars.map((b, i) => {
    const x = PX + (i / (bars.length - 1)) * (W - PX * 2);
    const y = PT + (1 - b / maxBar) * (H - PT - PB);
    return { x, y, v: b };
  });
  const linePath = chartPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${chartPts[chartPts.length - 1].x.toFixed(1)},${H - PB} L${chartPts[0].x.toFixed(1)},${H - PB} Z`;

  const maxOwner = Math.max(1, ...ownerRows.map((r) => r.cost + r.revenue));
  const ownerColors = ["var(--green)", "var(--info)", "var(--adm-purple)", "var(--adm-teal)", "var(--warning)", "var(--text-tertiary)"];

  return (
    <div>
      <div className="adm-hero">
        <div>
          <div className="adm-eyebrow">{todayLabel}</div>
          <h1 className="adm-hero-title">
            {greeting}, <span className="accent">{firstName}</span>.
          </h1>
          <div className="adm-hero-sub">
            {todayTx.length === 0 ? (
              <>No transactions yet today. </>
            ) : (
              <>
                <strong>{todayTx.length}</strong> transaction{todayTx.length === 1 ? "" : "s"} so far today worth <strong>{fmt(todayGross)}</strong>.{" "}
              </>
            )}
            {alerts.length === 0 ? "Everything is flowing — nothing needs your attention." : `${alerts.length} queue${alerts.length === 1 ? "" : "s"} need${alerts.length === 1 ? "s" : ""} a look below.`}
          </div>
        </div>
        <div className="adm-hero-actions">
          <Link href={`${basePath}/reports`} className="btn btn-secondary">
            <Icon name="book" size={15} stroke={2} /> Reports
          </Link>
          <Link href={`${basePath}/operations`} className="btn btn-primary">
            <Icon name="zap" size={15} stroke={2} /> Operations Center
          </Link>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="adm-alerts">
          {alerts.map((a) =>
            a.clearable ? (
              // A <button> can't live inside a <Link>, so clearable alerts are
              // a div with the text + chevron as links around the button.
              <div key={a.href} className="adm-alert">
                <div className="ico">
                  <Icon name={a.icon} size={16} stroke={2} />
                </div>
                <Link href={a.href} style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
                  <div className="title">{a.title}</div>
                  <div className="sub">{a.sub}</div>
                </Link>
                <div className="go">
                  <ClearAttentionButton />
                  <Link href={a.href} aria-label="Open Operations Center" style={{ display: "flex", color: "inherit" }}>
                    <Icon name="chevronR" size={16} stroke={2} />
                  </Link>
                </div>
              </div>
            ) : (
              <Link key={a.href} href={a.href} className="adm-alert">
                <div className="ico">
                  <Icon name={a.icon} size={16} stroke={2} />
                </div>
                <div>
                  <div className="title">{a.title}</div>
                  <div className="sub">{a.sub}</div>
                </div>
                <span className="go">
                  <Icon name="chevronR" size={16} stroke={2} />
                </span>
              </Link>
            ),
          )}
        </div>
      )}

      <div className="adm-kpi-grid">
        <div className="adm-kpi">
          <div className="adm-kpi-top">
            <div className="adm-kpi-id">
              <div className="adm-kpi-icon"><Icon name="wallet" size={16} stroke={2} /></div>
              <div className="adm-kpi-label">Gross volume today</div>
            </div>
            <span className="adm-pill">TODAY</span>
          </div>
          <div className="adm-kpi-value">{fmt(todayGross)}</div>
          <div className="adm-kpi-foot">7-day settled <strong>{fmt(settled)}</strong></div>
        </div>
        <div className="adm-kpi c-info">
          <div className="adm-kpi-top">
            <div className="adm-kpi-id">
              <div className="adm-kpi-icon"><Icon name="book" size={16} stroke={2} /></div>
              <div className="adm-kpi-label">Net revenue today</div>
            </div>
            <span className="adm-pill">OURS</span>
          </div>
          <div className="adm-kpi-value" style={{ color: "var(--success)" }}>{fmt(todayRevenue)}</div>
          <div className="adm-kpi-foot">
            {todayGross > 0 ? <>margin <strong>{Math.round((todayRevenue / todayGross) * 100)}%</strong></> : <>no settled sales yet today</>}
          </div>
        </div>
        <div className="adm-kpi c-purple">
          <div className="adm-kpi-top">
            <div className="adm-kpi-id">
              <div className="adm-kpi-icon"><Icon name="zap" size={16} stroke={2} /></div>
              <div className="adm-kpi-label">Transactions</div>
            </div>
            <span className="adm-pill">7D</span>
          </div>
          <div className="adm-kpi-value">
            {tx.length}
            <sup>{todayTx.length} today</sup>
          </div>
          <div className="adm-kpi-foot">
            success rate <strong>{successRate === null ? "—" : `${successRate}%`}</strong> · pending <strong>{pending}</strong>
          </div>
        </div>
        <div className={`adm-kpi ${failed > 0 ? "c-error" : ""}`}>
          <div className="adm-kpi-top">
            <div className="adm-kpi-id">
              <div className="adm-kpi-icon"><Icon name="alert" size={16} stroke={2} /></div>
              <div className="adm-kpi-label">Failed</div>
            </div>
            <span className="adm-pill">7D</span>
          </div>
          <div className="adm-kpi-value" style={{ color: failed > 0 ? "var(--error)" : undefined }}>{prevWeekFailed}</div>
          <div className="adm-kpi-foot">
            {failed > 0 ? <>latest {recentFailures[0] ? new Date(recentFailures[0].createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</> : <>clean week — nothing failed</>}
          </div>
        </div>
      </div>

      <div className="adm-grid">
        <section className="adm-panel span-8">
          <div className="adm-panel-head">
            <div>
              <div className="adm-eyebrow">Activity</div>
              <h3 className="adm-panel-title">Transactions · last 7 days</h3>
            </div>
            <Link href={`${basePath}/transactions`} className="adm-panel-action">
              Full ledger <Icon name="chevronR" size={13} stroke={2.2} />
            </Link>
          </div>
          <svg className="adm-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 180 }} role="img" aria-label="Transactions per day, last 7 days">
            <defs>
              <linearGradient id="admArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((f) => (
              <line key={f} className="grid-line" x1={PX} x2={W - PX} y1={PT + f * (H - PT - PB)} y2={PT + f * (H - PT - PB)} />
            ))}
            <path d={areaPath} fill="url(#admArea)" />
            <path d={linePath} className="line" />
            {chartPts.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={3.5} className="dot" />
                <text x={p.x} y={H - 8} textAnchor={i === 0 ? "start" : i === chartPts.length - 1 ? "end" : "middle"} className="axis">
                  {days[i].toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
                </text>
                {p.v > 0 && (
                  <text x={p.x} y={p.y - 9} textAnchor="middle" className="axis" style={{ fill: "var(--text-secondary)", fontWeight: 600 }}>
                    {p.v}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <div className="adm-chart-foot">
            <div>
              <div className="adm-stat-label">Pending (7d)</div>
              <div className="adm-stat-value">{pending}</div>
            </div>
            <div>
              <div className="adm-stat-label">Failed (7d)</div>
              <div className={`adm-stat-value ${failed > 0 ? "neg" : ""}`}>{failed}</div>
            </div>
            <div>
              <div className="adm-stat-label">Settled (7d)</div>
              <div className="adm-stat-value pos">{fmt(settled)}</div>
            </div>
          </div>
        </section>

        <section className="adm-panel span-4">
          <div className="adm-panel-head">
            <div>
              <div className="adm-eyebrow">Integrations</div>
              <h3 className="adm-panel-title">Gateway health</h3>
            </div>
            <Link href={`${basePath}/system-health`} className="adm-panel-action">
              Details <Icon name="chevronR" size={13} stroke={2.2} />
            </Link>
          </div>
          <div className="adm-health">
            {health.length === 0 && <div className="adm-empty">No integrations reporting yet.</div>}
            {health.map((h) => {
              const healthy = h.consecutive_failures === 0 && !!h.last_success_at;
              const neverHeard = !h.last_success_at && !h.last_failure_at;
              const color = neverHeard ? "var(--text-tertiary)" : healthy ? "var(--success)" : "var(--error)";
              const last = h.last_success_at ?? h.last_failure_at;
              return (
                <div key={h.id} className="adm-health-row" style={{ color }}>
                  <span className="adm-health-dot" />
                  <div>
                    <div className="adm-health-name">{h.label}</div>
                    <div className="adm-health-sub">
                      {last ? `last seen ${new Date(last).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "never heard from"}
                    </div>
                  </div>
                  <span className="adm-pill">{neverHeard ? "UNKNOWN" : healthy ? "HEALTHY" : `${h.consecutive_failures} FAIL`}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="adm-panel span-7">
          <div className="adm-panel-head">
            <div>
              <div className="adm-eyebrow">Needs a look</div>
              <h3 className="adm-panel-title">Recent failures</h3>
            </div>
            <Link href={`${basePath}/transactions?status=failed`} className="adm-panel-action">
              All failed <Icon name="chevronR" size={13} stroke={2.2} />
            </Link>
          </div>
          {recentFailures.length === 0 ? (
            <div className="adm-empty">No failures in the recent window.</div>
          ) : (
            <div className="adm-table-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Error</th>
                    <th style={{ textAlign: "right" }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFailures.map((f) => (
                    <tr key={f.id}>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        <Link href={f.transactionId ? `${basePath}/transactions/${f.transactionId}` : `${basePath}/transactions`} style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                          {f.reference ?? f.serviceId ?? "—"}
                        </Link>
                      </td>
                      <td style={{ color: "var(--text-secondary)", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.message}>
                        {f.message}
                      </td>
                      <td className="mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {new Date(f.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="adm-panel span-5">
          <div className="adm-panel-head">
            <div>
              <div className="adm-eyebrow">Last 7 days</div>
              <h3 className="adm-panel-title">Revenue by provider</h3>
            </div>
          </div>
          {ownerRows.length === 0 ? (
            <div className="adm-empty">No settled transactions yet.</div>
          ) : (
            <div className="adm-bar-list">
              {ownerRows.slice(0, 6).map((r, i) => (
                <div key={r.owner}>
                  <div className="adm-bar-head">
                    <div className="name">
                      <i style={{ background: ownerColors[i % ownerColors.length] }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.owner}</span>
                    </div>
                    <div className="val">
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>+{fmt(r.revenue)}</span> · {fmt(r.cost)} · {r.count}
                    </div>
                  </div>
                  <div className="adm-bar-track">
                    <div className="adm-bar-fill" style={{ width: `${Math.max(3, ((r.cost + r.revenue) / maxOwner) * 100)}%`, background: ownerColors[i % ownerColors.length] }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="adm-panel span-12">
          <div className="adm-panel-head">
            <div>
              <div className="adm-eyebrow">Catalog</div>
              <h3 className="adm-panel-title">Most purchased services · last 7 days</h3>
            </div>
            <Link href={`${basePath}/products`} className="adm-panel-action">
              Manage catalog <Icon name="chevronR" size={13} stroke={2.2} />
            </Link>
          </div>
          {top.length === 0 ? (
            <div className="adm-empty">No transactions yet.</div>
          ) : (
            <div className="adm-bar-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 }}>
              {top.map((t) => (
                <div key={t.id}>
                  <div className="adm-bar-head">
                    <div className="name">
                      <i style={{ background: t.color }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    </div>
                    <div className="val">{t.count} · {Math.round((t.count / topTotal) * 100)}%</div>
                  </div>
                  <div className="adm-bar-track">
                    <div className="adm-bar-fill" style={{ width: `${(t.count / topTotal) * 100}%`, background: t.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
