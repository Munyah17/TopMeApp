import Link from "next/link";
import { Icon } from "@/components/icons";

export const metadata = { title: "Terms of Service — TopMe" };

export default function TermsPage() {
  return (
    <div>
      <div className="topbar">
        <Link href="/home" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>Terms of Service</div>
      </div>
      <div className="px content-wrap" style={{ fontSize: 13.5, lineHeight: 1.7, paddingBottom: 40 }}>
        <p className="muted" style={{ fontSize: 12 }}>Last updated: 13 September 2026</p>

        <p>
          These Terms govern your use of TopMe (topme.co.zw and the TopMe app), operated in Zimbabwe. By creating
          an account or using any TopMe service, you agree to them. If you don&apos;t agree, please don&apos;t use
          TopMe.
        </p>

        <h3 style={{ marginTop: 20 }}>1. What TopMe is</h3>
        <p>
          TopMe is a digital wallet and convenience platform. You can fund a wallet balance and use it to buy
          airtime and mobile data (Econet, NetOne), ZESA electricity tokens, pay bills (DStv, ZOL, TelOne and
          others), send gift cards, transfer money to other TopMe users, and withdraw your balance back out to
          EcoCash or a bank rail. You can also pay for a specific purchase directly by card or mobile money
          without funding a wallet first (&quot;guest checkout&quot;).
        </p>

        <h3 style={{ marginTop: 20 }}>2. Insurance products — we are an agent, not the insurer</h3>
        <p>
          Insurance products available on TopMe (medical, funeral, farming, legal, travel and vehicle cover) are
          underwritten by <strong>Motions Microinsurance</strong> and other licensed underwriting partners named
          on each product. <strong>TopMe is not an insurer.</strong> We act as an agent/dealer, selling these
          products on the underwriter&apos;s behalf and under their licence. Your policy, your premium, and any
          claim are governed by the underwriter&apos;s own terms and licence, not TopMe&apos;s. TopMe adds a
          service margin on top of the underwriter&apos;s premium, shown to you before you buy.
        </p>

        <h3 style={{ marginTop: 20 }}>3. Fees</h3>
        <p>
          Every fee is shown to you before you pay — a wallet top-up fee (varies by payment method), a
          processing fee on some purchases, and a withdrawal fee when you cash out. We don&apos;t charge hidden
          fees. Fees can change; we&apos;ll show the current fee at the time of your transaction.
        </p>

        <h3 style={{ marginTop: 20 }}>4. Refunds</h3>
        <p>
          If a purchase is charged but the service fails to deliver (for example, airtime that doesn&apos;t land),
          you&apos;re refunded to your wallet automatically once the failure is confirmed. If you paid by guest
          checkout with no wallet, our team reviews and processes the refund back to your original payment
          method. Refunds for change-of-mind aren&apos;t offered once a service (airtime, a token, a bill payment)
          has been delivered successfully.
        </p>

        <h3 style={{ marginTop: 20 }}>5. Your account</h3>
        <p>
          You must be 18 or older to open a TopMe account. Keep your login and PIN private — you&apos;re
          responsible for activity on your account unless you can show it wasn&apos;t you. We can suspend an
          account we reasonably believe is being used fraudulently, to launder money, or in breach of these
          Terms; suspending an account doesn&apos;t forfeit any wallet balance you&apos;re owed.
        </p>

        <h3 style={{ marginTop: 20 }}>6. Gift cards and wallet-to-wallet transfers</h3>
        <p>
          A gift balance sent to another user can be spent on TopMe but cannot be withdrawn as cash by either the
          sender or the recipient. Wallet-to-wallet transfers are final once sent — check the recipient before
          confirming.
        </p>

        <h3 style={{ marginTop: 20 }}>7. Liability</h3>
        <p>
          We work with third-party networks and payment providers (Econet, NetOne, ZESA/ZETDC, DStv, ZOL, TelOne,
          Paynow, EcoCash, Stripe, VitalPay and others) to deliver these services, and we&apos;re not liable for
          outages or errors caused entirely on their side, though we&apos;ll always work to get you refunded when
          that happens on a paid transaction. Nothing here limits any right you have that can&apos;t be limited
          under Zimbabwean law.
        </p>

        <h3 style={{ marginTop: 20 }}>8. Changes</h3>
        <p>
          We may update these Terms as TopMe adds or changes services. Material changes will be shown in the app.
          Continuing to use TopMe after a change means you accept the update.
        </p>

        <h3 style={{ marginTop: 20 }}>9. Governing law</h3>
        <p>These Terms are governed by the laws of Zimbabwe.</p>

        <h3 style={{ marginTop: 20 }}>10. Contact</h3>
        <p>
          Questions about these Terms: <a href="mailto:accounts@topme.co.zw">accounts@topme.co.zw</a>.
        </p>

        <p className="muted" style={{ marginTop: 24, fontSize: 11.5 }}>
          See also our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
