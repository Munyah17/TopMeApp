/**
 * EcoCash Instant Payment (EIP) — Charge Request / Transaction Lookup.
 * Confirmed against EcoCash's own EIP API docs (2026-08-02) — HTTP Basic
 * Auth, POST /transactions/amount/ to charge, GET
 * /{endUserId}/transactions/amount/{clientCorrelator} to check status.
 * clientCorrelator is always the same value as our own payment reference,
 * so there's nothing extra to persist for it beyond the reference we
 * already store — only endUserId (the normalized MSISDN) needs saving
 * alongside the intent for the status-lookup step.
 */

const BASE_URL = process.env.ECOCASH_BASE_URL || "https://developers.ecocash.co.zw/sandbox/payment/v1";

// EcoCash issues one fixed merchant identity per sandbox account — these are
// the values from that account's sandbox docs, not guessed. Override via env
// vars once EcoCash issues real production merchant credentials.
const MERCHANT_CODE = process.env.ECOCASH_MERCHANT_CODE || "001535";
const MERCHANT_PIN = process.env.ECOCASH_MERCHANT_PIN || "1234";
const MERCHANT_NUMBER = process.env.ECOCASH_MERCHANT_NUMBER || "788732685";
const TERMINAL_ID = process.env.ECOCASH_TERMINAL_ID || "UAT00003";
const MERCHANT_NAME = process.env.ECOCASH_MERCHANT_NAME || "UAT STORE 3";
const SUPER_MERCHANT_NAME = process.env.ECOCASH_SUPER_MERCHANT_NAME || "ECOCASH";

function authHeaders() {
  const username = process.env.ECOCASH_USERNAME;
  const password = process.env.ECOCASH_PASSWORD;
  if (!username || !password) {
    throw new Error("EcoCash is not configured — set ECOCASH_USERNAME and ECOCASH_PASSWORD.");
  }
  const encoded = Buffer.from(`${username}:${password}`).toString("base64");
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" };
}

// Accepts 077…, 0773909307, 773909307 or 263773909307 and normalizes to the
// 263-prefixed MSISDN format the EIP API expects for endUserId.
function normalizeMsisdn(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("263")) return digits;
  if (digits.startsWith("0")) return `263${digits.slice(1)}`;
  return `263${digits}`;
}

export interface EcocashInitiateResult {
  ok: boolean;
  endUserId?: string;
  error?: string;
}

export async function initiateEcocashPush(opts: { phone: string; amount: number; reference: string; currency?: string }): Promise<EcocashInitiateResult> {
  const endUserId = normalizeMsisdn(opts.phone);
  try {
    const res = await fetch(`${BASE_URL}/transactions/amount/`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        clientCorrelator: opts.reference,
        notifyUrl: process.env.ECOCASH_NOTIFY_URL || "",
        referenceCode: opts.reference,
        tranType: "MER",
        endUserId,
        remarks: "TopMe payment",
        transactionOperationStatus: "Charged",
        paymentAmount: {
          charginginformation: {
            amount: opts.amount,
            currency: opts.currency ?? "USD",
            description: "TopMe payment",
          },
          chargeMetaData: { channel: "WEB" },
        },
        merchantCode: MERCHANT_CODE,
        merchantPin: MERCHANT_PIN,
        merchantNumber: MERCHANT_NUMBER,
        countryCode: "ZW",
        terminalID: TERMINAL_ID,
        location: "Harare",
        superMerchantName: SUPER_MERCHANT_NAME,
        merchantName: MERCHANT_NAME,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.statusMessage || data.message || `EcoCash rejected the request (${res.status}).` };
    }
    return { ok: true, endUserId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "EcoCash request failed." };
  }
}

export type EcocashStatus = "pending" | "completed" | "failed" | "cancelled";

export async function getEcocashStatus(endUserId: string, clientCorrelator: string): Promise<EcocashStatus> {
  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(endUserId)}/transactions/amount/${encodeURIComponent(clientCorrelator)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return "pending";
    const data = await res.json();
    // The docs show both `status` (raw JSON example) and `transactionStatus`
    // (SDK usage example) for the same field — check both rather than trust
    // one name. Message text (e.g. "Insufficient Balance", "Transaction Limit
    // Exceeded") also needs mapping since those aren't literally "failed".
    const raw = String(data.transactionStatus ?? data.status ?? data.statusMessage ?? "").toLowerCase();
    if (raw.includes("success")) return "completed";
    if (raw.includes("fail") || raw.includes("insufficient") || raw.includes("limit") || raw.includes("invalid pin")) return "failed";
    if (raw.includes("cancel")) return "cancelled";
    return "pending";
  } catch {
    return "pending";
  }
}
