"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { addTeamMember } from "@/lib/actions/admin";
import type { TeamMember } from "@/types/database";

const MEMBER_ROLES = ["Manager", "Support", "Finance"];

function AddUserForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Manager");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  // The account already exists and can log in the moment this is shown —
  // this password is generated once, returned once, and never stored or
  // logged anywhere else, so this screen is the only place to copy it from.
  if (created) {
    return (
      <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="section-title" style={{ fontSize: 14 }}>Account created</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          Share these with {created.email} however you like — this password won&apos;t be shown again. They can sign
          in right away and change it from their own profile.
        </div>
        <div className="field" style={{ userSelect: "all", fontWeight: 700 }}>{created.email}</div>
        <div className="field" style={{ userSelect: "all", fontWeight: 700, fontFamily: "monospace" }}>{created.password}</div>
        <button className="btn btn-primary btn-block" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title" style={{ fontSize: 14 }}>
        Add team member
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
              const result = await addTeamMember({ name, email, role });
              setCreated(result);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not add this user.");
            }
          });
        }}
      >
        {pending ? "Creating…" : "Add user"}
      </button>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = { invited: "var(--warning)", active: "var(--success)", disabled: "var(--text-faint)" };

// Compact by design — settings, status changes and permissions all moved
// to this member's own full profile page (staff-member-detail.tsx). This
// row is just enough to identify someone and get to that page; a
// permissions table for every staff member expanded by default here was
// real, unnecessary space, especially with more than a couple of staff.
function MemberCard({ member, basePath }: { member: TeamMember; basePath: string }) {
  return (
    <Link
      href={`${basePath}/staff/${member.id}`}
      className="card card-pad mb-2 tap row gap-2"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        className="ibadge round"
        style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}
      >
        {(member.name || member.invited_email).slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{member.name || member.invited_email}</div>
        <div className="muted" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {member.invited_email} · {member.role}
        </div>
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: STATUS_COLOR[member.status], textTransform: "uppercase", flexShrink: 0 }}>{member.status}</span>
      <Icon name="chevronR" size={16} stroke={2} />
    </Link>
  );
}

export function TeamClient({ members }: { members: TeamMember[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/super-admin") ? "/super-admin" : "/admin";

  return (
    <>
      <button className="btn btn-primary mb-3" style={{ height: 40, padding: "0 16px" }} onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? "x" : "plus"} size={15} stroke={2.4} /> {open ? "Close" : "Add user"}
      </button>

      {open && (
        <AddUserForm
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}

      {members.map((m) => (
        <MemberCard key={m.id} member={m} basePath={basePath} />
      ))}
    </>
  );
}
