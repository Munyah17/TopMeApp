import { BannersClient } from "@/components/admin/banners-client";
import { getAllPromoBanners, getCurrentProfile } from "@/lib/data/queries";

export default async function AnnouncementsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "superadmin") {
    return <div className="muted">Only Super Admin accounts can manage announcements and the home banner.</div>;
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
