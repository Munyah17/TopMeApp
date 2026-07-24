import type { ApiModuleSafe } from "@/types/database";
import { SimulatedProvider } from "./simulated";
import { VitalPayProvider } from "./vitalpay";
import type { FulfillmentProvider } from "./types";

export type { FulfillmentInput, FulfillmentResult, FulfillmentProvider } from "./types";

/** Picks the real provider only when a superadmin has switched it on in /admin/apis. */
export function getFulfillmentProvider(vitalpayModule: ApiModuleSafe | undefined): FulfillmentProvider {
  if (vitalpayModule?.provider === "vitalpay" && vitalpayModule.status === "active") {
    return new VitalPayProvider();
  }
  return new SimulatedProvider();
}
