import type { ApiModuleSafe } from "@/types/database";
import { SimulatedProvider } from "./simulated";
import { VitalPayProvider } from "./vitalpay";
import type { FulfillmentProvider } from "./types";

export type { FulfillmentInput, FulfillmentResult, FulfillmentProvider } from "./types";

/**
 * One entry per aggregator TopMe knows how to talk to. Adding a second/third
 * provider (a fallback if VitalPay changes, or a specialist for a category
 * VitalPay doesn't cover) is just adding a class here and a matching
 * `api_modules` row from /admin/apis — nothing else in the payment flow
 * needs to change.
 */
const PROVIDER_REGISTRY: Record<string, () => FulfillmentProvider> = {
  vitalpay: () => new VitalPayProvider(),
};

/**
 * Picks the first *active* api_modules row whose `provider` matches a
 * registered aggregator. Falls back to the simulated provider when nothing
 * is active (or the active provider throws — see src/lib/actions/payments.ts).
 */
export function getFulfillmentProvider(activeModules: ApiModuleSafe[]): FulfillmentProvider {
  for (const apiModule of activeModules) {
    if (apiModule.status !== "active") continue;
    const factory = PROVIDER_REGISTRY[apiModule.provider];
    if (factory) return factory();
  }
  return new SimulatedProvider();
}
