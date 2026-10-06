import Link from "next/link";
import { Icon } from "@/components/icons";
import type { Service } from "@/types/database";

export function ServiceUnavailable({ service }: { service: Service }) {
  return (
    <div>
      <div className="topbar">
        <Link href="/services" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>{service.name}</div>
      </div>
      <div className="px content-narrow" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 50 }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 26,
            background: "var(--warning-bg)",
            color: "var(--warning)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="clock" size={38} stroke={1.6} />
        </div>
        <h2 style={{ fontSize: 19, marginTop: 18 }}>Coming Soon</h2>
        <div className="muted mt-1" style={{ maxWidth: 300, lineHeight: 1.5 }}>
          We&apos;re preparing {service.name} for TopMe. It will be available as soon as our provider connection is activated.
        </div>
        <Link href="/services" className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
          Browse other services
        </Link>
      </div>
    </div>
  );
}
