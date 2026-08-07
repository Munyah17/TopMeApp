import { redirect } from "next/navigation";
import { AccessLocked } from "@/components/admin/access-locked";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnnouncementStrip } from "@/components/app-shell/announcement-strip";
import { PERMISSION_KEYS } from "@/lib/auth/permission-keys";
import { getCurrentProfile } from "@/lib/data/queries";

// /super-admin is the owner's own console — role: 'superadmin' only, no
// permission filtering (they always see the full nav). Staff (role: 'admin')
// get the separate /admin console instead; a plain admin landing here is
// locked out rather than redirected, since this URL is deliberately not
// theirs to share.
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return <AccessLocked title="Log in required" message="Please log in with the Super Admin account to access this console." />;
  }
  if (profile.role !== "superadmin") {
    redirect("/admin");
  }

  return (
    <AdminShell role={profile.role} permissions={[...PERMISSION_KEYS]} basePath="/super-admin" portalLabel="Super Admin" announcements={<AnnouncementStrip audience="staff" />}>
      {children}
    </AdminShell>
  );
}
