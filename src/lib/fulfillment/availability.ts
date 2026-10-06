import { createAdminClient } from "@/lib/supabase/server";
import type { ApiModuleSafe } from "@/types/database";
import { hasRealCoverage, isProviderConfigured } from "./index";

const INTERNAL_SERVICES = new Set(["gift"]);

/** One batched availability snapshot for catalog cards. A service is ready
 * when TopMe owns the fulfilment internally, a configured active provider
 * declares static coverage, or an enabled map points to a configured active
 * provider. This deliberately ignores short-lived provider health outages:
 * those are "temporarily unavailable", not products that are coming soon. */
export async function getReadyServiceIds(serviceIds: string[]): Promise<Set<string>> {
  const uniqueIds = [...new Set(serviceIds)];
  const ready = new Set(uniqueIds.filter((id) => INTERNAL_SERVICES.has(id)));
  if (!uniqueIds.length) return ready;

  const admin = createAdminClient();
  const [{ data: moduleRows }, { data: mapRows }] = await Promise.all([
    admin.from("api_modules_safe").select("*").eq("status", "active"),
    admin
      .from("service_provider_map")
      .select("service_id, provider")
      .in("service_id", uniqueIds)
      .eq("enabled", true),
  ]);
  const modules = (moduleRows ?? []) as ApiModuleSafe[];
  const activeProviders = new Set(
    modules.filter((m) => isProviderConfigured(m.provider)).map((m) => m.provider)
  );

  for (const id of uniqueIds) {
    if (hasRealCoverage(id, modules)) ready.add(id);
  }
  for (const row of mapRows ?? []) {
    if (activeProviders.has(row.provider)) ready.add(row.service_id);
  }
  return ready;
}
