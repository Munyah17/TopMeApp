import { InsuranceProductsManager } from "@/components/admin/insurance-products-manager";
import { NetworksManager } from "@/components/admin/networks-manager";
import { ProductsClient } from "@/components/admin/products-client";
import { getAllNetworks, getAllServices, getCategories } from "@/lib/data/queries";
import { getMyPermissions } from "@/lib/auth/permissions";
import { isExcludedProduct } from "@/lib/insurance/exclusions";
import { createClient } from "@/lib/supabase/server";
import type { InsuranceProduct } from "@/lib/insurance/types";

export default async function ProductsPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("catalog.manage")) {
    return <div className="muted">You don&apos;t have permission to manage the product catalog.</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const isSuperAdmin = profile?.role === "superadmin";

  const [categories, services, networks, { data: insuranceData }] = await Promise.all([
    getCategories(),
    getAllServices(true),
    getAllNetworks(),
    supabase.from("insurance_products").select("*").order("sort_order"),
  ]);
  const allInsurance = (insuranceData as InsuranceProduct[]) ?? [];
  // Agricultural covers are suspended everywhere except the Super Admin
  // console — regular admins manage only the personal lines, the owner can
  // still see (and re-enable) the suspended farming products.
  const insuranceProducts = isSuperAdmin ? allInsurance : allInsurance.filter((p) => !isExcludedProduct(p));

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Products & Services</h2>
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        Add, edit, deactivate or delete anything in the catalog. Deactivated services stay in
        records (transaction history, reports) but disappear from Home/Services for customers
        immediately. Deleting only works for services with no transaction history, so
        deactivate anything that&apos;s ever been sold instead.
      </div>
      <NetworksManager networks={networks} />
      <InsuranceProductsManager products={insuranceProducts} />
      <ProductsClient categories={categories} services={services} />
    </div>
  );
}
