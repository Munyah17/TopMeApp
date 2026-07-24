import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";

const FEATURES: { icon: string; title: string; desc: string; color: string; bg: string }[] = [
  { icon: "phone", title: "Airtime & Data", desc: "Econet, NetOne, Telecel — instantly.", color: "#00C853", bg: "#E9FBF0" },
  { icon: "zap", title: "ZESA & Utilities", desc: "Prepaid tokens, DStv, council bills.", color: "#F59E0B", bg: "#FEF6E7" },
  { icon: "shield", title: "Insurance", desc: "Vehicle, legal, agriculture & cash plans.", color: "#00C853", bg: "#E9FBF0" },
  { icon: "wifi", title: "Connectivity", desc: "Starlink, ZOL, TelOne, eSIM & more.", color: "#38BDF8", bg: "#EAF8FF" },
  { icon: "book", title: "School Fees", desc: "Pay any institution, no queues.", color: "#F59E0B", bg: "#FEF6E7" },
  { icon: "gift", title: "Gift Vouchers", desc: "Send a top up to anyone, instantly.", color: "#00C853", bg: "#E9FBF0" },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        className="row between"
        style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 24px" }}
      >
        <Logo showTagline />
        <div className="row gap-2" style={{ gap: 12 }}>
          <Link href="/login" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Log in
          </Link>
          <Link href="/signup" className="btn btn-primary" style={{ textDecoration: "none", padding: "0 20px" }}>
            Get started
          </Link>
        </div>
      </header>

      <section className="content-wrap px" style={{ paddingTop: 48, paddingBottom: 48, textAlign: "center" }}>
        <div className="eyebrow" style={{ color: "var(--green-600)" }}>
          Zimbabwe&apos;s Digital Convenience Store
        </div>
        <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", marginTop: 12, lineHeight: 1.08 }}>
          One wallet. Every top up.
          <br />
          Every bill, paid easy.
        </h1>
        <p className="muted" style={{ fontSize: 16, maxWidth: 560, margin: "18px auto 0" }}>
          Airtime, data, ZESA, DStv, insurance, school fees, gadgets and more — fund your TopMe wallet once
          and pay for anything without leaving the app.
        </p>
        <div className="row gap-2" style={{ justifyContent: "center", marginTop: 28, gap: 14 }}>
          <Link href="/signup" className="btn btn-primary" style={{ textDecoration: "none", padding: "0 28px" }}>
            Create your wallet
          </Link>
          <Link href="/login" className="btn btn-secondary" style={{ textDecoration: "none", padding: "0 28px" }}>
            I have an account
          </Link>
        </div>
      </section>

      <section className="content-wrap px" style={{ paddingBottom: 72 }}>
        <div className="cats-grid">
          {FEATURES.map((f) => (
            <div className="card card-pad" key={f.title}>
              <div className="ibadge round" style={{ background: f.bg, color: f.color }}>
                <Icon name={f.icon} size={22} stroke={1.8} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 12 }}>{f.title}</div>
              <div className="muted" style={{ marginTop: 2 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="content-wrap px" style={{ paddingBottom: 32, textAlign: "center" }}>
        <div className="muted">© {new Date().getFullYear()} TopMe. Top up. Pay easy.</div>
      </footer>
    </div>
  );
}
