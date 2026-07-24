import crypto from "crypto";

const PAYNOW_INITIATE_URL = "https://www.paynow.co.zw/interface/initiatetransaction";

function hash(fields: Record<string, string>, integrationKey: string) {
  const values = Object.values(fields).join("") + integrationKey;
  return crypto.createHash("sha512").update(values, "utf8").digest("hex").toUpperCase();
}

function parseKeyValues(body: string) {
  const out: Record<string, string> = {};
  for (const pair of body.split("&")) {
    const [k, v] = pair.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "").replace(/\+/g, " ");
  }
  return out;
}

export interface PaynowInitiateResult {
  ok: boolean;
  browserUrl?: string;
  pollUrl?: string;
  error?: string;
}

export async function initiatePaynowPayment(opts: {
  reference: string;
  amount: number;
  authEmail: string;
}): Promise<PaynowInitiateResult> {
  const id = process.env.PAYNOW_INTEGRATION_ID;
  const key = process.env.PAYNOW_INTEGRATION_KEY;
  const resultUrl = process.env.PAYNOW_RESULT_URL;
  const returnUrl = process.env.PAYNOW_RETURN_URL;
  if (!id || !key || !resultUrl || !returnUrl) {
    return { ok: false, error: "Paynow is not configured — set PAYNOW_INTEGRATION_ID/KEY and result/return URLs." };
  }

  const fields: Record<string, string> = {
    id,
    reference: opts.reference,
    amount: opts.amount.toFixed(2),
    additionalinfo: "TopMe wallet top up",
    returnurl: returnUrl,
    resulturl: resultUrl,
    authemail: opts.authEmail,
    status: "Message",
  };
  const body = new URLSearchParams({ ...fields, hash: hash(fields, key) });

  const res = await fetch(PAYNOW_INITIATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const parsed = parseKeyValues(await res.text());

  if (parsed.status?.toLowerCase() !== "ok") {
    return { ok: false, error: parsed.error || "Paynow rejected the request." };
  }
  return { ok: true, browserUrl: parsed.browserurl, pollUrl: parsed.pollurl };
}

/** Verifies the hash Paynow sends on the result_url callback. */
export function verifyPaynowCallback(fields: Record<string, string>): boolean {
  const key = process.env.PAYNOW_INTEGRATION_KEY;
  if (!key) return false;
  const { hash: receivedHash, ...rest } = fields;
  return hash(rest, key) === receivedHash;
}
