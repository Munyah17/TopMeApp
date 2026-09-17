import Link from "next/link";
import { Icon } from "@/components/icons";
import { FavoriteButton } from "@/components/home/favorite-button";
import { fmt } from "@/lib/data/catalog-helpers";
import { getBeneficiaries, getFavoriteServiceIds, getRecentTransactions } from "@/lib/data/queries";
import type { Profile } from "@/types/database";

// The account widgets that used to sit in a right-hand column on /home
// ("Need a hand?", "Recent activity", "Saved beneficiaries"). They now live
// in the desktop left rail so the product grid can use the full page width.
// Rendered as a server component (passed into the client AppShell like
// `announcements`) so it can fetch its own data and use the Set-returning
// favourites query without serialising it across the client boundary.
export async function SidebarWidgets({ profile }: { profile: Profile }) {
  const [recent, beneficiaries, favoriteIds] = await Promise.all([
    getRecentTransactions(profile.id, 3),
    getBeneficiaries(profile.id),
    getFavoriteServiceIds(profile.id),
  ]);
  const monthSpend = recent.reduce((sum, t) => (t.status === "success" ? sum + t.amount : sum), 0);

  return (
    <div className="side-widgets">
      <Link href="/chat" className="side-widget side-widget-link">
        <span className="side-widget-ic">
          <Icon name="headset" size={16} stroke={1.8} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="side-widget-title" style={{ display: "block" }}>
            Need a hand?
          </span>
          <span className="side-widget-sub">We usually reply within minutes</span>
        </span>
        <Icon name="chevronR" size={15} stroke={2} />
      </Link>

      <div className="side-widget">
        <div className="side-widget-title">Recent activity</div>
        <div className="side-widget-big">{fmt(monthSpend)}</div>
        <div className="side-widget-sub">
          Across your last {recent.length} payment{recent.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="side-widget">
        <div className="side-widget-title">Saved beneficiaries</div>
        {beneficiaries.length === 0 ? (
          <div className="side-widget-sub" style={{ marginTop: 6 }}>
            Recipients you pay often are saved here for quick reuse.
          </div>
        ) : (
          beneficiaries.slice(0, 3).map((b) => (
            <div className="side-bene-row" key={b.id}>
              <span className="side-bene-avatar">{(b.label || b.identifier).slice(0, 2).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="side-bene-name">{b.label || b.identifier}</span>
                <span className="side-widget-sub" style={{ display: "block" }}>
                  {b.service_id}
                </span>
              </span>
              <FavoriteButton serviceId={b.service_id || ""} isFavorite={favoriteIds.has(b.service_id || "")} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
