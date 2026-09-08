import Link from "next/link";
import { Icon } from "@/components/icons";
import { getInsuranceProducts } from "@/lib/actions/insurance";
import { displayName, displayDescription, displayImage } from "@/lib/insurance/types";

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
          Protect what matters most with our comprehensive insurance policies powered by TariqifyIMS.
        </div>

        {products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 15, color: "var(--muted)" }}>
              No insurance products available at the moment. Please check back later.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {products.map((product) => {
              const name = displayName(product);
              const description = displayDescription(product);
              const image = displayImage(product);

              return (
                <Link
                  key={product.id}
                  href={`/insurance/${product.id}`}
                  style={{
                    textDecoration: "none",
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      background: "var(--card-bg)",
                      borderRadius: 16,
                      padding: 16,
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={name}
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: 12,
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: 12,
                          background: "var(--accent-bg)",
                          color: "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="shield" size={28} stroke={1.5} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{name}</div>
                      <div className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                        {description}
                      </div>
                      {product.category && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: "var(--accent)",
                            fontWeight: 500,
                          }}
                        >
                          {product.category}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, paddingTop: 4, color: "var(--muted)" }}>
                      <Icon name="chevronR" size={18} stroke={2} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
