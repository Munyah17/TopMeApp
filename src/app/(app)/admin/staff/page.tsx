import { TeamClient } from "@/components/admin/team-client";
import { getCurrentProfile } from "@/lib/data/queries";
import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "@/types/database";

export default async function StaffPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "superadmin") {
    return <div className="muted">Only Super Admin accounts can manage staff and permissions.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("team_members").select("*").order("created_at", { ascending: false });
  const members = (data as TeamMember[]) ?? [];

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Staff & Access</h2>
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        Admin accounts handle day-to-day operations. Assign only the rights each person needs, and keep Super
        Admin access with the owner. Invites are sent as real Supabase auth invitations — activating an invite
        is what actually grants them <code>/admin</code> access.
      </div>
      <TeamClient members={members} />
    </div>
  );
}
