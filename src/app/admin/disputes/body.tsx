import Link from "next/link";
import { getDisputes } from "@/lib/data/dispute-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

const STATUS_COLOR: Record<string, string> = {
  open: "var(--warning)",
  investigating: "var(--blue)",
  resolved: "var(--success)",
  rejected: "var(--error)",
};

export async function DisputesBody({ searchParams, basePath }: { searchParams: Promise<{ status?: string }>; basePath: string }) {
  const [params, permissions] = await Promise.all([searchParams, getMyPermissions()]);
  if (!permissions.includes("disputes.manage")) {
    return <div className="muted">You don&apos;t have permission to view disputes.</div>;
  }

  const disputes = await getDisputes(params.status);

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Disputes</h2>
      <div className="muted mb-3">Customer-raised or staff-logged disputes against a transaction.</div>

      <div className="row gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        {["", "open", "investigating", "resolved", "rejected"].map((s) => (
          <Link
            key={s || "all"}
            href={s ? `${basePath}/disputes?status=${s}` : `${basePath}/disputes`}
            className={`chip tap ${((params.status ?? "") === s) ? "selected" : ""}`}
            style={{ textDecoration: "none", textTransform: "capitalize" }}
          >
            {s || "All"}
          </Link>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {disputes.length === 0 ? (
          <div className="card-pad muted">No disputes.</div>
        ) : (
          disputes.map((d, i) => (
            <Link
              key={d.id}
              href={`${basePath}/disputes/${d.id}`}
              className="row between tap"
              style={{ padding: "12px 16px", borderBottom: i < disputes.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.subject}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {d.raised_by_profile?.full_name || d.raised_by_profile?.phone || "Unknown"} ·{" "}
                  {new Date(d.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[d.status], textTransform: "capitalize" }}>{d.status}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
