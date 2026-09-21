"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateTeamMember, deactivateTeamMember, togglePermission } from "@/lib/actions/admin";
import { PERMISSION_GROUPS, PERMISSION_LABEL } from "@/lib/auth/permission-keys";
import type { TeamMember } from "@/types/database";

const STATUS_COLOR: Record<string, string> = { invited: "var(--warning)", active: "var(--success)", disabled: "var(--text-faint)" };

// The full profile page a staff member's Manage link opens onto — settings,
// permissions and status changes live here, not on the main Staff
// Management list (which is just names and a way in — see team-client.tsx).
export function StaffMemberDetail({ member }: { member: TeamMember }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="card card-pad mb-3">
        <div className="row gap-2">
          <div className="ibadge round" style={{ width: 46, height: 46, background: "var(--muted)", color: "var(--text-soft)", fontWeight: 700 }}>
            {(member.name || member.invited_email).slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{member.name || member.invited_email}</div>
            <div className="muted" style={{ fontSize: 12 }}>{member.invited_email} · {member.role}</div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: STATUS_COLOR[member.status], textTransform: "uppercase" }}>{member.status}</span>
        </div>

        {error && <div className="muted mt-2" style={{ color: "var(--error)" }}>{error}</div>}

        <div className="row gap-2 mt-3">
          {member.status !== "active" ? (
            <button
              className="btn btn-secondary"
              style={{ height: 36, padding: "0 14px", fontSize: 12.5 }}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await activateTeamMember(member.id);
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not activate.");
                  }
                })
              }
            >
              Activate
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              style={{ height: 36, padding: "0 14px", fontSize: 12.5, color: "var(--error)" }}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await deactivateTeamMember(member.id);
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not deactivate.");
                  }
                })
              }
            >
              Deactivate
            </button>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-title" style={{ fontSize: 14 }}>Permissions</div>
        <div className="muted mt-1" style={{ fontSize: 12 }}>What {member.name || "this person"} can access in the console.</div>
        <div style={{ opacity: pending ? 0.6 : 1, marginTop: 8 }}>
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label} className="mt-2">
              <div className="muted" style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {group.label}
              </div>
              {group.keys.map((p) => {
                const on = member.permissions.includes(p);
                return (
                  <div key={p} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 13 }}>{PERMISSION_LABEL[p]}</span>
                    <button
                      type="button"
                      className={`toggle ${on ? "on" : ""}`}
                      disabled={pending}
                      aria-label={PERMISSION_LABEL[p]}
                      onClick={() => startTransition(async () => { await togglePermission(member.id, p, member.permissions); router.refresh(); })}
                    >
                      <div className="knob" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
