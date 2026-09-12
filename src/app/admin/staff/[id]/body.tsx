import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { StaffMemberDetail } from "@/components/admin/staff-member-detail";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "@/types/database";

export async function StaffMemberBody({ id, basePath }: { id: string; basePath: string }) {
  const permissions = await getMyPermissions();
  if (!permissions.includes("staff.manage")) {
    return <div className="muted">You don&apos;t have permission to manage staff and permissions.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("team_members").select("*").eq("id", id).single();
  const member = data as TeamMember | null;
  if (!member) notFound();

  return (
    <div>
      <Link href={`${basePath}/staff`} className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Staff Management
      </Link>
      <StaffMemberDetail member={member} />
    </div>
  );
}
