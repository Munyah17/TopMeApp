import nodemailer from "nodemailer";

// Real department mailboxes on the topme.co.zw mail server — all share one
// SMTP password (EMAIL_SMTP_PASS), so routing is just "which mailbox do we
// authenticate and send as" per email category. Pick the category at the
// call site, don't default silently, so every send is a deliberate choice:
//   - noreply        automated transactional mail (receipts, top-up/gift/
//                     transfer confirmations) — high volume, no human reads
//                     replies, so it never shares an inbox with a monitored
//                     address.
//   - accounts       billing/finance correspondence — not a bulk sender,
//                     but the reply-to on receipts so "why was I charged"
//                     replies land with the right team instead of noreply.
//   - help           support-ticket/helpdesk correspondence.
//   - customercare    proactive customer-care outreach (dispute outcomes,
//                     manual rectification notices).
//   - info            general inquiries (contact form, fallback address).
//   - marketing       promotional/announcement email campaigns.
//   - sales           B2B / partnership inquiries.
//   - recruitment     careers/HR correspondence.
//   - admin           internal system/ops notifications to staff.
//   - sheq            safety/health/environment/quality — provisioned, no
//                     application code triggers it today.
export const SENDER_ADDRESSES = {
  noreply: "noreply@topme.co.zw",
  accounts: "accounts@topme.co.zw",
  help: "help@topme.co.zw",
  customercare: "customercare@topme.co.zw",
  info: "info@topme.co.zw",
  marketing: "marketing@topme.co.zw",
  sales: "sales@topme.co.zw",
  recruitment: "recruitment@topme.co.zw",
  admin: "admin@topme.co.zw",
  sheq: "sheq@topme.co.zw",
} as const;

export type EmailSender = keyof typeof SENDER_ADDRESSES;

const transporters = new Map<EmailSender, nodemailer.Transporter>();

function getTransporter(sender: EmailSender) {
  const host = process.env.EMAIL_SMTP_HOST;
  const pass = process.env.EMAIL_SMTP_PASS;
  if (!host || !pass) {
    throw new Error("Email is not configured — set EMAIL_SMTP_HOST and EMAIL_SMTP_PASS.");
  }
  let t = transporters.get(sender);
  if (!t) {
    t = nodemailer.createTransport({
      host,
      port: Number(process.env.EMAIL_SMTP_PORT ?? 465),
      secure: process.env.EMAIL_SMTP_SECURE !== "false", // true (port 465) by default
      auth: { user: SENDER_ADDRESSES[sender], pass },
    });
    transporters.set(sender, t);
  }
  return t;
}

/**
 * Fire-and-forget-safe email send. Never throws — a notification failing
 * must never break the payment/wallet flow that triggered it. Logs and
 * swallows errors instead.
 */
export async function sendEmail(opts: { sender: EmailSender; to: string; subject: string; html: string; replyTo?: string }): Promise<void> {
  if (!opts.to) return;
  try {
    const from = `TopMe <${SENDER_ADDRESSES[opts.sender]}>`;
    await getTransporter(opts.sender).sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, replyTo: opts.replyTo });
  } catch (e) {
    console.error(`[email] failed to send "${opts.subject}" to ${opts.to} via ${opts.sender}:`, e instanceof Error ? e.message : e);
  }
}
