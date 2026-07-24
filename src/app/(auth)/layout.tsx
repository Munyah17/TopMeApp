import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg)",
      }}
    >
      <Link href="/" style={{ marginBottom: 28, textDecoration: "none" }}>
        <Logo showTagline />
      </Link>
      <div className="content-narrow page-enter" style={{ width: "100%", maxWidth: 400 }}>
        {children}
      </div>
    </div>
  );
}
