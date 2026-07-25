import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/**
 * Placeholder slot for an insurance underwriter/broker API — VitalPay is a
 * payments/VAS aggregator, not an insurance API, so vehicle/legal/agri/
 * hospital-cash/funeral-cash policies need a different provider entirely
 * (owner flagged this explicitly: insurance should not share a provider
 * with the rest of the catalog).
 *
 * Wire up a real integration here once an insurer/broker is chosen, then
 * register it from /admin/apis with `provider: "insurance"` (or whatever
 * slug you prefer — just keep it in sync with PROVIDER_REGISTRY in
 * src/lib/fulfillment/index.ts) and set it active. Nothing else in the
 * payment flow needs to change — routing is coverage-based, not hardcoded.
 */
export class InsuranceProvider implements FulfillmentProvider {
  readonly name = "insurance";
  readonly coverage = ["vehicleinsurance", "legalinsurance", "agriinsurance", "hospitalcash", "funeralcash"] as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature required by FulfillmentProvider
  async fulfil(_input: FulfillmentInput): Promise<FulfillmentResult> {
    throw new Error("No insurance provider configured yet — see src/lib/fulfillment/insurance.ts.");
  }
}
