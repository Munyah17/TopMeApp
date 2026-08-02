import type { ApiModuleSafe } from "@/types/database";
import { SimulatedProvider } from "./simulated";
import { VitalPayProvider } from "./vitalpay";
import { InsuranceProvider } from "./insurance";
import type { FulfillmentProvider } from "./types";

export type { FulfillmentInput, FulfillmentResult, FulfillmentProvider } from "./types";

/**
 * One entry per aggregator TopMe knows how to talk to. Adding a second/third
 * provider (a fallback if VitalPay changes, a specialist for a category
 * VitalPay doesn't cover — e.g. insurance needs its own underwriter API) is
 * just adding a class here and a matching `api_modules` row from
 * /admin/apis — nothing else in the payment flow needs to change. Routing
 * below is coverage-based (which service ids each provider declares it can
 * fulfil), not "first active wins", so multiple providers can be active at
 * once without stepping on each other.
 */
const PROVIDER_REGISTRY: Record<string, () => FulfillmentProvider> = {
  vitalpay: () => new VitalPayProvider(),
  insurance: () => new InsuranceProvider(),
};

/**
 * Picks the active api_modules row whose registered provider actually
 * covers this service. Falls back to the simulated provider when nothing
 * active covers it (or the chosen provider throws — see
 * src/lib/actions/payments.ts, which retries with Simulated on error).
 */
export function getFulfillmentProvider(serviceId: string, activeModules: ApiModuleSafe[]): FulfillmentProvider {
  for (const apiModule of activeModules) {
    if (apiModule.status !== "active") continue;
    const factory = PROVIDER_REGISTRY[apiModule.provider];
    if (!factory) continue;
    const provider = factory();
    if (provider.coverage.includes(serviceId) || provider.coverage.includes("*")) return provider;
  }
  return new SimulatedProvider();
}

/**
 * Whether a service has an actual active, working provider behind it right
 * now — used to decline a purchase upfront ("Temporarily Not Available")
 * instead of ever letting SimulatedProvider fake a successful outcome for
 * something we can't really deliver. Deliberately does NOT special-case
 * providers like InsuranceProvider that register coverage but always throw —
 * this only trusts what's genuinely marked `active` in `api_modules`, which
 * is already false for anything without a real integration wired up.
 */
export function hasRealCoverage(serviceId: string, activeModules: ApiModuleSafe[]): boolean {
  for (const apiModule of activeModules) {
    if (apiModule.status !== "active") continue;
    const factory = PROVIDER_REGISTRY[apiModule.provider];
    if (!factory) continue;
    const provider = factory();
    if (provider.coverage.includes(serviceId) || provider.coverage.includes("*")) return true;
  }
  return false;
}
