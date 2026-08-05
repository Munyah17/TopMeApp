"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { activateTeamMember, deactivateTeamMember, inviteTeamMember, togglePermission } from "@/lib/actions/admin";
import { PERMISSION_KEYS, PERMISSION_LABEL } from "@/lib/auth/permission-keys";
import type { TeamMember } from "@/types/database";

const MEMBER_ROLES = ["Manager", "Support", "Finance"];

function InviteForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Manager");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title" style={{ fontSize: 14 }}>
        Invite team member
      </div>
      <div>
        <label className="field-label">Full Name</label>
        <input className="field" placeholder="e.g. Tanaka Chirwa" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Email</label>
        <input className="field" placeholder="name@topme.co.zw" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Role</label>
        <div className="row gap-2">
          {MEMBER_ROLES.map((r) => (
            <div key={r} className={`chip tap ${role === r ? "selected" : ""}`} onClick={() => setRole(r)}>
              {r}
            </div>
          ))}
        </div>
      </div>
      {error && (
        <div className="muted" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      <button
        className="btn btn-primary btn-block"
        disabled={!name || !email || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await inviteTeamMember({ name, email, role });
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not send invite.");
            }
          });
        }}
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = { invited: "var(--warning)", active: "var(--success)", disabled: "var(--text-faint)" };

function MemberCard({ member }: { member: TeamMember }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card card-pad mb-2">
      <div className="row gap-2">
        <div
          className="ibadge round"
          style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)", fontSize: 12, fontWeight: 700 }}
        >
          {(member.name || member.invited_email).slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{member.name || member.invited_email}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {member.invited_email} · {member.role}
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: STATUS_COLOR[member.status], textTransform: "uppercase" }}>{member.status}</span>
      </div>

      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      <div className="row gap-2 mt-2">
        {member.status !== "active" ? (
          <button
            className="btn btn-secondary"
            style={{ height: 34, padding: "0 14px", fontSize: 12 }}
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
            style={{ height: 34, padding: "0 14px", fontSize: 12, color: "var(--error)" }}
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

      <div className="muted mt-2" style={{ fontSize: 11 }}>
        Permissions
      </div>
      <div className="row gap-1 mt-1" style={{ flexWrap: "wrap", opacity: pending ? 0.6 : 1 }}>
        {PERMISSION_KEYS.map((p) => (
          <div
            key={p}
            className={`chip tap ${member.permissions.includes(p) ? "selected" : ""}`}
            style={{ padding: "6px 10px", fontSize: 11 }}
            title={p}
            onClick={() => startTransition(async () => { await togglePermission(member.id, p, member.permissions); router.refresh(); })}
          >
            {PERMISSION_LABEL[p]}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamClient({ members }: { members: TeamMember[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button className="btn btn-primary" style={{ height: 40, padding: "0 16px" }} onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? "x" : "plus"} size={15} stroke={2.4} /> {open ? "Close" : "Invite"}
      </button>

      {open && (
        <InviteForm
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}

      {members.map((m) => (
        <MemberCard key={m.id} member={m} />
      ))}
    </>
  );
}
