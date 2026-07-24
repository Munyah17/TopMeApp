import Link from "next/link";
import { Icon } from "@/components/icons";
import { TeamClient } from "@/components/admin/team-client";
import { getCurrentProfile } from "@/lib/data/queries";
import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "@/types/database";

export default async function TeamRolesPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "superadmin") {
    return (
      <div>
        <div className="topbar">
          <Link href="/account" className="backbtn tap" style={{ textDecoration: "none" }}>
            <Icon name="chevronL" size={18} stroke={2.2} />
          </Link>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Team & Roles</div>
        </div>
        <div className="px content-wrap">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
            <div style={{ width: 74, height: 74, borderRadius: 22, background: "#F1F4F9", color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="lock" size={32} stroke={1.6} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>Super Admin only</div>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>
              Only Super Admin accounts can manage staff and permissions.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.from("team_members").select("*").order("created_at", { ascending: false });
  const members = (data as TeamMember[]) ?? [];

  return (
    <div>
      <div className="topbar">
        <Link href="/admin" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Team & Roles</div>
        </div>
      </div>
      <div className="px content-wrap">
        <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
          Admin accounts handle day-to-day operations. Assign only the rights each person needs, and keep Super
          Admin access with the owner. Invites are sent as real Supabase auth invitations.
        </div>
        <TeamClient members={members} />
      </div>
    </div>
  );
}
