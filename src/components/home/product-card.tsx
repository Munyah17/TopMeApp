import Link from "next/link";
import { Icon } from "@/components/icons";
import { providerInitials, shade } from "@/lib/data/catalog-helpers";
import type { Service } from "@/types/database";

export function ProductCard({
  service,
  categoryColor,
  priceLabel,
}: {
  service: Service;
  categoryColor: string;
  priceLabel?: string;
}) {
  const provider = service.provider_label || "TopMe";
  const initials = providerInitials(provider);
  const color = service.color || categoryColor;
  return (
    <Link href={`/pay/${service.id}`} className="tap prod-card">
      <div
        className="prod-media"
        style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, -22)})` }}
      >
        <span className="prod-logo">{initials}</span>
        <span className="prod-cat-icon">
          <Icon name={service.icon} size={13} stroke={2} />
        </span>
      </div>
      <div className="prod-body">
        <div className="prod-provider">{provider}</div>
        <div className="prod-name">{service.name}</div>
        {priceLabel && <div className="prod-price">{priceLabel}</div>}
      </div>
    </Link>
  );
}
