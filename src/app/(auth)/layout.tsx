import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Back link lives in normal flow — the old absolute-positioned version
          sat on top of the centered logo on short screens (worst on /signup,
          where the taller form pushes the logo up under it). */}
      <div style={{ padding: "max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-left)) 0", flexShrink: 0 }}>
        <Link
          href="/home"
          className="muted tap"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 36,
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: 700,
          }}
        >
          <Icon name="chevronL" size={16} stroke={2.2} /> Back to Home
        </Link>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 24px 32px",
        }}
      >
        <Link href="/login" style={{ marginBottom: 24, textDecoration: "none" }}>
          <Logo showTagline />
        </Link>
        <div className="content-narrow page-enter" style={{ width: "100%", maxWidth: 400 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
