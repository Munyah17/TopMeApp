export interface FulfillmentInput {
  transactionId: string;
  serviceId: string;
  recipient: string;
  extraValue?: string | null;
  networkId?: string | null;
  amount: number;
  /**
   * Set by the provider map when VitalPay wins routing. productId is the
   * biller code or operator id from service_provider_map. billType is the
   * provider SKU (tv, internet, education_university, …).
   */
  vitalpay?: { productId?: string; billType?: string | null };
}

export interface FulfillmentResult {
  status: "fulfilled" | "failed" | "simulated" | "pending";
  providerRef?: string;
  message?: string;
  extra?: Record<string, unknown>;
}

export interface FulfillmentProvider {
  readonly name: string;
  /** Service ids this provider can actually fulfil — used to route each
   * transaction to the right aggregator when multiple are active at once
   * (e.g. VitalPay for airtime/bills, a separate insurer API for insurance). */
  readonly coverage: readonly string[];
  fulfil(input: FulfillmentInput): Promise<FulfillmentResult>;
}
