import Link from "next/link";
import { Icon } from "@/components/icons";

export function AccessLocked({ title, message }: { title: string; message: string }) {
  return (
    <div>
      <div className="topbar">
        <Link href="/account" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>Admin</div>
      </div>
      <div className="px content-wrap">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              background: "var(--muted)",
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
        </div>
      </div>
    </div>
  );
}
