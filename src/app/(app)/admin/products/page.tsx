import Link from "next/link";
import { Icon } from "@/components/icons";
import { ProductsClient } from "@/components/admin/products-client";
import { getCurrentProfile, getAllServices, getCategories } from "@/lib/data/queries";

export default async function ProductsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "superadmin") {
    return (
      <div>
        <div className="topbar">
          <Link href="/account" className="backbtn tap" style={{ textDecoration: "none" }}>
            <Icon name="chevronL" size={18} stroke={2.2} />
          </Link>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Products & Services</div>
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
              Only Super Admin accounts can manage the product catalog.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [categories, services] = await Promise.all([getCategories(), getAllServices(true)]);

  return (
    <div>
      <div className="topbar">
        <Link href="/admin" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Products & Services</div>
        </div>
      </div>
      <div className="px content-wrap">
        <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
          Add, edit, deactivate or delete anything in the catalog. Deactivated services stay in
          records (transaction history, reports) but disappear from Home/Services for customers
          immediately. Deleting only works for services with no transaction history, so
          deactivate anything that&apos;s ever been sold instead.
        </div>
        <ProductsClient categories={categories} services={services} />
      </div>
    </div>
  );
}
