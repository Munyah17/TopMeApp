import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./client";

// Internal ops mailbox — every transaction outcome lands here so the
// transactions team sees successes and failures in real time, without
// waiting for a customer complaint or a dashboard check.
const ALERT_TO = "transactions@topme.co.zw";

export interface TransactionAlertInput {
  outcome: "success" | "failed";
  reference: string;
  service: string;
  amount: number;
  fee?: number | null;
  recipient?: string | null;
  /** How the money moved — "wallet", "paynow", "stripe", "ecocash", etc. */
  method?: string | null;
  /** Customer email or user id, when known. */
  customer?: string | null;
  /** Why it failed, or extra context (provider ref, lines issued, …). */
  detail?: string | null;
}

function row(label: string, value: string | null | undefined) {
  if (!value) return "";
  return `<tr>
    <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td>
    <td style="padding:6px 12px;font-size:13px;font-weight:600;color:#111827">${value}</td>
  </tr>`;
}

/**
 * Fire-and-forget ops alert for a transaction's terminal outcome. Never
 * throws — sendEmail swallows errors, and this must never break the
 * payment flow that triggered it. `admin` is accepted for symmetry with
 * the other notify helpers and future lookups (e.g. resolving user ids).
 */
export async function alertTransaction(_admin: SupabaseClient, opts: TransactionAlertInput): Promise<void> {
  const success = opts.outcome === "success";
  const badge = success ? "#16a34a" : "#dc2626";
  const label = success ? "SUCCESS" : "FAILED";
  const total = opts.amount + (opts.fee ?? 0);

  const subject = `${success ? "✅" : "❌"} ${label} — $${total.toFixed(2)} ${opts.service} (${opts.reference})`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto">
    <div style="background:${badge};color:#fff;padding:14px 18px;border-radius:12px 12px 0 0">
      <div style="font-size:11px;letter-spacing:.08em;opacity:.85">TOPME TRANSACTION ALERT</div>
      <div style="font-size:18px;font-weight:800;margin-top:2px">${label} — $${total.toFixed(2)}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:8px 6px">
      <table style="border-collapse:collapse;width:100%">
        ${row("Service", opts.service)}
        ${row("Reference", opts.reference)}
        ${row("Amount", `$${opts.amount.toFixed(2)}`)}
        ${opts.fee != null ? row("Fee", `$${opts.fee.toFixed(2)}`) : ""}
        ${row("Total", `$${total.toFixed(2)}`)}
        ${row("Paid via", opts.method)}
        ${row("Recipient", opts.recipient)}
        ${row("Customer", opts.customer)}
        ${row("Detail", opts.detail)}
        ${row("Time", new Date().toLocaleString("en-GB", { timeZone: "Africa/Harare" }) + " (CAT)")}
      </table>
    </div>
  </div>`;

  await sendEmail({ sender: "admin", to: ALERT_TO, subject, html });
}
