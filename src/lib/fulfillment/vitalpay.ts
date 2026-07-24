import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/**
 * VitalPay (by Tayari / KMG Vital Links) — primary biller aggregator.
 * Base URL + sandbox keys are wired up; the per-service endpoint calls below
 * are still TODO because the actual endpoint/payload reference hasn't been
 * supplied yet. Fill in `callVitalPay` in each method once that's in hand —
 * the auth/request plumbing (`vitalpayRequest`) is already correct and reusable.
 *
 * Activated per-service by a superadmin setting the `vitalpay` row in
 * `api_modules` to `active` from /admin/apis. Falls back to SimulatedProvider
 * automatically for anything not yet implemented here.
 */

function config() {
  const baseUrl = process.env.VITALPAY_BASE_URL;
  const secretKey = process.env.VITALPAY_SECRET_KEY;
  if (!baseUrl || !secretKey) {
    throw new Error("VitalPay is not configured — set VITALPAY_BASE_URL and VITALPAY_SECRET_KEY.");
  }
  return { baseUrl, secretKey };
}

/**
 * Generic authenticated request helper. Auth scheme (Bearer secret key) is
 * the most common convention for this class of API but is UNVERIFIED against
 * VitalPay's actual docs — confirm the header name/scheme and adjust here
 * once the reference is available; every call site below goes through this
 * one function so a fix here fixes everything.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from SERVICE_HANDLERS entries once endpoints are mapped
async function vitalpayRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { baseUrl, secretKey } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretKey}`, // TODO: confirm against VitalPay docs
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`VitalPay returned a non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`VitalPay request to ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return parsed as T;
}

// Maps TopMe service ids to a VitalPay call. `null` = confirmed/assumed not
// offered by VitalPay (or not yet confirmed) — these fall back to Simulated
// and should be listed to the owner as "needs another provider".
type ServiceHandler = (input: FulfillmentInput) => Promise<FulfillmentResult>;

async function notMapped(serviceId: string): Promise<FulfillmentResult> {
  throw new Error(`No VitalPay endpoint mapped yet for service "${serviceId}" — awaiting API reference.`);
}

const SERVICE_HANDLERS: Record<string, ServiceHandler> = {
  // TODO: replace each of these with a real vitalpayRequest(...) call once
  // the endpoint/payload for that product is known, e.g.:
  //
  // airtime: async (input) => {
  //   const data = await vitalpayRequest<{ status: string; providerRef: string }>("/airtime/purchase", {
  //     msisdn: input.recipient,
  //     amount: input.amount,
  //     network: input.networkId,
  //   });
  //   return { status: data.status === "success" ? "fulfilled" : "failed", providerRef: data.providerRef };
  // },
};

export class VitalPayProvider implements FulfillmentProvider {
  readonly name = "vitalpay";

  async fulfil(input: FulfillmentInput): Promise<FulfillmentResult> {
    config(); // throws early with a clear message if env vars are missing
    const handler = SERVICE_HANDLERS[input.serviceId];
    if (!handler) return notMapped(input.serviceId);
    return handler(input);
  }
}
