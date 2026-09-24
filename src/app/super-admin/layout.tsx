import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { StaffLogin } from "@/components/admin/staff-login";
import { AnnouncementStrip } from "@/components/app-shell/announcement-strip";
import { PERMISSION_KEYS } from "@/lib/auth/permission-keys";
import { getAttentionCount, getPendingRefundCount, getPendingWithdrawalCount } from "@/lib/data/admin-queries";
import { getCurrentProfile } from "@/lib/data/queries";
import pkg from "../../../package.json";

// /super-admin is the owner's own console — role: 'superadmin' only, no
// permission filtering (they always see the full nav). Staff (role: 'admin')
// get the separate /admin console instead; a plain admin landing here is
// locked out rather than redirected, since this URL is deliberately not
// theirs to share.
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return <StaffLogin portal="superadmin" />;
  }
  if (profile.role !== "superadmin") {
    redirect("/admin");
  }

  const [attention, refunds, withdrawals] = await Promise.all([getAttentionCount(), getPendingRefundCount(), getPendingWithdrawalCount()]);

  return (
    <AdminShell
      role={profile.role}
      permissions={[...PERMISSION_KEYS]}
      basePath="/super-admin"
      portalLabel="Super Admin"
      userName={profile.full_name || profile.email || "TopMe Staff"}
      alertCount={attention + refunds + withdrawals}
      version={pkg.version}
      announcements={<AnnouncementStrip audience="staff" />}
    >
      {children}
    </AdminShell>
  );
}
