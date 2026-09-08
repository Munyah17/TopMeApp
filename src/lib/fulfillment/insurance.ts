import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/**
 * Insurance fulfillment provider using TariqifyIMS API.
 * 
 * Insurance has a different flow than simple services (airtime, bills):
 * - Requires client registration (KYC)
 * - Requires quote before purchase
 * - Creates policies with long-term state
 * - Has its own database tables (insurance_products, insurance_clients, insurance_policies)
 * 
 * This provider is NOT used through the standard fulfillment flow.
 * Instead, insurance purchases go through insurance-specific server actions
 * that handle the full TariqifyIMS workflow (client → quote → policy → payment).
 * 
 * The coverage array is kept empty to prevent routing through this provider
 * from the standard payment flow. Insurance products are listed in the
 * insurance_products table and have their own purchase UI.
 */
export class InsuranceProvider implements FulfillmentProvider {
  readonly name = "insurance";
  readonly coverage = [] as const; // Empty - insurance uses its own flow

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature required by FulfillmentProvider
  async fulfil(_input: FulfillmentInput): Promise<FulfillmentResult> {
    throw new Error(
      "Insurance does not use the standard fulfillment flow. " +
      "Use insurance-specific server actions instead (see src/lib/actions/insurance.ts)."
    );
  }
}
