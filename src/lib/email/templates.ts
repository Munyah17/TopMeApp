const WRAP_OPEN = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#F8FAFC;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E7ECF3;">
    <div style="background:#0F172A;padding:24px 28px;">
      <span style="font-family:Georgia,serif;font-weight:800;font-size:20px;color:#FFFFFF;">Top<span style="color:#00C853;">Me</span></span>
    </div>
    <div style="padding:28px;">
`;
const WRAP_CLOSE = `
    </div>
    <div style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E7ECF3;">
      <p style="margin:0;font-size:12px;color:#94A3B8;">TopMe · Top up. Pay easy. This is an automated notification — please don't reply to this email.</p>
    </div>
  </div>
</div>`;

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #E7ECF3;color:#64748B;font-size:13px;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #E7ECF3;color:#111827;font-size:13px;font-weight:700;text-align:right;">${value}</td>
  </tr>`;
}

export function paymentReceiptEmail(opts: {
  serviceName: string;
  amount: number;
  reference: string;
  recipient: string;
  date: string;
}) {
  return {
    subject: `Payment successful — $${opts.amount.toFixed(2)} · ${opts.serviceName}`,
    html: `${WRAP_OPEN}
      <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">Payment successful</h2>
      <p style="margin:0 0 20px;font-size:13.5px;color:#64748B;">Your ${opts.serviceName} payment went through.</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Amount", `$${opts.amount.toFixed(2)}`)}
        ${row("Service", opts.serviceName)}
        ${row("Recipient", opts.recipient)}
        ${row("Reference", opts.reference)}
        ${row("Date", opts.date)}
      </table>
    ${WRAP_CLOSE}`,
  };
}

export function topupConfirmationEmail(opts: { amount: number; provider: string; reference: string; balance: number }) {
  return {
    subject: `Wallet top up successful — $${opts.amount.toFixed(2)}`,
    html: `${WRAP_OPEN}
      <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">Wallet topped up</h2>
      <p style="margin:0 0 20px;font-size:13.5px;color:#64748B;">Your TopMe wallet has been credited.</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Amount added", `$${opts.amount.toFixed(2)}`)}
        ${row("Method", opts.provider)}
        ${row("Reference", opts.reference)}
        ${row("New balance", `$${opts.balance.toFixed(2)}`)}
      </table>
    ${WRAP_CLOSE}`,
  };
}

export function giftSentEmail(opts: { amount: number; receiverPhone: string; code: string }) {
  return {
    subject: `Gift voucher sent — $${opts.amount.toFixed(2)}`,
    html: `${WRAP_OPEN}
      <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">Gift voucher sent</h2>
      <p style="margin:0 0 20px;font-size:13.5px;color:#64748B;">Share this code with ${opts.receiverPhone} so they can redeem it.</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Amount", `$${opts.amount.toFixed(2)}`)}
        ${row("Sent to", opts.receiverPhone)}
        ${row("Voucher code", opts.code)}
      </table>
    ${WRAP_CLOSE}`,
  };
}

export function giftRedeemedEmail(opts: { amount: number; code: string; balance: number }) {
  return {
    subject: `Gift voucher redeemed — $${opts.amount.toFixed(2)}`,
    html: `${WRAP_OPEN}
      <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">Gift voucher redeemed</h2>
      <p style="margin:0 0 20px;font-size:13.5px;color:#64748B;">The voucher has been added to your wallet.</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Amount", `$${opts.amount.toFixed(2)}`)}
        ${row("Voucher code", opts.code)}
        ${row("New balance", `$${opts.balance.toFixed(2)}`)}
      </table>
    ${WRAP_CLOSE}`,
  };
}

export function topupFailedEmail(opts: { amount: number; provider: string }) {
  return {
    subject: `Wallet top up didn't go through`,
    html: `${WRAP_OPEN}
      <h2 style="margin:0 0 4px;font-size:18px;color:#EF4444;">Top up didn't go through</h2>
      <p style="margin:0 0 20px;font-size:13.5px;color:#64748B;">Your $${opts.amount.toFixed(2)} top up via ${opts.provider} was not completed. Your wallet was not charged — you can try again anytime.</p>
    ${WRAP_CLOSE}`,
  };
}

export function paymentFailedEmail(opts: { serviceName: string; amount: number; reason: string }) {
  return {
    subject: `Payment failed — ${opts.serviceName}`,
    html: `${WRAP_OPEN}
      <h2 style="margin:0 0 4px;font-size:18px;color:#EF4444;">Payment failed</h2>
      <p style="margin:0 0 20px;font-size:13.5px;color:#64748B;">Your $${opts.amount.toFixed(2)} payment for ${opts.serviceName} couldn't be completed. ${opts.reason}</p>
      <p style="margin:0;font-size:13px;color:#64748B;">No funds were deducted from your wallet for this attempt.</p>
    ${WRAP_CLOSE}`,
  };
}
