import Link from "next/link";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="px" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", textAlign: "center" }}>
      <div className="ibadge round" style={{ width: 72, height: 72, background: "var(--green-50)", color: "var(--green-600)" }}>
        <Icon name="search" size={30} stroke={1.6} />
      </div>
      <h2 style={{ fontSize: 20, marginTop: 20 }}>Page not found</h2>
      <div className="muted mt-1" style={{ maxWidth: 280 }}>
        That link doesn&apos;t lead anywhere on TopMe. It may have moved, or the address was mistyped.
      </div>
      <Link href="/home" className="btn btn-primary mt-4" style={{ textDecoration: "none", padding: "0 24px" }}>
        Back to TopMe
      </Link>
    </div>
  );
}
