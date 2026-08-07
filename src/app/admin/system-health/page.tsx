import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/auth/permissions";
import type { IntegrationHealth } from "@/types/database";

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function SystemHealthPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("reports.view")) {
    return <div className="muted">You don&apos;t have permission to view system health.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("integration_health").select("*").order("id");
  const rows = (data as IntegrationHealth[]) ?? [];

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>System Health</h2>
      <div className="muted mb-3">
        Last-known-good state from the actual webhook/poll traffic for each integration — not a synthetic
        heartbeat. A provider with no successes and repeated failures needs attention.
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="card-pad muted">No integration health data recorded yet.</div>
        ) : (
          rows.map((r, i) => {
            const healthy = r.consecutive_failures === 0 && !!r.last_success_at;
            const neverHeard = !r.last_success_at && !r.last_failure_at;
            const color = neverHeard ? "var(--text-faint)" : healthy ? "var(--success)" : "var(--error)";
            return (
              <div key={r.id} style={{ padding: "14px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div className="row gap-2">
                  <div className="ibadge round" style={{ width: 36, height: 36, background: `${color}1a`, color }}>
                    <Icon name="plug" size={17} stroke={1.8} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.label}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {neverHeard ? "No traffic recorded yet" : `Last success ${timeAgo(r.last_success_at)}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color }}>
                    {neverHeard ? "Unknown" : healthy ? "Healthy" : `${r.consecutive_failures} failing`}
                  </span>
                </div>
                {r.last_error && (
                  <div className="muted mt-2" style={{ fontSize: 11.5, color: "var(--error)" }}>
                    Last error ({timeAgo(r.last_failure_at)}): {r.last_error}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
