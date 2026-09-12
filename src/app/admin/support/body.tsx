import Link from "next/link";
import { getSupportTickets } from "@/lib/data/support-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

const STATUS_COLOR: Record<string, string> = {
  open: "var(--warning)",
  in_progress: "var(--blue)",
  resolved: "var(--success)",
  closed: "var(--text-faint)",
};

export async function SupportBody({ searchParams, basePath }: { searchParams: Promise<{ status?: string }>; basePath: string }) {
  const [params, permissions] = await Promise.all([searchParams, getMyPermissions()]);
  if (!permissions.includes("support.manage")) {
    return <div className="muted">You don&apos;t have permission to view support tickets.</div>;
  }

  const tickets = await getSupportTickets(params.status);

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Support Tickets</h2>
      <div className="muted mb-3">Customer issues, from account holders or guests.</div>

      <div className="row gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        {["", "open", "in_progress", "resolved", "closed"].map((s) => (
          <Link
            key={s || "all"}
            href={s ? `${basePath}/support?status=${s}` : `${basePath}/support`}
            className={`filter-pill tap ${((params.status ?? "") === s) ? "selected" : ""}`}
            style={{ textDecoration: "none", textTransform: "capitalize" }}
          >
            {(s || "all").replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {tickets.length === 0 ? (
          <div className="card-pad muted">No tickets.</div>
        ) : (
          tickets.map((t, i) => (
            <Link
              key={t.id}
              href={`${basePath}/support/${t.id}`}
              className="row between tap"
              style={{ padding: "12px 16px", borderBottom: i < tickets.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none" }}
            >
              <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.subject}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {t.user_profile?.full_name || t.user_profile?.email || t.guest_email || t.guest_phone || "Unknown"} ·{" "}
                  {new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  {t.assigned_to_profile && <> · Assigned: {t.assigned_to_profile.full_name}</>}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[t.status], textTransform: "capitalize", flexShrink: 0 }}>
                {t.status.replace("_", " ")}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
