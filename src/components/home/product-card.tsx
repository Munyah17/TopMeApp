import Link from "next/link";
import { Icon } from "@/components/icons";
import { shade } from "@/lib/data/catalog-helpers";
import type { Service } from "@/types/database";

export function ProductCard({ service, categoryColor }: { service: Service; categoryColor: string }) {
  const color = service.color || categoryColor;
  return (
    <Link href={`/pay/${service.id}`} className="tap prod-card">
      <div className="prod-media">
        {service.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external provider logos, arbitrary hosts
          <img src={service.logo_url} alt={service.name} />
        ) : (
          <span
            className="prod-icon-tile"
            style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, -22)})` }}
          >
            <Icon name={service.icon} size={34} stroke={1.6} />
          </span>
        )}
      </div>
      <div className="prod-body">
        <div className="prod-name">{service.name}</div>
      </div>
    </Link>
  );
}
