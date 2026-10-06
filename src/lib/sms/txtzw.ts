import type { SupabaseClient } from "@supabase/supabase-js";
import { logTransactionEvent } from "@/lib/transaction-events";

/**
 * txt.co.zw API — Paynow's SMS gateway (also does pinless airtime).
 *
 * Two hosts, NOT interchangeable (credentials are per-host):
 *   www.txt.co.zw  — ZWG account
 *   usd.txt.co.zw  — USD account
 *
 * Auth: a user with the REMOTE role on the txt.co.zw account, either
 *   1. Basic auth (REMOTE user + ≥16-char password) — preferred, works
 *      from anywhere; set TXTZW_USERNAME + TXTZW_PASSWORD, or
 *   2. username + whitelisted server IP — set TXTZW_USERNAME only and
 *      register this server's public IP with txt.co.zw.
 *
 * Requests MUST be made server-side — the whitelisted IP is ours, not the
 * customer's. All four endpoints accept GET or form POST; we use GET with
 * URL-encoded params (documented, and simplest for their parser).
 *
 * Responses are plain text: "SUCCESS: {id}", "ERROR: {reason}", or for
 * AccountBalance a bare number — not JSON.
 */

function config() {
  const host = (process.env.TXTZW_HOST || "www.txt.co.zw").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const username = process.env.TXTZW_USERNAME;
  const password = process.env.TXTZW_PASSWORD;
  if (!username) {
    throw new Error("txt.co.zw is not configured — set TXTZW_USERNAME (and TXTZW_PASSWORD for Basic auth).");
  }
  return {
    base: `https://${host}`,
    username,
    // Basic auth only when a password exists — IP-auth accounts omit the
    // password and pass Username as a parameter instead.
    authHeader: password ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` : null,
  };
}

export function smsConfigured(): boolean {
  return Boolean(process.env.TXTZW_USERNAME);
}

export class TxtZwError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxtZwError";
  }
}

async function txtRequest(path: string, params: Record<string, string>): Promise<string> {
  const { base, username, authHeader } = config();
  const q = new URLSearchParams(params);
  // Username-as-param is only needed for IP auth; Basic auth can omit it
  // but including it is harmless and keeps one code path.
  if (!q.has("Username") && !q.has("username")) q.set("Username", username);
  const res = await fetch(`${base}${path}?${q.toString()}`, {
    headers: authHeader ? { Authorization: authHeader } : {},
    cache: "no-store",
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new TxtZwError(`txt.co.zw ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (/^ERROR:/i.test(text)) {
    throw new TxtZwError(`txt.co.zw ${path}: ${text.slice(7).trim()}`);
  }
  return text;
}

/** GET /Remote/AccountBalance — plain-text balance string. */
export async function accountBalance(): Promise<string> {
  return txtRequest("/Remote/AccountBalance", {});
}

/** GET /Remote/SendMessage — returns the message id on success. */
export async function sendMessage(recipients: string[], body: string, sendingNumber?: string): Promise<string> {
  const params: Record<string, string> = {
    Recipients: recipients.join(","),
    Body: body,
  };
  if (sendingNumber) params.sending_number = sendingNumber;
  const text = await txtRequest("/Remote/SendMessage", params);
  // "SUCCESS: {message id}"
  return text.replace(/^SUCCESS:\s*/i, "").trim();
}

/** GET /Remote/CheckMessage/{id} — NULL-delimited delivery summary.
 *  Returns the parsed per-recipient status lines. */
export async function checkDelivery(messageId: string): Promise<{ messageId: string; sendingNumber?: string; recipients: { number: string; status: string; gatewayId?: string; gatewayDesc?: string }[] }> {
  const text = await txtRequest(`/Remote/CheckMessage/${encodeURIComponent(messageId)}`, {});
  const clean = text.replace(/^SUCCESS:\s*/i, "");
  const lines = clean.split("\0").filter((l) => l.trim());
  const [first, ...rest] = lines;
  const [id, sendingNumber] = first.split(",");
  return {
    messageId: id?.trim() ?? messageId,
    sendingNumber: sendingNumber?.trim() || undefined,
    recipients: rest.map((line) => {
      const [number, status, gatewayId, gatewayDesc] = line.split(",");
      return { number: number?.trim() ?? "", status: status?.trim() ?? "", gatewayId: gatewayId?.trim() || undefined, gatewayDesc: gatewayDesc?.trim() || undefined };
    }),
  };
}

/** GET /Remote/DirectRecharge — pinless airtime to a mobile number.
 *  Amount is in the host's currency (ZWG on www, USD on usd). */
export async function sendAirtime(recipient: string, amount: number): Promise<string | undefined> {
  const text = await txtRequest("/Remote/DirectRecharge", { Recipient: recipient, Amount: amount.toFixed(2) });
  // Most TXT operations return "SUCCESS: <id>". DirectRecharge may return
  // just SUCCESS on some accounts, so the provider reference is optional.
  const value = text.replace(/^SUCCESS:\s*/i, "").trim();
  return value && !/^success$/i.test(value) ? value : undefined;
}

/** Normalize a ZW mobile to international digits (txt.co.zw replaces a
 *  leading 0 with the country code itself, but be explicit anyway). */
export function normalizeRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("263")) return digits;
  if (digits.startsWith("0")) return `263${digits.slice(1)}`;
  return digits;
}

/**
 * Send BillPay ReceiptSmses — BillPay UAT requires every entry be sent to
 * the customer INDIVIDUALLY (never concatenated), so each string is its own
 * SendMessage call. Failures are logged per message, never thrown — the
 * payment already completed; a missed SMS can't roll it back, but ops must
 * see it happened.
 */
export async function sendBillPayReceiptSmses(args: {
  admin: SupabaseClient;
  transactionId?: string;
  reference?: string;
  phone: string;
  smses: string[];
}): Promise<{ sent: number; failed: number }> {
  const { admin, transactionId, reference, phone, smses } = args;
  let sent = 0;
  let failed = 0;
  if (!smsConfigured() || !smses.length || !phone) {
    if (smses.length && !smsConfigured()) {
      void logTransactionEvent(admin, {
        transactionId, reference,
        eventType: "fulfillment_success",
        message: `${smses.length} BillPay receipt SMS(es) could not be sent — TXTZW credentials not configured.`,
      });
    }
    return { sent, failed: smsConfigured() ? 0 : smses.length };
  }
  const recipient = normalizeRecipient(phone);
  for (const body of smses) {
    try {
      const messageId = await sendMessage([recipient], body);
      sent++;
      void logTransactionEvent(admin, {
        transactionId, reference,
        eventType: "fulfillment_success",
        message: `Receipt SMS sent to ${recipient} (id ${messageId}).`,
      });
    } catch (e) {
      failed++;
      void logTransactionEvent(admin, {
        transactionId, reference,
        eventType: "fulfillment_failed",
        message: `Receipt SMS to ${recipient} failed: ${e instanceof Error ? e.message : "unknown error"}.`,
      });
    }
  }
  return { sent, failed };
}
