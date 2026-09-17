import Link from "next/link";
import { Icon } from "@/components/icons";
import { getInsuranceProducts } from "@/lib/actions/insurance";
import { InsuranceCard } from "@/components/insurance/insurance-card";

export default async function InsurancePage() {
  const products = await getInsuranceProducts();

  return (
    <div>
      <div className="topbar">
        <Link href="/services" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>Insurance</div>
      </div>
      <div className="px content-wrap">
        <div className="muted mb-3" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Protect what matters most — medical, funeral, legal, travel and vehicle cover, all from your wallet.
        </div>

        {products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 15, color: "var(--muted)" }}>
              No insurance products available at the moment. Please check back later.
            </div>
          </div>
        ) : (
          <div className="catpage-grid">
            {products.map((product) => (
              <InsuranceCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
