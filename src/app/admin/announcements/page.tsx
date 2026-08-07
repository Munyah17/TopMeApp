import { BannersClient } from "@/components/admin/banners-client";
import { getAllPromoBanners } from "@/lib/data/queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export default async function AnnouncementsPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("announcements.manage")) {
    return <div className="muted">You don&apos;t have permission to manage announcements and the home banner.</div>;
  }

  const banners = await getAllPromoBanners();

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Announcements</h2>
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        Image banners show on the customer Home page (only the active one with the lowest sort order is
        shown). Text announcements broadcast to customers, staff, or both, on top of that.
      </div>
      <BannersClient banners={banners} />
    </div>
  );
}
