import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "var(--bg)" }}>
      <Link
        href="/home"
        className="muted tap"
        style={{
          position: "absolute",
          top: "max(20px, calc(env(safe-area-inset-top) + 16px))",
          left: "max(24px, env(safe-area-inset-left))",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          textDecoration: "none",
          fontSize: 13.5,
          fontWeight: 700,
        }}
      >
        <Icon name="chevronL" size={16} stroke={2.2} /> Back to Home
      </Link>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <Link href="/login" style={{ marginBottom: 28, textDecoration: "none" }}>
          <Logo showTagline />
        </Link>
        <div className="content-narrow page-enter" style={{ width: "100%", maxWidth: 400 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
