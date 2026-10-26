import "server-only";
import { sendEmail } from "./client";

// Owner alert stream — new/failed registrations, every wallet top-up, and
// every failed transaction land at this address. Kept separate from the
// transactions@topme.co.zw ops feed (see transaction-alerts.ts): this is a
// personal-notification mailbox, not the team's ledger.
export const NOTIFY_TO = "notifications@topme.co.zw";

function row(label: string, value: string | null | undefined) {
  if (!value) return "";
  return `<tr>
    <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td>
    <td style="padding:6px 12px;font-size:13px;font-weight:600;color:#111827">${value}</td>
  </tr>`;
}

/** Shared table-row builder so every owner alert has the same shape. */
export function alertTable(rows: { label: string; value?: string | null }[]) {
  return `<table style="border-collapse:collapse;width:100%">${rows.map((r) => row(r.label, r.value)).join("")}</table>`;
}

function shell(badge: string, kicker: string, headline: string, body: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto">
    <div style="background:${badge};color:#fff;padding:14px 18px;border-radius:12px 12px 0 0">
      <div style="font-size:11px;letter-spacing:.08em;opacity:.85">${kicker}</div>
      <div style="font-size:18px;font-weight:800;margin-top:2px">${headline}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:8px 6px">
      ${body}
    </div>
  </div>`;
}

/**
 * Fire-and-forget owner notification. Never throws — sendEmail swallows
 * errors, and an alert must never break the signup/payment flow that
 * triggered it. Always call sites: `void notifyAdmin(...)`.
 */
export async function notifyAdmin(opts: { subject: string; html: string }): Promise<void> {
  await sendEmail({ sender: "notifications", to: NOTIFY_TO, subject: opts.subject, html: opts.html });
}

const PROVIDER_LABEL: Record<string, string> = {
  paynow: "Paynow",
  stripe: "Card (Stripe)",
  ecocash: "EcoCash",
  vitalpay: "VitalPay",
};

/** Wallet top-up alert — both outcomes, per the owner's directive. */
export async function adminTopupAlert(opts: {
  amount: number;
  provider: string;
  reference: string;
  success: boolean;
  customer?: string | null;
  detail?: string | null;
}): Promise<void> {
  const provider = PROVIDER_LABEL[opts.provider] ?? opts.provider;
  const badge = opts.success ? "#16a34a" : "#dc2626";
  const headline = opts.success ? `Top-up — $${opts.amount.toFixed(2)}` : `TOP-UP FAILED — $${opts.amount.toFixed(2)}`;
  await notifyAdmin({
    subject: `${opts.success ? "💰" : "⚠️"} ${opts.success ? "Wallet top-up" : "FAILED top-up"} — $${opts.amount.toFixed(2)} via ${provider} (${opts.reference})`,
    html: shell(
      badge,
      "TOPME WALLET TOP-UP",
      headline,
      alertTable([
        { label: "Amount", value: `$${opts.amount.toFixed(2)}` },
        { label: "Gateway", value: provider },
        { label: "Reference", value: opts.reference },
        { label: "Customer", value: opts.customer },
        { label: "Detail", value: opts.detail },
        { label: "Time", value: new Date().toLocaleString("en-GB", { timeZone: "Africa/Harare" }) + " (CAT)" },
      ])
    ),
  });
}

/** Registration alert — new signups (incl. unconfirmed) and failed attempts. */
export async function adminSignupAlert(opts: {
  email: string;
  fullName?: string | null;
  phone?: string | null;
  status: "new" | "pending_confirmation" | "failed";
  reason?: string | null;
}): Promise<void> {
  const failed = opts.status === "failed";
  const headline = failed ? "FAILED REGISTRATION" : "New registration";
  await notifyAdmin({
    subject: `${failed ? "⚠️" : "👤"} ${failed ? "Failed registration" : "New registration"} — ${opts.email}`,
    html: shell(
      failed ? "#dc2626" : "#16a34a",
      "TOPME ACCOUNT",
      headline,
      alertTable([
        { label: "Email", value: opts.email },
        { label: "Name", value: opts.fullName },
        { label: "Phone", value: opts.phone },
        { label: "Status", value: failed ? "Failed" : opts.status === "pending_confirmation" ? "Awaiting email confirmation" : "Active" },
        { label: "Reason", value: opts.reason },
        { label: "Time", value: new Date().toLocaleString("en-GB", { timeZone: "Africa/Harare" }) + " (CAT)" },
      ])
    ),
  });
}
