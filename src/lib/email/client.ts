import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  const host = process.env.EMAIL_SMTP_HOST;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("Email is not configured — set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, EMAIL_SMTP_PASS.");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.EMAIL_SMTP_PORT ?? 465),
      secure: process.env.EMAIL_SMTP_SECURE !== "false", // true (port 465) by default
      auth: { user, pass },
    });
  }
  return transporter;
}

/**
 * Fire-and-forget-safe email send. Never throws — a notification failing
 * must never break the payment/wallet flow that triggered it. Logs and
 * swallows errors instead.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!opts.to) return;
  try {
    const from = process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER;
    await getTransporter().sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
  } catch (e) {
    console.error(`[email] failed to send "${opts.subject}" to ${opts.to}:`, e instanceof Error ? e.message : e);
  }
}
