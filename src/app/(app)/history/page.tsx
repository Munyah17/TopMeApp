import Link from "next/link";
import { Icon } from "@/components/icons";
import { GuestHistory } from "@/components/history/guest-history";
import { fmt } from "@/lib/data/catalog-helpers";
import { getAllServices, getCurrentProfile, getRecentTransactions } from "@/lib/data/queries";
import type { Service, Transaction } from "@/types/database";

const FILTERS = ["All", "Airtime", "ZESA", "DStv", "Bills"] as const;

function matchesFilter(tx: Transaction, service: Service | undefined, filter: string) {
  if (filter === "All") return true;
  if (!service) return false;
  if (filter === "Airtime") return service.category_id === "airtimedata";
  if (filter === "ZESA") return service.id === "zesa";
  if (filter === "DStv") return service.id === "dstv";
  if (filter === "Bills") return ["council", "schoolfees", "govfees"].includes(service.id);
  return true;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q = "", filter = "All" } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) {
    return (
      <div className="px content-wrap" style={{ paddingTop: 6 }}>
        <h2 style={{ fontSize: 20 }}>History</h2>
        <GuestHistory />
      </div>
    );
  }

  const [transactions, services] = await Promise.all([getRecentTransactions(profile.id, 200), getAllServices()]);
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const query = q.toLowerCase();

  const filtered = transactions.filter((t) => {
    const svc = serviceById.get(t.service_id);
    if (!matchesFilter(t, svc, filter)) return false;
    if (query && !(svc?.name || t.service_id).toLowerCase().includes(query)) return false;
    return true;
  });

  const groups = new Map<string, Transaction[]>();
  for (const t of filtered) {
    const key = new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  return (
    <div className="px content-wrap" style={{ paddingTop: 6 }}>
      <h2 style={{ fontSize: 22, letterSpacing: "-0.02em" }}>History</h2>

      <form method="get" className="row gap-2 mt-3 mb-2">
        <div className="header-search" style={{ flex: 1, maxWidth: "none", cursor: "text" }}>
          <Icon name="search" size={16} stroke={2} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search history"
            style={{ border: "none", outline: "none", fontFamily: "inherit", fontWeight: 500, fontSize: 13.5, flex: 1, background: "transparent", color: "var(--text-primary)" }}
          />
        </div>
        <input type="hidden" name="filter" value={filter} />
        <button type="submit" className="backbtn tap" style={{ width: 44, height: 44 }}>
          <Icon name="search" size={17} stroke={2} />
        </button>
      </form>

      <div className="scroll-x gap-1 mb-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/history?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`chip tap ${filter === f ? "selected" : ""}`}
            style={{ textDecoration: "none" }}
          >
            {f}
          </Link>
        ))}
      </div>

      {groups.size === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Icon name={transactions.length === 0 ? "clock" : "search"} size={20} stroke={1.8} />
            </div>
            <div className="empty-state-title">
              {transactions.length === 0 ? "No transactions yet" : "Nothing matches"}
            </div>
            <div className="empty-state-text">
              {transactions.length === 0
                ? "Payments and top-ups you make will show up here."
                : "Try a different search term or filter."}
            </div>
            {transactions.length === 0 && (
              <Link href="/services" className="btn btn-secondary tap" style={{ marginTop: 8, height: 40, textDecoration: "none" }}>
                Browse services
              </Link>
            )}
          </div>
        </div>
      ) : (
        Array.from(groups.entries()).map(([date, list]) => (
          <div key={date}>
            <div className="eyebrow mt-2 mb-1" style={{ paddingLeft: 2 }}>
              {date}
            </div>
            <div className="card" style={{ overflow: "hidden", marginBottom: 14 }}>
              {list.map((t, i) => {
                const svc = serviceById.get(t.service_id);
                return (
                  <div
                    key={t.id}
                    className="row gap-2 hist-row"
                    style={{ padding: "14px 16px", borderBottom: i < list.length - 1 ? "1px solid var(--border)" : "none" }}
                  >
                    <div className="ibadge" style={{ background: svc ? `${svc.color}1a` : "var(--badge-neutral-bg)", color: svc?.color }}>
                      <Icon name={svc?.icon || "wallet"} size={20} stroke={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em" }}>{svc?.name || t.service_id}</div>
                      <div className="muted">
                        {new Date(t.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {t.reference}
                      </div>
                    </div>
                    {(() => {
                      const refunded = (t.receipt as { refunded?: boolean } | null)?.refunded === true;
                      const label = refunded
                        ? "Refunded"
                        : t.status === "success"
                          ? "Success"
                          : t.status === "pending"
                            ? "Pending"
                            : "Failed";
                      const tone = refunded
                        ? "info"
                        : t.status === "success"
                          ? "success"
                          : t.status === "pending"
                            ? "warning"
                            : "error";
                      return (
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>-{fmt(t.amount)}</div>
                          <span className={`status-badge ${tone}`} style={{ marginTop: 4 }}>{label}</span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
