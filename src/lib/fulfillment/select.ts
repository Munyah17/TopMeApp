import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiModuleSafe } from "@/types/database";
import type { FulfillmentProvider } from "./types";
import { BillPayProvider, billpayConfigured, type BillPayRouting } from "./billpay";
import { TxtZwAirtimeProvider, txtZwAirtimeConfigured } from "./txtzw";

/**
 * Dynamic provider selection — the multi-aggregator router.
 *
 * When more than one provider can fulfil a service (e.g. ZESA via VitalPay
 * *and* via BillPay), candidates are chosen in the priority order the user
 * specified:
 *
 *   1. HEALTH — is the provider working right now? A provider is "working"
 *      when it has an active api_modules row, its env credentials exist,
 *      and it isn't mid-outage (consecutive_failures ≥ 3 with a fresh
 *      last_failure_at → sidelined for HEALTH_COOLDOWN_MS).
 *   2. CHEAPEST — lowest cost_amount among working candidates (null cost =
 *      priced at fulfil time, ranks after priced candidates).
 *   3. BEST FOR TOPME — tiebreak by total economic benefit:
 *      commission_pct + margin_pct, descending. priority is a manual
 *      admin override that outranks cost entirely.
 *
 * Falls back to the legacy coverage-based router for services with no
 * mapped rows, so nothing stops working while the catalog is still being
 * auto-mapped.
 */

interface MapRow {
  id: string;
  service_id: string;
  provider: string;
  provider_product_id: string;
  provider_sku: string;
  network_id: string;
  cost_amount: number | null;
  cost_currency: string;
  commission_pct: number | null;
  margin_pct: number | null;
  enabled: boolean;
  priority: number;
  meta: Record<string, unknown>;
}

export interface ProviderSelection {
  provider: FulfillmentProvider;
  /** Provider-specific routing data (e.g. BillPay billerCode/productCode) —
   *  callers attach it to FulfillmentInput so fulfil() doesn't re-query. */
  routing?: { billpay?: BillPayRouting };
  /** Why this provider won — logged on the transaction event trail. */
  reason: string;
  /** All working candidates considered, cheapest-first. */
  candidates: { provider: string; cost: number | null; benefit: number }[];
}

const HEALTH_COOLDOWN_MS = 30 * 60 * 1000; // sideline a failing provider for 30min
const HEALTH_FAIL_THRESHOLD = 3;

// Registry mirroring index.ts — selector needs provider instances for
// map-driven providers before the legacy coverage check runs.
function providerInstance(name: string): FulfillmentProvider | null {
  switch (name) {
    case "billpay":
      return new BillPayProvider();
    case "txtzw":
      return new TxtZwAirtimeProvider();
    default:
      return null;
  }
}

interface HealthRow {
  id: string;
  consecutive_failures: number;
  last_failure_at: string | null;
}

function isProviderUsable(
  provider: string,
  activeModules: ApiModuleSafe[],
  health: Map<string, HealthRow>
): { ok: boolean; why: string } {
  // Active api_modules row is the admin on/off switch.
  const activeModule = activeModules.find((m) => m.provider === provider && m.status === "active");
  if (!activeModule) return { ok: false, why: "no active api_modules row" };

  // Credentials gate — a provider without env keys can never work.
  if (provider === "billpay" && !billpayConfigured()) {
    return { ok: false, why: "BILLPAY credentials not set" };
  }
  if (provider === "txtzw" && !txtZwAirtimeConfigured()) {
    return { ok: false, why: "TXT DirectRecharge credentials/switch not set" };
  }

  // Live health — sideline providers mid-outage, with a cooldown so a
  // permanently-broken provider doesn't stall every checkout behind a
  // 60s upstream timeout.
  const h = health.get(provider);
  if (h && h.consecutive_failures >= HEALTH_FAIL_THRESHOLD && h.last_failure_at) {
    const ageMs = Date.now() - new Date(h.last_failure_at).getTime();
    if (ageMs < HEALTH_COOLDOWN_MS) {
      return { ok: false, why: `${h.consecutive_failures} consecutive failures ${Math.round(ageMs / 60000)}min ago` };
    }
    // Cooldown elapsed — let it try again; a failure re-arms the cooldown.
  }
  return { ok: true, why: "healthy" };
}

function benefitOf(row: MapRow): number {
  return (row.commission_pct ?? 0) + (row.margin_pct ?? 0);
}

/**
 * Does service_provider_map have an enabled row for this service? Used
 * alongside hasRealCoverage() — BillPay's provider declares no static
 * coverage (routing is data-driven), so a service fulfilled exclusively
 * by mapped BillPay rows would otherwise read as "no real provider" and
 * be rejected before checkout.
 */
export async function hasMappedProvider(
  serviceId: string,
  admin: SupabaseClient,
  networkId?: string | null
): Promise<boolean> {
  const { data } = await admin
    .from("service_provider_map")
    .select("id")
    .eq("service_id", serviceId)
    .eq("enabled", true)
    .or(`network_id.eq.,network_id.eq.${networkId ?? ""}`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function selectFulfillmentProvider(args: {
  serviceId: string;
  networkId?: string | null;
  activeModules: ApiModuleSafe[];
  admin: SupabaseClient;
  /** Fallback used when no service_provider_map rows cover this service. */
  legacyResolve: (serviceId: string, modules: ApiModuleSafe[]) => FulfillmentProvider;
}): Promise<ProviderSelection> {
  const { serviceId, networkId, activeModules, admin, legacyResolve } = args;

  // 1. Candidate rows for this service. network_id '' = applies to any
  //    network; airtime rows are per-network so they must match exactly.
  const { data: mapRows } = await admin
    .from("service_provider_map")
    .select("*")
    .eq("service_id", serviceId)
    .eq("enabled", true)
    .or(`network_id.eq.,network_id.eq.${networkId ?? ""}`);

  const rows = (mapRows ?? []) as MapRow[];
  if (!rows.length) {
    // Nothing mapped — preserve the pre-BillPay behavior exactly.
    const provider = legacyResolve(serviceId, activeModules);
    return { provider, reason: "no provider-map rows; legacy coverage routing", candidates: [] };
  }

  // 2. Health snapshot for every provider in play.
  const providerNames = [...new Set(rows.map((r) => r.provider))];
  const { data: healthRows } = await admin
    .from("integration_health")
    .select("id, consecutive_failures, last_failure_at")
    .in("id", providerNames);
  const health = new Map((healthRows ?? []).map((h: HealthRow) => [h.id, h]));

  // 3. Filter to working providers. Never select a mapped provider whose
  // credentials/admin switch/health gate says it cannot work: that turns a
  // valid payment into a guaranteed refund. Fall back to the legacy router,
  // which may still have another active provider for this service.
  const usable = rows.filter((r) => isProviderUsable(r.provider, activeModules, health).ok);
  if (!usable.length) {
    const legacy = legacyResolve(serviceId, activeModules);
    const reasons = rows.map((r) => `${r.provider}: ${isProviderUsable(r.provider, activeModules, health).why}`).join("; ");
    return {
      provider: legacy,
      reason: `no usable mapped providers (${reasons}); legacy routing`,
      candidates: rows.map((r) => ({ provider: r.provider, cost: r.cost_amount, benefit: benefitOf(r) })),
    };
  }
  const pool = usable;

  // 4. Sort: admin priority → cheapest → best benefit to TopMe.
  const sorted = [...pool].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    // null cost ranks after any priced candidate
    if (a.cost_amount == null && b.cost_amount != null) return 1;
    if (a.cost_amount != null && b.cost_amount == null) return -1;
    if (a.cost_amount != null && b.cost_amount != null && a.cost_amount !== b.cost_amount) {
      return a.cost_amount - b.cost_amount;
    }
    return benefitOf(b) - benefitOf(a);
  });

  const winner = sorted[0];
  const provider = providerInstance(winner.provider);
  const candidates = sorted.map((r) => ({
    provider: r.provider,
    cost: r.cost_amount,
    benefit: benefitOf(r),
  }));

  if (!provider) {
    // Mapped provider has no implementation (e.g. a future provider row
    // added before its client ships) — fall through to legacy routing.
    const legacy = legacyResolve(serviceId, activeModules);
    return { provider: legacy, reason: `provider '${winner.provider}' mapped but unimplemented; legacy routing`, candidates };
  }

  const selection: ProviderSelection = {
    provider,
    reason: `${winner.provider} selected (${winner.provider_product_id || "-"}/${winner.provider_sku || "-"}, cost ${winner.cost_amount ?? "auth-priced"} ${winner.cost_currency})`,
    candidates,
  };

  if (winner.provider === "billpay") {
    selection.routing = {
      billpay: {
        billerCode: winner.provider_product_id,
        productCode: winner.provider_sku,
        productPrice: winner.cost_amount,
        requiresForex: (winner.meta?.requires_forex as boolean | null) ?? null,
        department: (winner.meta?.department as string | null) ?? null,
      },
    };
  }

  return selection;
}
