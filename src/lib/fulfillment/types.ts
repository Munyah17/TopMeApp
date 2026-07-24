export interface FulfillmentInput {
  transactionId: string;
  serviceId: string;
  recipient: string;
  extraValue?: string | null;
  networkId?: string | null;
  amount: number;
}

export interface FulfillmentResult {
  status: "fulfilled" | "failed" | "simulated";
  providerRef?: string;
  message?: string;
  extra?: Record<string, unknown>;
}

export interface FulfillmentProvider {
  readonly name: string;
  fulfil(input: FulfillmentInput): Promise<FulfillmentResult>;
}
