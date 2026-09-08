import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { ProductCard } from "@/components/home/product-card";
import { getAllServices, getCategories, getCategory, getServicesByCategory, shuffle } from "@/lib/data/queries";

export default async function CategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = await getCategory(categoryId);
  if (!category) notFound();

  // Insurance has its own dedicated flow - redirect to /insurance
  if (categoryId === "insurance") {
    redirect("/insurance");
  }

  const [items, allServices, categories] = await Promise.all([
    getServicesByCategory(categoryId),
    getAllServices(),
    getCategories(),
  ]);

  const others = shuffle(allServices.filter((s) => s.category_id !== categoryId)).slice(0, 8);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div>
      <div className="topbar">
        <Link href="/services" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div className="row gap-2" style={{ flex: 1, minWidth: 0 }}>
          <div className="ibadge round" style={{ width: 34, height: 34, background: category.bg, color: category.color, flexShrink: 0 }}>
            <Icon name={category.icon} size={17} stroke={1.8} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.25 }}>{category.name}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {items.length} service{items.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>
      <div className="px content-wrap">
        <div className="catpage-grid">
          {items.map((i) => (
            <ProductCard key={i.id} service={i} categoryColor={category.color} />
          ))}
        </div>

        {others.length > 0 && (
          <>
            <div className="row between mt-4 mb-2">
              <span className="section-title">Other products you might like</span>
            </div>
            <div className="catpage-grid">
              {others.map((i) => {
                const c = categoryById.get(i.category_id);
                return <ProductCard key={i.id} service={i} categoryColor={c?.color || i.color} />;
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
