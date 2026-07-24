import Link from "next/link";
import { Icon } from "@/components/icons";
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
  if (!profile) return null;

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
      <h2 style={{ fontSize: 20 }}>History</h2>

      <form method="get" className="row gap-2 mt-2 mb-2">
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#fff",
            border: "1.5px solid var(--border)",
            borderRadius: 14,
            padding: "11px 14px",
          }}
        >
          <Icon name="search" size={16} stroke={2} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search history"
            style={{ border: "none", outline: "none", fontFamily: "inherit", fontWeight: 600, fontSize: 13.5, flex: 1, background: "transparent" }}
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              background: "#F1F4F9",
              color: "var(--text-faint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="search" size={32} stroke={1.6} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>No transactions found</div>
          <div className="muted mt-1" style={{ maxWidth: 230 }}>
            Try a different search term or filter.
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
                    <div className="ibadge" style={{ background: svc ? `${svc.color}1a` : "#F1F4F9", color: svc?.color }}>
                      <Icon name={svc?.icon || "wallet"} size={20} stroke={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{svc?.name || t.service_id}</div>
                      <div className="muted">
                        {new Date(t.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {t.reference}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>-{fmt(t.amount)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.status === "success" ? "var(--success)" : t.status === "pending" ? "var(--warning)" : "var(--error)" }}>
                        {t.status === "success" ? "Success" : t.status === "pending" ? "Pending" : "Failed"}
                      </div>
                    </div>
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
