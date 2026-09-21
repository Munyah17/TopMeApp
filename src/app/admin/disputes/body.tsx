import Link from "next/link";
import { statusTone } from "@/lib/data/catalog-helpers";
import { getDisputes } from "@/lib/data/dispute-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

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
            className={`filter-pill tap ${((params.status ?? "") === s) ? "selected" : ""}`}
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
              <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.subject}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {d.raised_by_profile?.full_name || d.raised_by_profile?.phone || "Unknown"} ·{" "}
                  {new Date(d.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  {d.assigned_to_profile && <> · Assigned: {d.assigned_to_profile.full_name}</>}
                </div>
              </div>
              <span className={`status-badge ${statusTone(d.status)}`} style={{ textTransform: "capitalize", flexShrink: 0 }}>{d.status}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
