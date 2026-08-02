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
            background: "#FEF6E7",
            color: "var(--warning)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="alert" size={38} stroke={1.6} />
        </div>
        <h2 style={{ fontSize: 19, marginTop: 18 }}>Temporarily Not Available</h2>
        <div className="muted mt-1" style={{ maxWidth: 280, lineHeight: 1.5 }}>
          {service.name} isn&apos;t available for purchase right now. We&apos;re working on adding real support for it — please check back soon.
        </div>
        <Link href="/services" className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
          Browse other services
        </Link>
      </div>
    </div>
  );
}
