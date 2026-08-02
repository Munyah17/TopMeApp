import Link from "next/link";
import { Icon } from "@/components/icons";

export function AuthRequired({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 20px" }}>
      <div
        style={{
          width: 74,
          height: 74,
          borderRadius: 22,
          background: "#F1F4F9",
          color: "var(--text-faint)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="lock" size={32} stroke={1.6} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>{title}</div>
      <div className="muted mt-1" style={{ maxWidth: 260 }}>
        {message}
      </div>
      <Link href="/login" className="btn btn-primary mt-4" style={{ textDecoration: "none", padding: "0 20px", height: 44 }}>
        Log in
      </Link>
    </div>
  );
}
