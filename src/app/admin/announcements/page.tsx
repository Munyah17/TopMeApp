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
      <BannersClient banners={banners} />
    </div>
  );
}
