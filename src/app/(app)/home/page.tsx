import Link from "next/link";
import { Icon } from "@/components/icons";
import { FavoriteButton } from "@/components/home/favorite-button";
import { GuestRecent } from "@/components/home/guest-recent";
import { ProductCard } from "@/components/home/product-card";
import { QuickSearch } from "@/components/home/quick-search";
import { fmt } from "@/lib/data/catalog-helpers";
import { getInsuranceProducts } from "@/lib/actions/insurance";
import { InsuranceCard } from "@/components/insurance/insurance-card";
import {
  getActivePromoBanner,
  getAllServices,
  getBeneficiaries,
  getCategories,
  getCurrentProfile,
  getFavoriteServiceIds,
  getGridWidgetBanners,
  getRecentTransactions,
} from "@/lib/data/queries";

const CAT_ROW_DESKTOP_COLUMNS = 4;

export default async function HomePage() {
  const profile = await getCurrentProfile();

  const [categories, services, favoriteIds, recent, beneficiaries, promoBanner, gridWidgets, insuranceProducts] = await Promise.all([
    getCategories(),
    getAllServices(),
    profile ? getFavoriteServiceIds(profile.id) : Promise.resolve(new Set<string>()),
    profile ? getRecentTransactions(profile.id, 3) : Promise.resolve([]),
    profile ? getBeneficiaries(profile.id) : Promise.resolve([]),
    getActivePromoBanner(),
    profile ? getGridWidgetBanners() : Promise.resolve([]),
    getInsuranceProducts(),
  ]);
  // Cursor shared across all category rows below so, with more than one
  // active widget, they rotate rather than always showing the same one.
  let widgetCursor = 0;

  const servicesByCategory = new Map<string, typeof services>();
  for (const s of services) {
    const arr = servicesByCategory.get(s.category_id) ?? [];
    arr.push(s);
    servicesByCategory.set(s.category_id, arr);
  }
  const favoriteServices = services.filter((s) => favoriteIds.has(s.id));

  const monthSpend = recent.reduce((sum, t) => (t.status === "success" ? sum + t.amount : sum), 0);

  return (
    <div className="px content-wrap" style={{ paddingTop: 6 }}>
      {/* Logged-in users get the two-column home layout: product catalog on
          the left, account widgets (help / activity / beneficiaries) in a
          sticky right rail. Guests see the catalog full-width — the widgets
          are account data, so they're gated on the server-side profile, not
          a client cookie. */}
      <div className={profile ? "home-grid" : ""}>
        <div className="col-main">
          <div className="quickpay-gift-row">
            <div
              style={{
                background: "linear-gradient(135deg, var(--green-800) 0%, var(--green-950) 100%)",
                borderRadius: 16,
                padding: "24px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ position: "absolute", right: -40, top: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(167,243,208,0.10)" }} />
              <div style={{ position: "absolute", right: 40, bottom: -30, width: 80, height: 80, borderRadius: "50%", background: "rgba(167,243,208,0.07)" }} />
              <div className="eyebrow" style={{ color: "var(--green-200)", position: "relative" }}>
                New
              </div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 20, marginTop: 4, position: "relative" }}>
                Send a Gift Voucher
              </div>
              <div className="muted" style={{ color: "rgba(255,255,255,0.7)", marginTop: 8, fontSize: 13, position: "relative", maxWidth: 440, lineHeight: 1.5 }}>
                Send money straight to your family and friends&apos; TopMe wallets in seconds.
                Perfect for birthdays, school fees, or just helping someone out.
              </div>
              <div className="row mt-4" style={{ position: "relative", gap: 8 }}>
                <Link
                  href={profile ? "/wallet" : "/login"}
                  className="btn btn-primary tap"
                  style={{ flex: "30 1 0", height: 44, fontSize: 13, padding: "0 10px", gap: 6, textDecoration: "none", minWidth: 0, whiteSpace: "nowrap" }}
                >
                  <Icon name="wallet" size={16} stroke={2} />
                  <span>Top Up</span>
                </Link>
                <Link
                  href={profile ? "/pay/gift" : "/login"}
                  className="btn tap"
                  style={{
                    flex: "30 1 0",
                    height: 44,
                    fontSize: 13,
                    padding: "0 10px",
                    gap: 6,
                    textDecoration: "none",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.2)",
                    minWidth: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="gift" size={16} stroke={2} />
                  <span>Gift</span>
                </Link>
                <Link
                  href={profile ? "/pay/send?kind=red_packet" : "/login"}
                  className="btn tap"
                  style={{
                    flex: "40 1 0",
                    height: 44,
                    fontSize: 13,
                    padding: "0 10px",
                    gap: 6,
                    textDecoration: "none",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.2)",
                    minWidth: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="packet" size={16} stroke={2} />
                  <span>Red Packet</span>
                </Link>
              </div>
            </div>

            <div className="card card-pad quickpay-card">
              <div className="row between">
                <span style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>Quick Pay</span>
                <Link href="/services" className="muted" style={{ textDecoration: "none" }}>
                  See all
                </Link>
              </div>
              <div className="muted mt-1">Which service do you want to pay for?</div>

              <QuickSearch services={services} />

              <div className="tx-quickgrid mt-3" style={{ padding: "2px 2px 6px" }}>
                {favoriteServices.map((f) => {
                  const cat = categories.find((c) => c.id === f.category_id);
                  return (
                    <Link
                      key={f.id}
                      href={`/pay/${f.id}`}
                      className="tap"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        flexShrink: 0,
                        width: 66,
                        textDecoration: "none",
                      }}
                    >
                      <div
                        className="ibadge round"
                        style={{ background: cat?.bg, color: cat?.color }}
                      >
                        <Icon name={f.icon} size={22} stroke={1.8} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, textAlign: "center", lineHeight: 1.2, color: "var(--text-secondary)" }}>
                        {f.name.split(" ")[0]}
                      </span>
                    </Link>
                  );
                })}
                <Link
                  href="/services"
                  className="tap"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, width: 66, textDecoration: "none" }}
                >
                  <div
                    className="ibadge round"
                    style={{ background: "var(--badge-neutral-bg)", color: "var(--text-soft)", border: "1.5px dashed var(--border)" }}
                  >
                    <Icon name="plus" size={20} stroke={2} />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-faint)" }}>More</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="row between mt-3 mb-2">
            <span className="section-title">Recent</span>
            <Link href="/history" className="muted" style={{ textDecoration: "none" }}>
              See all
            </Link>
          </div>
          {!profile ? (
            <GuestRecent />
          ) : recent.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Icon name="clock" size={20} stroke={1.8} />
                </div>
                <div className="empty-state-title">No activity yet</div>
                <div className="empty-state-text">Payments and top-ups you make will show up here.</div>
                <Link href="/services" className="btn btn-secondary tap" style={{ marginTop: 8, height: 40, textDecoration: "none" }}>
                  Browse services
                </Link>
              </div>
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              {recent.map((t, i) => {
                const svc = services.find((s) => s.id === t.service_id);
                return (
                  <Link
                    key={t.id}
                    href="/history"
                    className="row gap-2 tap"
                    style={{
                      padding: "14px 16px",
                      borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none",
                      textDecoration: "none",
                    }}
                  >
                    <div className="ibadge" style={{ background: svc ? `${svc.color}1a` : "var(--badge-neutral-bg)", color: svc?.color }}>
                      <Icon name={svc?.icon || "wallet"} size={20} stroke={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{svc?.name || t.service_id}</div>
                      <div className="muted">
                        {new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>-{fmt(t.amount)}</div>
                      <span className={`status-badge ${t.status === "success" ? "success" : t.status === "pending" ? "warning" : "error"}`} style={{ marginTop: 4 }}>
                        {t.status === "success" ? "Success" : t.status === "pending" ? "Pending" : "Failed"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {insuranceProducts.length > 0 && (
            <div>
              <div className="row between mt-3 mb-2" style={{ gap: 10 }}>
                <div className="row gap-2" style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="ibadge round"
                    style={{
                      width: 30,
                      height: 30,
                      background: categories.find((c) => c.id === "insurance")?.bg ?? "#e0e7ff",
                      color: categories.find((c) => c.id === "insurance")?.color ?? "#6366f1",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="shield" size={15} stroke={1.8} />
                  </div>
                  <span className="section-title">Insurance</span>
                </div>
                <Link href="/insurance" className="muted see-all-link" style={{ flexShrink: 0 }}>
                  See all <Icon name="chevronR" size={13} stroke={2.4} />
                </Link>
              </div>
              <div className="cat-section-row">
                {insuranceProducts.slice(0, CAT_ROW_DESKTOP_COLUMNS).map((product) => (
                  <InsuranceCard
                    key={product.id}
                    product={product}
                    categoryColor={categories.find((c) => c.id === "insurance")?.color}
                  />
                ))}
              </div>
            </div>
          )}

          {categories.map((c) => {
            // Insurance has its own dedicated flow - skip in services listing
            if (c.id === "insurance") return null;
            
            const items = (servicesByCategory.get(c.id) ?? []).slice(0, 4);
            const total = servicesByCategory.get(c.id)?.length ?? 0;
            if (items.length === 0) return null;
            return (
              <div key={c.id}>
                <div className="row between mt-3 mb-2" style={{ gap: 10 }}>
                  <div className="row gap-2" style={{ minWidth: 0, flex: 1 }}>
                    <div className="ibadge round" style={{ width: 30, height: 30, background: c.bg, color: c.color, flexShrink: 0 }}>
                      <Icon name={c.icon} size={15} stroke={1.8} />
                    </div>
                    <span className="section-title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.name}
                    </span>
                  </div>
                  {total > 4 && (
                    <Link href={`/services/${c.id}`} className="muted see-all-link" style={{ flexShrink: 0 }}>
                      See all <Icon name="chevronR" size={13} stroke={2.4} />
                    </Link>
                  )}
                </div>
                <div className="cat-section-row">
                  {items.map((i) => (
                    <ProductCard key={i.id} service={i} categoryColor={c.color} />
                  ))}
                  {gridWidgets.length > 0 &&
                    items.length < CAT_ROW_DESKTOP_COLUMNS &&
                    Array.from({ length: CAT_ROW_DESKTOP_COLUMNS - items.length }, () => {
                      const widget = gridWidgets[widgetCursor % gridWidgets.length];
                      widgetCursor += 1;
                      const content = (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded widget tile, arbitrary host
                        <img src={widget.image_url ?? ""} alt={widget.title ?? "Promotion"} className="cat-widget-img" />
                      );
                      return (
                        <div key={`widget-${widget.id}-${widgetCursor}`} className="cat-widget-tile">
                          {widget.link_url ? <Link href={widget.link_url}>{content}</Link> : content}
                        </div>
                      );
                    })}
                </div>

                {c.id === "gadgets" && promoBanner && (
                  promoBanner.link_url ? (
                    <Link href={promoBanner.link_url} className="mt-3 tap" style={{ display: "block", borderRadius: 16, overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed banner, arbitrary host */}
                      <img src={promoBanner.image_url ?? ""} alt="Promotion" style={{ width: "100%", display: "block" }} />
                    </Link>
                  ) : (
                    <div className="mt-3" style={{ borderRadius: 16, overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed banner, arbitrary host */}
                      <img src={promoBanner.image_url ?? ""} alt="Promotion" style={{ width: "100%", display: "block" }} />
                    </div>
                  )
                )}
              </div>
            );
          })}

          <div style={{ marginTop: 40 }}>
            <div className="row between mb-2">
              <span className="section-title">Browse by category</span>
              <Link href="/services" className="muted" style={{ textDecoration: "none" }}>
                See all
              </Link>
            </div>
            <div className="browse-category-grid">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={c.id === "insurance" ? "/insurance" : `/services/${c.id}`}
                  className="tap browse-category-btn"
                >
                  <span className="browse-cat-icon" style={{ background: c.bg, color: c.color }}>
                    <Icon name={c.icon} size={18} stroke={2} />
                  </span>
                  <span>{c.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {profile && (
          <div className="col-side">
            <Link href="/chat" className="card card-pad row gap-2 tap" style={{ alignItems: "center", textDecoration: "none" }}>
              <div className="ibadge round" style={{ background: "var(--blue-50)", color: "var(--blue)" }}>
                <Icon name="headset" size={20} stroke={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Need a hand?</div>
                <div className="muted">We usually reply within minutes</div>
              </div>
              <Icon name="chevronR" size={18} stroke={2} />
            </Link>

            <div className="card card-pad mt-2 desktop-only">
              <div className="muted">Recent activity</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: "-0.02em" }}>{fmt(monthSpend)}</div>
              <div className="muted" style={{ marginTop: 2 }}>
                Across your last {recent.length} payment{recent.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="card card-pad mt-2 desktop-only">
              <div className="section-title" style={{ fontSize: 14 }}>
                Saved beneficiaries
              </div>
              {beneficiaries.length === 0 ? (
                <div className="row gap-2 mt-3" style={{ alignItems: "center" }}>
                  <div className="empty-state-icon" style={{ width: 36, height: 36, marginBottom: 0 }}>
                    <Icon name="user" size={17} stroke={1.8} />
                  </div>
                  <div className="muted" style={{ flex: 1 }}>Recipients you pay often are saved here for quick reuse.</div>
                </div>
              ) : (
                beneficiaries.slice(0, 3).map((b) => (
                  <div className="row gap-2 mt-2" key={b.id}>
                    <div className="ibadge round" style={{ width: 34, height: 34, background: "var(--badge-neutral-bg)", color: "var(--text-soft)", fontSize: 12, fontWeight: 700 }}>
                      {(b.label || b.identifier).slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{b.label || b.identifier}</div>
                      <div className="muted">{b.service_id}</div>
                    </div>
                    <FavoriteButton serviceId={b.service_id || ""} isFavorite={favoriteIds.has(b.service_id || "")} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
