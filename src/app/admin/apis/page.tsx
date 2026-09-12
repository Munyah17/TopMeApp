import { ApiModulesClient } from "@/components/admin/api-modules-client";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ApiModuleSafe } from "@/types/database";
import { revalidatePath } from "next/cache";

export default async function ApiManagementPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("apis.manage")) {
    return <div className="muted">You don&apos;t have permission to manage API integrations.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("api_modules_safe").select("*").order("created_at", { ascending: false });
  const modules = (data as ApiModuleSafe[]) ?? [];

  async function syncInsuranceProducts() {
    "use server";
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/cron/sync-insurance-products`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${process.env.CRON_SECRET || ""}`,
        },
      });
      const result = await response.json();
      revalidatePath("/insurance");
      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
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
      <ApiModulesClient modules={modules} />
    </div>
  );
}
