import { redirect } from "next/navigation";
import { AccessLocked } from "@/components/admin/access-locked";
import { AdminShell } from "@/components/admin/admin-shell";
import { StaffLogin } from "@/components/admin/staff-login";
import { AnnouncementStrip } from "@/components/app-shell/announcement-strip";
import { getMyPermissions } from "@/lib/auth/permissions";
import { getAttentionCount, getPendingRefundCount, getPendingWithdrawalCount } from "@/lib/data/admin-queries";
import { getCurrentProfile } from "@/lib/data/queries";
import pkg from "../../../package.json";

// /admin is the staff console (role: 'admin') — daily operations, scoped to
// whatever permissions the owner granted. The owner's own console is the
// separate /super-admin portal (src/app/super-admin/layout.tsx); a
// superadmin landing here is bounced there rather than sharing this URL,
// since the two are deliberately different roles, not one shared page with
// more boxes ticked.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return <StaffLogin portal="admin" />;
  }
  if (profile.role === "superadmin") {
    redirect("/super-admin");
  }
  if (profile.role !== "admin") {
    return <AccessLocked title="Access restricted" message="This area is for TopMe staff accounts only." />;
  }

  const [permissions, attention, refunds, withdrawals] = await Promise.all([
    getMyPermissions(),
    getAttentionCount(),
    getPendingRefundCount(),
    getPendingWithdrawalCount(),
  ]);

  return (
    <AdminShell
      role={profile.role}
      permissions={permissions}
      basePath="/admin"
      portalLabel="Admin"
      userName={profile.full_name || profile.email || "TopMe Staff"}
      alertCount={attention + refunds + withdrawals}
      version={pkg.version}
      announcements={<AnnouncementStrip audience="staff" />}
    >
      {children}
    </AdminShell>
  );
}
