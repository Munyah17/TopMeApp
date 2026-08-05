import Link from "next/link";
import { Icon } from "@/components/icons";
import { VersionLogForm } from "@/components/admin/version-log-form";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import packageJson from "../../../../../../package.json";
import type { Profile } from "@/types/database";

interface AppVersionRow {
  id: string;
  version: string;
  channel: string;
  notes: string | null;
  released_at: string;
  released_by: string | null;
}

export default async function VersionTrackerPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("settings.manage")) {
    return <div className="muted">You don&apos;t have permission to view the version tracker.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("app_versions").select("*").order("released_at", { ascending: false });
  const rows = (data as AppVersionRow[]) ?? [];

  const releaserIds = Array.from(new Set(rows.map((r) => r.released_by).filter((id): id is string => !!id)));
  const { data: profiles } = releaserIds.length ? await supabase.from("profiles").select("id, full_name").in("id", releaserIds) : { data: [] };
  const byId = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;

  return (
    <div>
      <Link href="/admin/settings" className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Settings
      </Link>
      <h2 style={{ fontSize: 19 }}>Version Tracker</h2>

      <div className="card card-pad mb-3">
        <div className="muted">Currently deployed</div>
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 2 }}>v{packageJson.version}</div>
        {commitSha && <div className="muted mt-1" style={{ fontSize: 11 }}>{commitSha.slice(0, 10)}</div>}
      </div>

      <VersionLogForm />

      <div className="section-title mb-2">Release history</div>
      <div className="card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="card-pad muted">No releases logged yet.</div>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} style={{ padding: "12px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div className="row between">
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>v{r.version}</span>
                <span className="muted" style={{ fontSize: 11 }}>{new Date(r.released_at).toLocaleDateString("en-GB")}</span>
              </div>
              {r.notes && <div className="muted mt-1" style={{ fontSize: 12 }}>{r.notes}</div>}
              <div className="muted mt-1" style={{ fontSize: 11 }}>
                {r.released_by ? byId.get(r.released_by)?.full_name ?? "Unknown" : "System"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
