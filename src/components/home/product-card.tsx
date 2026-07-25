import Link from "next/link";
import { providerInitials, shade } from "@/lib/data/catalog-helpers";
import type { Service } from "@/types/database";

export function ProductCard({ service, categoryColor }: { service: Service; categoryColor: string }) {
  const provider = service.provider_label || "TopMe";
  const initials = providerInitials(provider);
  const color = service.color || categoryColor;
  return (
    <Link href={`/pay/${service.id}`} className="tap prod-card">
      <div className="prod-media">
        {service.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external provider logos, arbitrary hosts
          <img src={service.logo_url} alt={provider} />
        ) : (
          <span className="prod-logo" style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, -22)})`, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14 }}>
            {initials}
          </span>
        )}
      </div>
      <div className="prod-body">
        <div className="prod-name">{service.name}</div>
      </div>
    </Link>
  );
}
