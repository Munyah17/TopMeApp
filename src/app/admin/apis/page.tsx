import { revalidatePath } from "next/cache";
import { ApiModulesClient } from "@/components/admin/api-modules-client";
import { ProviderMapClient, type ProviderMapRow } from "@/components/admin/provider-map-client";
import { getProviderMap } from "@/lib/actions/admin";
import { getMyPermissions, requirePermission } from "@/lib/auth/permissions";
import { syncBillPayCatalog } from "@/lib/billpay/sync";
import { getAllServices } from "@/lib/data/queries";
import { billpayConfigured } from "@/lib/fulfillment/billpay";
import { syncInsuranceCatalog } from "@/lib/insurance/sync-catalog";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ApiModuleSafe } from "@/types/database";

export default async function ApiManagementPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("apis.manage")) {
    return <div className="muted">You don&apos;t have permission to manage API integrations.</div>;
  }

  const supabase = await createClient();
  const [{ data }, providerRows, services] = await Promise.all([
    supabase.from("api_modules_safe").select("*").order("created_at", { ascending: false }),
    getProviderMap(),
    getAllServices(true),
  ]);
  const modules = (data as ApiModuleSafe[]) ?? [];

  async function syncInsuranceProducts() {
    "use server";
    await requirePermission("apis.manage");
    const result = await syncInsuranceCatalog();
    if (!result.success) throw new Error(result.error);
    revalidatePath("/insurance");
    revalidatePath("/admin/apis");
  }

  async function syncBillPayCatalogNow() {
    "use server";
    await requirePermission("apis.manage");
    if (!billpayConfigured()) {
      throw new Error("BillPay credentials are not configured. Add them before syncing the catalog.");
    }
    const result = await syncBillPayCatalog(createAdminClient());
    if (result.errors.length && result.billers === 0) throw new Error(result.errors.join("; "));
    revalidatePath("/bills");
    revalidatePath("/admin/apis");
  }

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>APIs Management</h2>
      <div className="card card-pad mb-3">
        <div className="row between" style={{ alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Insurance Products Sync</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Fetch latest products from TariqifyIMS
            </div>
          </div>
          <form action={syncInsuranceProducts}>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}>
              Sync Now
            </button>
          </form>
        </div>
      </div>
      <div className="card card-pad mb-3">
        <div className="row between" style={{ alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>BillPay Catalog Sync</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Pull latest billers &amp; products from Paynow BillPay (daily cron + config webhook also do this)
            </div>
          </div>
          <form action={syncBillPayCatalogNow}>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}>
              Sync Now
            </button>
          </form>
        </div>
      </div>
      <ProviderMapClient rows={providerRows as ProviderMapRow[]} serviceIds={services.map((s) => s.id)} />
      <ApiModulesClient modules={modules} />
    </div>
  );
}
