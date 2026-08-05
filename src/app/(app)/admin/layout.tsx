import { AccessLocked } from "@/components/admin/access-locked";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnnouncementStrip } from "@/components/app-shell/announcement-strip";
import { getMyPermissions } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/data/queries";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return <AccessLocked title="Log in required" message="Please log in with a TopMe staff account to access the command center." />;
  }
  if (profile.role === "customer") {
    return <AccessLocked title="Access restricted" message="This area is for TopMe staff accounts only." />;
  }

  const permissions = await getMyPermissions();

  return (
    <AdminShell role={profile.role} permissions={permissions} announcements={<AnnouncementStrip audience="staff" />}>
      {children}
    </AdminShell>
  );
}
