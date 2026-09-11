import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getInsuranceQuote, purchaseInsurancePolicy } from "@/lib/actions/insurance";
import { displayName, displayDescription, displayImage, displayPremium } from "@/lib/insurance/types";
import InsurancePurchaseForm from "@/components/insurance/insurance-purchase-form";

export default async function InsuranceProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const supabase = await createClient();
  
  const { data: product, error } = await supabase
    .from("insurance_products")
    .select("*")
    .eq("id", productId)
    .eq("is_active", true)
    .single();

  if (error || !product) {
    notFound();
  }

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
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            ${premium.toFixed(2)}<span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>/mo</span>
          </div>
          {product.cover_amount != null && (
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

        <InsurancePurchaseForm product={product} />
      </div>
    </div>
  );
}
