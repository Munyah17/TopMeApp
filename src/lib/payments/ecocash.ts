/**
 * EcoCash Instant USSD (C2B push) client.
 *
 * EcoCash's merchant API isn't a fixed public spec the way Stripe/Paynow are —
 * field names, auth scheme and base URL depend on the merchant onboarding
 * pack Cassava/Ecocash issues per integrator. This client is wired up to the
 * shape most Zimbabwean EcoCash merchant integrations use (initiate a push
 * to the payer's phone, then poll for approval), but the exact endpoint
 * paths/field names below are placeholders — confirm them against your
 * EcoCash merchant documentation and adjust before going live.
 */

const BASE_URL = process.env.ECOCASH_BASE_URL || "https://api.ecocash.co.zw/v2/payment/instant"; // TODO: confirm with merchant docs

function authHeaders() {
  const apiKey = process.env.ECOCASH_API_KEY;
  const merchantCode = process.env.ECOCASH_MERCHANT_CODE;
  if (!apiKey || !merchantCode) {
    throw new Error("EcoCash is not configured — set ECOCASH_MERCHANT_CODE and ECOCASH_API_KEY.");
  }
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey, // TODO: confirm actual header name with EcoCash merchant docs
  };
}

export interface EcocashInitiateResult {
  ok: boolean;
  sourceReference?: string;
  error?: string;
}

export async function initiateEcocashPush(opts: { phone: string; amount: number; reference: string }): Promise<EcocashInitiateResult> {
  try {
    const merchantCode = process.env.ECOCASH_MERCHANT_CODE!;
    const res = await fetch(`${BASE_URL}/c2b/single`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        clientName: "TopMe",
        mobileNumber: opts.phone,
        amount: opts.amount,
        reference: opts.reference,
        currency: "USD",
        merchantCode,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `EcoCash rejected the request: ${text}` };
    }
    const data = await res.json();
    return { ok: true, sourceReference: data.sourceReference ?? data.transactionId ?? opts.reference };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "EcoCash request failed." };
  }
}

export type EcocashStatus = "pending" | "completed" | "failed" | "cancelled";

export async function getEcocashStatus(sourceReference: string): Promise<EcocashStatus> {
  const res = await fetch(`${BASE_URL}/c2b/status/${encodeURIComponent(sourceReference)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return "pending";
  const data = await res.json();
  const status = String(data.status ?? "").toLowerCase();
  if (status.includes("complete") || status.includes("success")) return "completed";
  if (status.includes("fail")) return "failed";
  if (status.includes("cancel")) return "cancelled";
  return "pending";
}
