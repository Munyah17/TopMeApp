import Link from "next/link";
import { Icon } from "@/components/icons";
import { getAllServices, getCategories } from "@/lib/data/queries";

export default async function ServicesPage() {
  const [categories, services] = await Promise.all([getCategories(), getAllServices()]);
  const countByCategory = new Map<string, number>();
  for (const s of services) {
    countByCategory.set(s.category_id, (countByCategory.get(s.category_id) ?? 0) + 1);
  }

  return (
    <div className="screen active" style={{ position: "static" }}>
      <div className="topbar mobile-only" style={{ position: "static", background: "none", paddingTop: 6 }}>
        <h2 style={{ fontSize: 20 }}>Services</h2>
      </div>
      <div className="px content-wrap">
        <h2 className="desktop-only" style={{ fontSize: 22, marginBottom: 18 }}>
          Services
        </h2>
        <div className="cats-grid">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/services/${c.id}`}
              className="card tap row gap-2"
              style={{ padding: 16, textDecoration: "none" }}
            >
              <div className="ibadge" style={{ background: c.bg, color: c.color }}>
                <Icon name={c.icon} size={22} stroke={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>{c.name}</div>
                <div className="muted">{c.description}</div>
              </div>
              <div style={{ color: "var(--text-faint)" }}>
                <Icon name="chevronR" size={18} stroke={2} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
