import { redirect } from "next/navigation";
import { AccessLocked } from "@/components/admin/access-locked";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnnouncementStrip } from "@/components/app-shell/announcement-strip";
import { getMyPermissions } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/data/queries";

// /admin is the staff console (role: 'admin') — daily operations, scoped to
// whatever permissions the owner granted. The owner's own console is the
// separate /super-admin portal (src/app/super-admin/layout.tsx); a
// superadmin landing here is bounced there rather than sharing this URL,
// since the two are deliberately different roles, not one shared page with
// more boxes ticked.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return <AccessLocked title="Log in required" message="Please log in with a TopMe staff account to access the admin console." />;
  }
  if (profile.role === "superadmin") {
    redirect("/super-admin");
  }
  if (profile.role !== "admin") {
    return <AccessLocked title="Access restricted" message="This area is for TopMe staff accounts only." />;
  }

  const permissions = await getMyPermissions();

  return (
    <AdminShell role={profile.role} permissions={permissions} basePath="/admin" portalLabel="Admin" announcements={<AnnouncementStrip audience="staff" />}>
      {children}
    </AdminShell>
  );
}
