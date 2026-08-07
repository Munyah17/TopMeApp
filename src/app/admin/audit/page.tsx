import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/auth/permissions";
import type { AdminAuditLogRow, Profile } from "@/types/database";

export default async function AuditLogPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("audit.view")) {
    return <div className="muted">You don&apos;t have permission to view the audit log.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(200);
  const rows = (data as AdminAuditLogRow[]) ?? [];

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id)));
  const { data: profiles } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const byId = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Audit Log</h2>
      <div className="muted mb-3">Every rectification, staff change, and catalog write, in order — most recent first.</div>

      <div className="card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="card-pad muted">No audit entries yet.</div>
        ) : (
          rows.map((r, i) => {
            const actor = r.actor_id ? byId.get(r.actor_id) : null;
            return (
              <div key={r.id} style={{ padding: "12px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div className="row between">
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{r.action}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{new Date(r.created_at).toLocaleString("en-GB")}</span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {actor?.full_name || actor?.email || "System"}
                  {r.target_table && ` · ${r.target_table}${r.target_id ? `:${r.target_id.slice(0, 8)}` : ""}`}
                </div>
                {Object.keys(r.meta ?? {}).length > 0 && (
                  <pre style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {JSON.stringify(r.meta)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
