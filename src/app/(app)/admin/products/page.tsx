import { ProductsClient } from "@/components/admin/products-client";
import { getCurrentProfile, getAllServices, getCategories } from "@/lib/data/queries";

export default async function ProductsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "superadmin") {
    return <div className="muted">Only Super Admin accounts can manage the product catalog.</div>;
  }

  const [categories, services] = await Promise.all([getCategories(), getAllServices(true)]);

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Products & Services</h2>
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        Add, edit, deactivate or delete anything in the catalog. Deactivated services stay in
        records (transaction history, reports) but disappear from Home/Services for customers
        immediately. Deleting only works for services with no transaction history, so
        deactivate anything that&apos;s ever been sold instead.
      </div>
      <ProductsClient categories={categories} services={services} />
    </div>
  );
}
