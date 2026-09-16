import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getInsuranceQuote, purchaseInsurancePolicy } from "@/lib/actions/insurance";
import { displayName, displayDescription, displayImage, displayPremium, enrichInsuranceProduct } from "@/lib/insurance/types";
import InsurancePurchaseForm from "@/components/insurance/insurance-purchase-form";

export default async function InsuranceProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("insurance_products")
    .select("*")
    .eq("id", productId)
    .eq("is_active", true)
    .single();

  if (error || !row) {
    notFound();
  }

  // Enrich from `raw` so premium/cover/features resolve even when the
  // dedicated columns aren't populated yet.
  const product = enrichInsuranceProduct(row as Record<string, unknown>);

  const name = displayName(product);
  const description = displayDescription(product);
  const image = displayImage(product);
  const premium = displayPremium(product);
  const features = Array.isArray(product.features) ? (product.features as string[]) : [];

  return (
    <div>
      <div className="topbar">
        <Link href="/insurance" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>{name}</div>
      </div>
      <div className="px content-wrap">
        {image && (
          <img
            src={image}
            alt={name}
            style={{
              width: "100%",
              height: 200,
              objectFit: "cover",
              borderRadius: 16,
              marginBottom: 16,
            }}
          />
        )}
        <div className="row between" style={{ marginBottom: 12 }}>
          {product.is_purchasable ? (
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              ${premium.toFixed(2)}<span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>/mo</span>
            </div>
          ) : (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--warning)",
                background: "#FEF6E7",
                padding: "5px 10px",
                borderRadius: 7,
              }}
            >
              Coming soon
            </span>
          )}
          {product.is_purchasable && product.cover_amount != null && (
            <div style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 11 }}>Cover amount</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>${product.cover_amount.toFixed(0)}</div>
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: features.length ? 12 : 20 }}>
          {description}
        </div>
        {features.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {features.map((f) => (
              <div key={f} className="row gap-2" style={{ fontSize: 13 }}>
                <span style={{ color: "var(--accent)", flexShrink: 0, display: "flex" }}>
                  <Icon name="check" size={15} stroke={2.2} />
                </span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}

        {product.is_purchasable ? (
          <InsurancePurchaseForm product={product} />
        ) : (
          <div
            className="row gap-2"
            style={{ background: "var(--card-bg)", borderRadius: 14, padding: 16, alignItems: "flex-start" }}
          >
            <div className="ibadge round" style={{ width: 34, height: 34, background: "#FEF6E7", color: "var(--warning)", flexShrink: 0 }}>
              <Icon name="clock" size={17} stroke={2} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>Not available to buy yet</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                We&apos;re finalising this with our underwriting partner. You&apos;ll be able to buy it, and get your
                disc delivered, straight from this screen once it&apos;s ready.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
