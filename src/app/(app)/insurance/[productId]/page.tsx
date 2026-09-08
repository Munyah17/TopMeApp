import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getInsuranceQuote, purchaseInsurancePolicy } from "@/lib/actions/insurance";
import { displayName, displayDescription, displayImage } from "@/lib/insurance/types";
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
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
          {description}
        </div>
        
        <InsurancePurchaseForm product={product} />
      </div>
    </div>
  );
}
