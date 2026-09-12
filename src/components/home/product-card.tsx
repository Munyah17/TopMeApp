import Link from "next/link";
import { Icon } from "@/components/icons";
import type { Service } from "@/types/database";

export function ProductCard({ service, categoryColor }: { service: Service; categoryColor: string }) {
  const color = service.color || categoryColor;
  return (
    <Link href={`/pay/${service.id}`} className="tap prod-card">
      <div className="prod-media">
        {service.logo_url ? (
          // Tried next/image here (every logo_url is our own Supabase
          // Storage upload, not an arbitrary external host, so it's
          // eligible) but reverted it: Next's image optimizer does its own
          // server-side fetch of the source with a hard ~7s timeout, and a
          // slow/cold connection to Storage — confirmed happening, at least
          // from this environment — turns into a BROKEN image instead of a
          // slow one, which a plain <img> tag doesn't risk. Not a trade to
          // make blind on a product catalog. loading="lazy" still gets the
          // real, zero-risk part of the win (native browser lazy-loading,
          // no server-side fetch or timeout involved).
          // eslint-disable-next-line @next/next/no-img-element -- see above; next/image reverted for a real timeout/reliability risk, not stale caution
          <img src={service.logo_url} alt={service.name} loading="lazy" decoding="async" />
        ) : (
          <span
            className="prod-icon-tile"
            style={{ background: color }}
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
