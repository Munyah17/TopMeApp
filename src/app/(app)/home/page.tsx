import Link from "next/link";
import { Icon } from "@/components/icons";
import { FavoriteButton } from "@/components/home/favorite-button";
import { ProductCard } from "@/components/home/product-card";
import { fmt } from "@/lib/data/catalog-helpers";
import {
  getAllServices,
  getBeneficiaries,
  getCategories,
  getCurrentProfile,
  getFavoriteServiceIds,
  getRecentTransactions,
} from "@/lib/data/queries";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [categories, services, favoriteIds, recent, beneficiaries] = await Promise.all([
    getCategories(),
    getAllServices(),
    getFavoriteServiceIds(profile.id),
    getRecentTransactions(profile.id, 3),
    getBeneficiaries(profile.id),
  ]);

  const servicesByCategory = new Map<string, typeof services>();
  for (const s of services) {
    const arr = servicesByCategory.get(s.category_id) ?? [];
    arr.push(s);
    servicesByCategory.set(s.category_id, arr);
  }
  const favoriteServices = services.filter((s) => favoriteIds.has(s.id));

  const now = new Date();
  const monthSpend = recent.reduce((sum, t) => (t.status === "success" ? sum + t.amount : sum), 0);

  return (
    <div className="px content-wrap" style={{ paddingTop: 6 }}>
      <div className="row between">
        <div>
          <div className="eyebrow">Good {now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}</div>
          <h2 style={{ fontSize: 22, marginTop: 2 }}>{profile.full_name?.split(" ")[0] || "there"}</h2>
        </div>
        <div className="row gap-2 mobile-only" style={{ gap: 12 }}>
          <Link
            href="/account"
            className="tap"
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: "#fff",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <Icon name="bell" size={19} stroke={2} />
          </Link>
          <Link
            href="/account"
            className="tap"
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: "var(--navy)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            {(profile.full_name || "TM").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </Link>
        </div>
      </div>

      <Link
        href="/services"
        className="tap mt-3 mobile-only"
        style={{
          background: "#fff",
          border: "1.5px solid var(--border)",
          borderRadius: 16,
          padding: "13px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--text-faint)",
          textDecoration: "none",
        }}
      >
        <Icon name="search" size={18} stroke={2} />
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>Search services, ZESA, DStv…</span>
      </Link>

      <div className="home-grid mt-3">
        <div className="col-main">
          <div className="row between mb-2">
            <span className="section-title">Quick Pay</span>
            <Link href="/services" className="muted" style={{ textDecoration: "none" }}>
              See all
            </Link>
          </div>
          <div className="tx-quickgrid" style={{ padding: "2px 2px 6px" }}>
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
                    style={{
                      background: cat?.bg,
                      color: cat?.color,
                      boxShadow: `0 6px 16px -6px ${cat?.color}66`,
                    }}
                  >
                    <Icon name={f.icon} size={23} stroke={1.8} />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2, color: "var(--text-soft)" }}>
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
                style={{ background: "#F1F4F9", color: "var(--text-soft)", border: "1.5px dashed var(--border)" }}
              >
                <Icon name="plus" size={20} stroke={2} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-faint)" }}>More</span>
            </Link>
          </div>

          <Link
            href="/pay/gift"
            className="mt-2 tap"
            style={{
              display: "block",
              background: "linear-gradient(120deg, var(--navy) 0%, #16324f 60%, #0f4c3a 130%)",
              borderRadius: 20,
              padding: 24,
              position: "relative",
              overflow: "hidden",
              textDecoration: "none",
            }}
          >
            <div style={{ position: "absolute", right: -30, top: -30, width: 130, height: 130, borderRadius: "50%", background: "rgba(0,200,83,0.18)" }} />
            <div style={{ position: "absolute", right: 30, bottom: -40, width: 90, height: 90, borderRadius: "50%", background: "rgba(56,189,248,0.14)" }} />
            <div className="eyebrow" style={{ color: "#7CF2AE", position: "relative" }}>
              New
            </div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 19, marginTop: 4, position: "relative" }}>
              Send a Gift Voucher
            </div>
            <div className="muted" style={{ color: "rgba(255,255,255,0.6)", marginTop: 4, position: "relative" }}>
              Top up anyone&apos;s TopMe wallet in seconds
            </div>
          </Link>

          <div className="row between mt-3 mb-2">
            <span className="section-title">Recent</span>
            <Link href="/history" className="muted" style={{ textDecoration: "none" }}>
              See all
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="card card-pad muted">No transactions yet — your recent activity will show up here.</div>
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
                    <div className="ibadge" style={{ background: svc ? `${svc.color}1a` : "#F1F4F9", color: svc?.color }}>
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
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.status === "success" ? "var(--success)" : "var(--error)" }}>
                        {t.status === "success" ? "Success" : t.status === "pending" ? "Pending" : "Failed"}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {categories.map((c) => {
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
                </div>
              </div>
            );
          })}
        </div>

        <div className="col-side">
          <div className="card card-pad row gap-2" style={{ alignItems: "center" }}>
            <div className="ibadge round" style={{ background: "var(--blue-50)", color: "var(--blue)" }}>
              <Icon name="headset" size={20} stroke={1.8} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Need a hand?</div>
              <div className="muted">We usually reply within minutes</div>
            </div>
            <Icon name="chevronR" size={18} stroke={2} />
          </div>

          <div className="card card-pad mt-2 desktop-only">
            <div className="muted">Recent activity</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{fmt(monthSpend)}</div>
            <div className="muted" style={{ marginTop: 2 }}>
              Across your last {recent.length} payment{recent.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="card card-pad mt-2 desktop-only">
            <div className="section-title" style={{ fontSize: 14 }}>
              Saved beneficiaries
            </div>
            {beneficiaries.length === 0 ? (
              <div className="muted mt-2">Recipients you pay often will be saved here for quick reuse.</div>
            ) : (
              beneficiaries.slice(0, 3).map((b) => (
                <div className="row gap-2 mt-2" key={b.id}>
                  <div className="ibadge round" style={{ width: 34, height: 34, background: "#F1F4F9", color: "var(--text-soft)", fontSize: 12, fontWeight: 700 }}>
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
      </div>
    </div>
  );
}
