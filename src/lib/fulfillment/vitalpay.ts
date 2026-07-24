import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/**
 * VitalPay (by Tayari / KMG Vital Links) aggregator — real biller integration,
 * to be wired up once credentials exist. Activated per-service by a
 * superadmin setting the `vitalpay` row in `api_modules` to `active` from
 * /admin/apis. Until VITALPAY_API_KEY etc. are configured, this throws so the
 * caller falls back to SimulatedProvider rather than silently doing nothing.
 */
export class VitalPayProvider implements FulfillmentProvider {
  readonly name = "vitalpay";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature required by FulfillmentProvider
  async fulfil(_input: FulfillmentInput): Promise<FulfillmentResult> {
    const apiKey = process.env.VITALPAY_API_KEY;
    const merchantId = process.env.VITALPAY_MERCHANT_ID;
    const baseUrl = process.env.VITALPAY_BASE_URL;

    if (!apiKey || !merchantId || !baseUrl) {
      throw new Error(
        "VitalPay is not configured yet — set VITALPAY_API_KEY, VITALPAY_MERCHANT_ID and VITALPAY_BASE_URL, or leave the api_modules row inactive to keep using the simulated provider."
      );
    }

    // TODO: call the VitalPay/Tayari biller API here once credentials are
    // available (e.g. POST `${baseUrl}/transactions` with merchantId/apiKey
    // and the service-specific payload) and map its response into
    // FulfillmentResult. Left unimplemented intentionally — no real endpoint
    // to call against yet.
    throw new Error("VitalPay integration not implemented yet.");
  }
}
