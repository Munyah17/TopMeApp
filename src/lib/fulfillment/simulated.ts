import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/**
 * Default fulfillment provider. The wallet debit that happens before this is
 * called is real and atomic — this step (actually delivering airtime, a ZESA
 * token, etc.) is simulated because no live biller aggregator is connected
 * yet. Every result is tagged `simulated` end to end (transaction record,
 * receipt) so nothing pretends to be real delivery.
 */
export class SimulatedProvider implements FulfillmentProvider {
  readonly name = "simulated";

  async fulfil(input: FulfillmentInput): Promise<FulfillmentResult> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      status: "simulated",
      providerRef: `SIM-${input.transactionId.slice(0, 8).toUpperCase()}`,
      message: "Demo fulfillment — no live biller connected yet.",
    };
  }
}
