// TopMe transactional email design system.
//
// Everything here renders to table-based HTML with inline styles, because
// that is the only thing that survives every mail client. Specifically:
// no flexbox/grid (Outlook's Word engine ignores both), no CSS variables
// (same), no external stylesheets (stripped or blocked), and every colour
// written literally at the element that uses it. The <style> block in the
// head is progressive enhancement only — Apple Mail and iOS honour it for
// dark mode, Gmail drops it, and the inline styles below mean the light
// rendering is correct either way.
//
// Layout is a single 600px column: the widest that renders without
// horizontal scroll in a desktop preview pane, and it collapses cleanly on
// mobile because every table is width:100% with a max-width cap.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://topme.co.zw";

const C = {
  navy: "#0F172A",
  navySoft: "#1E293B",
  green: "#00C853",
  greenDark: "#00A344",
  red: "#EF4444",
  amber: "#F59E0B",
  text: "#111827",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E7ECF3",
  bg: "#F1F5F9",
  surface: "#FFFFFF",
  tint: "#F8FAFC",
} as const;

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

type Accent = "success" | "danger" | "warning" | "brand";

const ACCENT: Record<Accent, { color: string; label: string }> = {
  success: { color: C.green, label: "Successful" },
  danger: { color: C.red, label: "Action needed" },
  warning: { color: C.amber, label: "Pending" },
  brand: { color: C.navy, label: "TopMe" },
};

/** Escapes user-supplied values (names, service names, reasons) before they
 *  reach the HTML — these come from profiles and provider messages, so they
 *  must never be able to inject markup into an email we send. */
function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (n: number) => `$${n.toFixed(2)}`;

// ── Building blocks ───────────────────────────────────────────────────────

/** One label/value line in a detail table. */
function row(label: string, value: string, opts?: { strong?: boolean }) {
  const weight = opts?.strong ? "800" : "700";
  const size = opts?.strong ? "15px" : "13.5px";
  return `<tr>
    <td style="padding:11px 0;border-bottom:1px solid ${C.border};color:${C.muted};font-size:13.5px;font-family:${FONT};">${esc(label)}</td>
    <td style="padding:11px 0;border-bottom:1px solid ${C.border};color:${C.text};font-size:${size};font-weight:${weight};text-align:right;font-family:${FONT};">${esc(value)}</td>
  </tr>`;
}

function rows(pairs: Array<[string, string] | null>) {
  const body = pairs.filter(Boolean).map((p) => row((p as [string, string])[0], (p as [string, string])[1])).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${body}</table>`;
}

/** The headline figure on money emails — the one thing a customer scans for. */
function hero(amount: number, caption: string, accent: Accent = "success") {
  const c = ACCENT[accent].color;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;margin:0 0 24px;">
    <tr>
      <td align="center" style="background:${C.tint};border:1px solid ${C.border};border-radius:16px;padding:26px 20px;">
        <div style="font-family:${FONT};font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:${C.faint};font-weight:700;">${esc(caption)}</div>
        <div style="font-family:${FONT};font-size:38px;line-height:1.15;font-weight:800;color:${c};padding-top:6px;">${esc(money(amount))}</div>
      </td>
    </tr>
  </table>`;
}

/** Voucher / reference code, shown monospaced and selectable. */
function codeBox(code: string, caption: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;margin:0 0 22px;">
    <tr>
      <td align="center" style="background:${C.navy};border-radius:14px;padding:20px;">
        <div style="font-family:${FONT};font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:#7DD3A0;font-weight:700;">${esc(caption)}</div>
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:25px;line-height:1.3;font-weight:700;color:#FFFFFF;letter-spacing:.10em;padding-top:8px;">${esc(code)}</div>
      </td>
    </tr>
  </table>`;
}

/** Table-based CTA — works in Outlook, where padding on a bare <a> collapses. */
function button(label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:26px 0 2px;">
    <tr>
      <td bgcolor="${C.green}" style="border-radius:12px;">
        <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:14.5px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** Quiet aside — reassurance ("no funds were deducted"), next steps, etc. */
function note(text: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;margin:20px 0 0;">
    <tr>
      <td style="background:${C.tint};border-left:3px solid ${C.border};border-radius:0 10px 10px 0;padding:13px 16px;font-family:${FONT};font-size:13px;line-height:1.55;color:${C.muted};">${text}</td>
    </tr>
  </table>`;
}

// ── Shell ─────────────────────────────────────────────────────────────────

function layout(opts: {
  /** Inbox preview line. Without it clients scrape the first body text,
   *  which is usually the logo alt or a stray style fragment. */
  preheader: string;
  title: string;
  accent?: Accent;
  intro?: string;
  content: string;
  cta?: { label: string; url: string };
}) {
  const accent = opts.accent ?? "brand";
  const bar = ACCENT[accent].color;
  const titleColor = accent === "danger" ? C.red : C.text;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.title)}</title>
<style>
  /* Progressive enhancement only — every rule below has an inline
     light-mode equivalent, so clients that strip this still render right. */
  @media (prefers-color-scheme: dark) {
    .tm-bg      { background:#0B1220 !important; }
    .tm-card    { background:#111C2E !important; border-color:#22314A !important; }
    .tm-title   { color:#F1F5F9 !important; }
    .tm-text    { color:#A9B6CA !important; }
    .tm-panel   { background:#16233A !important; border-color:#22314A !important; }
    .tm-rowlabel{ color:#93A3BA !important; }
    .tm-rowvalue{ color:#F1F5F9 !important; border-color:#22314A !important; }
    .tm-foot    { background:#0B1220 !important; border-color:#22314A !important; }
  }
  @media only screen and (max-width:620px) {
    .tm-pad   { padding-left:22px !important; padding-right:22px !important; }
    .tm-hero  { font-size:32px !important; }
  }
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
</style>
</head>
<body class="tm-bg" style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(opts.preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;">&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="tm-bg" style="width:100%;background:${C.bg};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:28px 14px 34px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="tm-card" style="width:100%;max-width:600px;background:${C.surface};border:1px solid ${C.border};border-radius:20px;border-collapse:separate;overflow:hidden;">

        <!-- brand bar -->
        <tr>
          <td style="background:${C.navy};padding:22px 30px;">
            <span style="font-family:Georgia,'Times New Roman',serif;font-weight:800;font-size:21px;color:#FFFFFF;letter-spacing:-.01em;">Top<span style="color:${C.green};">Me</span></span>
          </td>
        </tr>
        <!-- accent rule: the status colour, readable before a word is read -->
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${bar};">&nbsp;</td></tr>

        <tr>
          <td class="tm-pad" style="padding:32px 30px 30px;">
            <h1 class="tm-title" style="margin:0 0 6px;font-family:${FONT};font-size:21px;line-height:1.3;font-weight:800;color:${titleColor};">${esc(opts.title)}</h1>
            ${opts.intro ? `<p class="tm-text" style="margin:0 0 24px;font-family:${FONT};font-size:14.5px;line-height:1.6;color:${C.muted};">${opts.intro}</p>` : `<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>`}
            ${opts.content}
            ${opts.cta ? button(opts.cta.label, opts.cta.url) : ""}
          </td>
        </tr>

        <tr>
          <td class="tm-foot tm-pad" style="padding:20px 30px 24px;background:${C.tint};border-top:1px solid ${C.border};">
            <p class="tm-text" style="margin:0 0 8px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.muted};">
              Questions about this email? Reach us at
              <a href="mailto:help@topme.co.zw" style="color:${C.greenDark};text-decoration:none;font-weight:600;">help@topme.co.zw</a>.
            </p>
            <p style="margin:0;font-family:${FONT};font-size:11.5px;line-height:1.6;color:${C.faint};">
              TopMe &middot; Top up. Pay easy. &middot; Harare, Zimbabwe<br>
              This is an automated message from an unmonitored address — please don't reply directly.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── Templates ─────────────────────────────────────────────────────────────

export function welcomeEmail(opts: { name?: string | null }) {
  // Raw, not pre-escaped — layout() escapes the title itself, and escaping
  // twice would render "O&amp;#39;Brien" in the customer's inbox.
  const who = opts.name?.trim() ? `, ${opts.name.trim()}` : "";
  return {
    subject: "Welcome to TopMe",
    html: layout({
      preheader: "Your TopMe account is ready — top up your wallet and pay for anything in seconds.",
      title: `Welcome to TopMe${who}`,
      accent: "success",
      intro: "Your account is ready. TopMe puts airtime, data, ZESA tokens, DStv, council bills and more in one place — pay from your wallet in seconds.",
      content: `
        ${rows([
          ["Top up your wallet", "EcoCash, card or Paynow"],
          ["Pay for anything", "Airtime, data, ZESA, DStv, bills"],
          ["Send money", "Straight to any TopMe wallet"],
        ])}
        ${note("<strong style=\"color:#111827;\">Keep your account safe.</strong> TopMe will never ask you for your password, PIN or a one-time code — not by email, call or WhatsApp.")}
      `,
      cta: { label: "Open TopMe", url: APP_URL },
    }),
  };
}

export function paymentReceiptEmail(opts: {
  serviceName: string;
  amount: number;
  reference: string;
  recipient: string;
  date: string;
}) {
  return {
    subject: `Payment successful: ${money(opts.amount)} for ${opts.serviceName}`,
    html: layout({
      preheader: `${money(opts.amount)} paid for ${opts.serviceName} — reference ${opts.reference}.`,
      title: "Payment successful",
      accent: "success",
      intro: `Your ${esc(opts.serviceName)} payment went through. Here's your receipt.`,
      content: `
        ${hero(opts.amount, "Amount paid")}
        ${rows([
          ["Service", opts.serviceName],
          ["Recipient", opts.recipient],
          ["Reference", opts.reference],
          ["Date", opts.date],
        ])}
      `,
      cta: { label: "View in TopMe", url: `${APP_URL}/history` },
    }),
  };
}

export function topupConfirmationEmail(opts: { amount: number; provider: string; reference: string; balance: number }) {
  return {
    subject: `Wallet top up successful: ${money(opts.amount)}`,
    html: layout({
      preheader: `${money(opts.amount)} added — your balance is now ${money(opts.balance)}.`,
      title: "Wallet topped up",
      accent: "success",
      intro: "Your TopMe wallet has been credited and is ready to spend.",
      content: `
        ${hero(opts.amount, "Amount added")}
        ${rows([
          ["Method", opts.provider],
          ["Reference", opts.reference],
          ["New balance", money(opts.balance)],
        ])}
      `,
      cta: { label: "Pay for something", url: `${APP_URL}/services` },
    }),
  };
}

export function giftSentEmail(opts: { amount: number; receiverPhone: string; code: string }) {
  return {
    subject: `Gift voucher sent: ${money(opts.amount)}`,
    html: layout({
      preheader: `Your ${money(opts.amount)} voucher for ${opts.receiverPhone} is ready to share.`,
      title: "Gift voucher sent",
      accent: "success",
      intro: `Share this code with ${esc(opts.receiverPhone)} so they can redeem it into their TopMe wallet.`,
      content: `
        ${codeBox(opts.code, "Voucher code")}
        ${rows([
          ["Amount", money(opts.amount)],
          ["Sent to", opts.receiverPhone],
        ])}
        ${note("The recipient redeems it under Wallet → Gift card in the TopMe app (they'll need a TopMe account). Anyone with this code can redeem it, so send it only to the person it's meant for.")}
      `,
      cta: { label: "Open TopMe", url: `${APP_URL}/wallet` },
    }),
  };
}

export function giftRedeemedEmail(opts: { amount: number; code: string; balance: number }) {
  return {
    subject: `Gift voucher redeemed: ${money(opts.amount)}`,
    html: layout({
      preheader: `${money(opts.amount)} added to your wallet — new balance ${money(opts.balance)}.`,
      title: "Gift voucher redeemed",
      accent: "success",
      intro: "The voucher has been added to your TopMe wallet.",
      content: `
        ${hero(opts.amount, "Amount redeemed")}
        ${rows([
          ["Voucher code", opts.code],
          ["New balance", money(opts.balance)],
        ])}
      `,
      cta: { label: "Open wallet", url: `${APP_URL}/wallet` },
    }),
  };
}

export function moneySentEmail(opts: { amount: number; receiverName: string; kind: "transfer" | "red_packet" }) {
  const label = opts.kind === "red_packet" ? "Red packet" : "Money";
  return {
    subject: `${label} sent: ${money(opts.amount)}`,
    html: layout({
      preheader: `${money(opts.amount)} sent to ${opts.receiverName}.`,
      title: `${label} sent`,
      accent: "success",
      intro: `Your transfer to ${esc(opts.receiverName)} went through instantly.`,
      content: `
        ${hero(opts.amount, "Amount sent")}
        ${rows([["Sent to", opts.receiverName]])}
      `,
      cta: { label: "View in TopMe", url: `${APP_URL}/history` },
    }),
  };
}

export function moneyReceivedEmail(opts: { amount: number; senderName: string; kind: "transfer" | "red_packet" }) {
  const label = opts.kind === "red_packet" ? "red packet" : "money transfer";
  return {
    subject: `You received ${money(opts.amount)} on TopMe`,
    html: layout({
      preheader: `${opts.senderName} sent you ${money(opts.amount)} — it's already in your wallet.`,
      title: `You've been sent a ${label}!`,
      accent: "success",
      intro: `${esc(opts.senderName)} sent you money, and it's already in your TopMe wallet.`,
      content: `
        ${hero(opts.amount, "Amount received")}
        ${rows([["From", opts.senderName]])}
      `,
      cta: { label: "Open wallet", url: `${APP_URL}/wallet` },
    }),
  };
}

export function topupFailedEmail(opts: { amount: number; provider: string }) {
  return {
    subject: "Wallet top up didn't go through",
    html: layout({
      preheader: `Your ${money(opts.amount)} top up wasn't completed — you haven't been charged.`,
      title: "Top up didn't go through",
      accent: "danger",
      intro: `Your ${esc(money(opts.amount))} top up via ${esc(opts.provider)} wasn't completed.`,
      content: `
        ${rows([
          ["Amount", money(opts.amount)],
          ["Method", opts.provider],
          ["Status", "Not completed"],
        ])}
        ${note("<strong style=\"color:#111827;\">You haven't been charged.</strong> Nothing was taken for this attempt, so you can safely try again whenever you're ready.")}
      `,
      cta: { label: "Try again", url: `${APP_URL}/wallet` },
    }),
  };
}

// Fulfilment failed AFTER the wallet was charged, and we've automatically
// put the money back. (Different from paymentFailedEmail, which is for a
// failure where nothing was ever deducted.)
export function refundIssuedEmail(opts: { serviceName: string; amount: number; reference: string; balance: number }) {
  return {
    subject: `Refunded: ${money(opts.amount)} back in your wallet`,
    html: layout({
      preheader: `We couldn't complete your ${opts.serviceName} order, so ${money(opts.amount)} is back in your TopMe wallet.`,
      title: "Payment reversed",
      accent: "success",
      intro: `We couldn't complete your ${esc(opts.serviceName)} order, so we've put the full ${esc(money(opts.amount))} straight back into your TopMe wallet.`,
      content: `
        ${hero(opts.amount, "Refunded to wallet")}
        ${rows([
          ["Service", opts.serviceName],
          ["Original reference", opts.reference],
          ["New wallet balance", money(opts.balance)],
          ["Status", "Refunded"],
        ])}
        ${note("Nothing more is needed from you. You can use the balance for another purchase, or withdraw it from your wallet.")}
      `,
      cta: { label: "Open wallet", url: `${APP_URL}/wallet` },
    }),
  };
}

// Fulfilment failed after payment and the refund is larger than the
// auto-refund limit (or it was a guest checkout) — it's with the team.
export function refundQueuedEmail(opts: { serviceName: string; amount: number; reference: string }) {
  return {
    subject: `We're sorting out your ${opts.serviceName} payment`,
    html: layout({
      preheader: `Your ${money(opts.amount)} ${opts.serviceName} order couldn't be completed — our team is processing your refund.`,
      title: "We're on it",
      accent: "warning",
      intro: `Your ${esc(money(opts.amount))} ${esc(opts.serviceName)} order couldn't be completed. Because of the amount, a team member is reviewing your refund now.`,
      content: `
        ${rows([
          ["Service", opts.serviceName],
          ["Amount", money(opts.amount)],
          ["Reference", opts.reference],
          ["Status", "Refund in review"],
        ])}
        ${note("You'll get another email the moment it's done — usually within a few hours. No action needed from you.")}
      `,
      cta: { label: "View in TopMe", url: `${APP_URL}/history` },
    }),
  };
}

// Sent to the ops inbox whenever a fulfilment fails after payment.
export function staffFulfilmentFailureEmail(opts: {
  serviceName: string;
  reference: string;
  amount: number;
  reason: string;
  refundState: "auto-refunded" | "needs approval";
  customer: string;
}) {
  return {
    subject: `[Ops] Fulfilment failed — ${opts.reference} (${opts.refundState})`,
    html: layout({
      preheader: `${opts.serviceName} ${money(opts.amount)} failed after payment — ${opts.refundState}.`,
      title: "Fulfilment failed after payment",
      accent: opts.refundState === "auto-refunded" ? "warning" : "danger",
      intro: `A ${esc(opts.serviceName)} order failed at the provider after the customer had paid.`,
      content: `
        ${rows([
          ["Reference", opts.reference],
          ["Service", opts.serviceName],
          ["Amount", money(opts.amount)],
          ["Customer", opts.customer],
          ["Provider error", opts.reason],
          ["Refund", opts.refundState === "auto-refunded" ? "Auto-refunded to wallet" : "Queued — needs an admin decision"],
        ])}
      `,
      cta: { label: "Open Refunds console", url: `${APP_URL}/super-admin/refunds` },
    }),
  };
}

export function paymentFailedEmail(opts: { serviceName: string; amount: number; reason: string }) {
  return {
    subject: `Payment failed: ${opts.serviceName}`,
    html: layout({
      preheader: `Your ${money(opts.amount)} payment for ${opts.serviceName} couldn't be completed.`,
      title: "Payment failed",
      accent: "danger",
      intro: `Your ${esc(money(opts.amount))} payment for ${esc(opts.serviceName)} couldn't be completed. ${esc(opts.reason)}`,
      content: `
        ${rows([
          ["Service", opts.serviceName],
          ["Amount", money(opts.amount)],
          ["Status", "Failed"],
        ])}
        ${note("<strong style=\"color:#111827;\">No funds were deducted</strong> from your wallet for this attempt. If you were charged by mistake, reply to this notice from the app or contact help@topme.co.zw and we'll sort it out.")}
      `,
      cta: { label: "Try again", url: `${APP_URL}/services` },
    }),
  };
}
