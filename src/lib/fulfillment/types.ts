export interface FulfillmentInput {
  transactionId: string;
  serviceId: string;
  recipient: string;
  extraValue?: string | null;
  networkId?: string | null;
  amount: number;
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
