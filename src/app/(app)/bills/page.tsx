import Link from "next/link";
import { getBillPayCatalog } from "@/lib/actions/billpay";

/**
 * BillPay storefront — every biller/product on Paynow BillPay that our
 * catalog sync has pulled in, browsable like topup.co.zw. Products that
 * also map to a curated TopMe service (ZESA, DStv…) are still payable
 * through their bespoke flows; this page is the catch-all for everything
 * else — councils, universities, medical aid, vouchers.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata = { title: "Pay a Bill — TopMe" };

export default async function BillsPage() {
  const { billers, products } = await getBillPayCatalog();

  return (
    <div className="px content-wrap" style={{ paddingTop: 16 }}>
      <h1 style={{ fontSize: 22 }}>Pay a Bill</h1>
      <div className="muted mb-3">Airtime, electricity, council bills, school fees, medical aid and more — straight to the provider.</div>

      {billers.length === 0 && (
        <div className="card card-pad mt-4" style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700 }}>The biller catalog hasn&apos;t synced yet</div>
          <div className="muted mt-1" style={{ fontSize: 13 }}>
            It populates automatically once BillPay credentials are configured and the first sync runs.
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        {billers.map((b) => {
          const count = products.filter((p) => p.biller_code === b.code).length;
          return (
            <Link
              key={b.code}
              href={`/bills/${encodeURIComponent(b.code)}`}
              className="card tap"
              style={{ padding: 16, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}
            >
              {(b.logo_url || b.icon_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logo_url ?? b.icon_url ?? ""} alt={b.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
              )}
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
              {b.description && <div className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{b.description}</div>}
              <div className="muted" style={{ fontSize: 11 }}>{count} product{count === 1 ? "" : "s"}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
