import { TeamClient } from "@/components/admin/team-client";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "@/types/database";

export default async function StaffPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("staff.manage")) {
    return <div className="muted">You don&apos;t have permission to manage staff and permissions.</div>;
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
