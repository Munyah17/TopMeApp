import Link from "next/link";
import { Icon } from "@/components/icons";
import { BannersClient } from "@/components/admin/banners-client";
import { getAllPromoBanners, getCurrentProfile } from "@/lib/data/queries";

export default async function BannersPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "superadmin") {
    return (
      <div>
        <div className="topbar">
          <Link href="/account" className="backbtn tap" style={{ textDecoration: "none" }}>
            <Icon name="chevronL" size={18} stroke={2.2} />
          </Link>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Home Banner</div>
        </div>
        <div className="px content-wrap">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
            <div
              style={{
                width: 74,
                height: 74,
                borderRadius: 22,
                background: "#F1F4F9",
                color: "var(--text-faint)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="lock" size={32} stroke={1.6} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>Super Admin only</div>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>
              Only Super Admin accounts can manage the home page banner.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const banners = await getAllPromoBanners();

  return (
    <div>
      <div className="topbar">
        <Link href="/admin" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Home Banner</div>
        </div>
      </div>
      <div className="px content-wrap">
        <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
          Manage the promotional banner shown on the customer Home page. Only the active banner
          with the lowest sort order is shown — activate, deactivate or replace it at any time.
        </div>
        <BannersClient banners={banners} />
      </div>
    </div>
  );
}
