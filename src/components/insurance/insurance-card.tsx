import Link from "next/link";
import { Icon } from "@/components/icons";
import { displayName, displayImage, type InsuranceProduct } from "@/lib/insurance/types";

/**
 * Insurance product tile — same .prod-card/.prod-media/.prod-body shape the
 * service catalog uses (Airtime & Data etc.), so the Insurance row reads as
 * a peer of every other category instead of a bespoke list. The artwork is
 * the back-office featured image (display_image_url override, else the
 * underwriter's own image_url); the price shown is TariqifyIMS's ORIGINAL
 * premium — TopMe's markup is surfaced separately as a "Processing fee" at
 * checkout, never baked into the sticker price here.
 */
export function InsuranceCard({ product, categoryColor }: { product: InsuranceProduct; categoryColor?: string }) {
  const name = displayName(product);
  const image = displayImage(product);
  const color = categoryColor || "var(--accent)";

  return (
    <Link href={`/insurance/${product.id}`} className="tap prod-card">
      <div className="prod-media">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- provider/admin-hosted product image; plain <img> avoids the optimizer's server-side fetch timeout (see product-card.tsx)
          <img src={image} alt={name} loading="lazy" decoding="async" />
        ) : (
          <span className="prod-icon-tile" style={{ color }}>
            <Icon name="shield" size={34} stroke={1.6} />
          </span>
        )}
      </div>
      <div className="prod-body">
        <div className="prod-name">{name}</div>
        <div style={{ marginTop: 6 }}>
          {product.is_purchasable ? (
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              ${product.premium.toFixed(2)}
              <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>/mo</span>
            </span>
          ) : (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--warning)",
              }}
            >
              Coming soon
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
