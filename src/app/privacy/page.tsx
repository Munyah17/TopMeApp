import Link from "next/link";
import { Icon } from "@/components/icons";

export const metadata = { title: "Privacy Policy — TopMe" };

export default function PrivacyPage() {
  return (
    <div>
      <div className="topbar">
        <Link href="/home" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>Privacy Policy</div>
      </div>
      <div className="px content-wrap" style={{ fontSize: 13.5, lineHeight: 1.7, paddingBottom: 40 }}>
        <p className="muted" style={{ fontSize: 12 }}>Last updated: 13 September 2026</p>

        <p>
          This explains what TopMe collects, why, and what we do with it. We collect the minimum needed to run
          your wallet safely and deliver what you buy.
        </p>

        <h3 style={{ marginTop: 20 }}>What we collect</h3>
        <ul style={{ paddingLeft: 18, margin: "8px 0" }}>
          <li>Account details: name, phone number, email, password (stored encrypted, never in plain text).</li>
          <li>Transaction details: what you bought, the amount, the recipient (a phone number, meter number, or account number), and the outcome.</li>
          <li>Payment details needed to process a top-up or purchase (handled by our payment providers — Paynow, EcoCash, Stripe, VitalPay — TopMe never stores your full card number or mobile money PIN).</li>
          <li>For insurance products only: your national ID and the details a policy requires, shared with the underwriter (Motions Microinsurance or the relevant partner) to register you as their client — see our <Link href="/terms">Terms</Link> on TopMe acting as their agent, not the insurer.</li>
          <li>Basic device/usage information (so we can keep the app working and secure) and support messages you send us.</li>
        </ul>

        <h3 style={{ marginTop: 20 }}>What we use it for</h3>
        <ul style={{ paddingLeft: 18, margin: "8px 0" }}>
          <li>Running your wallet accurately — every balance and transaction check is verified against our database, never trusted from your device alone.</li>
          <li>Delivering what you paid for (airtime, tokens, bills, gift cards, insurance policies) by passing the necessary details to the relevant network, biller, or underwriter.</li>
          <li>Fraud prevention, account security, and responding to support requests or disputes.</li>
          <li>Sending you a receipt or an update about your own transaction — we don&apos;t send marketing you haven&apos;t agreed to.</li>
        </ul>

        <h3 style={{ marginTop: 20 }}>Who we share it with</h3>
        <p>
          Only who needs it to complete what you asked for: the network or biller you&apos;re paying (e.g. Econet,
          ZESA, DStv), our payment processors (Paynow, EcoCash, Stripe, VitalPay) to move the money, and — for
          insurance only — the underwriting partner (Motions Microinsurance or the relevant partner) whose
          product you bought. <strong>We do not sell your personal information to anyone.</strong>
        </p>

        <h3 style={{ marginTop: 20 }}>How long we keep it</h3>
        <p>
          Transaction and wallet records are kept as long as your account is open, and for a reasonable period
          after (for tax, dispute, and audit purposes) even if you close your account, as required by law.
        </p>

        <h3 style={{ marginTop: 20 }}>Your rights</h3>
        <p>
          You can ask us to correct inaccurate account details, and you can ask what data we hold about you.
          Deleting your account removes your login and profile; we may be required to keep transaction records
          for a period afterward. A wallet with a remaining balance must be settled (withdrawn) before an account
          can be deleted.
        </p>

        <h3 style={{ marginTop: 20 }}>Security</h3>
        <p>
          Passwords are stored encrypted, not in plain text. All money-affecting actions are validated
          server-side against our database — a number shown on your screen is never treated as authorization to
          move money on its own.
        </p>

        <h3 style={{ marginTop: 20 }}>Contact</h3>
        <p>
          Questions about your data: <a href="mailto:accounts@topme.co.zw">accounts@topme.co.zw</a>.
        </p>

        <p className="muted" style={{ marginTop: 24, fontSize: 11.5 }}>
          See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}
