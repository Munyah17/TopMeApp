import { notFound } from "next/navigation";
import Link from "next/link";
import { BillPayFlow } from "@/components/payment-flow/billpay-flow";
import { AuthRequired } from "@/components/auth-required";
import { getBillPayCatalog } from "@/lib/actions/billpay";
import { getCurrentProfile, getMyWallet } from "@/lib/data/queries";
import { Icon } from "@/components/icons";

/**
 * One biller's products → pick a product → generic BillPay checkout flow.
 * ?product=<code> deep-links straight into the flow (used by biller tiles
 * and future home-page shortcuts).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function BillerPage({
  params,
  searchParams,
}: {
  params: Promise<{ billerCode: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const { billerCode } = await params;
  const { product: wanted } = await searchParams;
  const [{ billers, products }, profile] = await Promise.all([getBillPayCatalog(), getCurrentProfile()]);

  const biller = billers.find((b) => b.code === billerCode);
  if (!biller) notFound();
  const billerProducts = products.filter((p) => p.biller_code === billerCode);
  const selected = wanted ? billerProducts.find((p) => p.code === wanted) : undefined;

  if (!profile) {
    return (
      <div className="px content-wrap" style={{ paddingTop: 40 }}>
        <AuthRequired title={`Log in to pay ${biller.name}`} message="Bill payments are made from your TopMe wallet, so you'll need an account first." />
      </div>
    );
  }
  const wallet = await getMyWallet(profile.id);

  if (selected) {
    return <BillPayFlow biller={biller} product={selected} walletBalance={wallet?.balance ?? 0} />;
  }

  return (
    <div className="px content-wrap" style={{ paddingTop: 16 }}>
      <Link href="/bills" className="muted" style={{ textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="chevronL" size={14} /> All billers
      </Link>
      <div className="row gap-2" style={{ alignItems: "center", marginTop: 10 }}>
        {(biller.logo_url || biller.icon_url) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={biller.logo_url ?? biller.icon_url ?? ""} alt={biller.name} style={{ width: 40, height: 40, objectFit: "contain" }} />
        )}
        <div>
          <h1 style={{ fontSize: 20 }}>{biller.name}</h1>
          {biller.description && <div className="muted" style={{ fontSize: 13 }}>{biller.description}</div>}
        </div>
      </div>

      <div className="mt-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {billerProducts.map((p) => (
          <Link
            key={p.code}
            href={`/bills/${encodeURIComponent(biller.code)}?product=${encodeURIComponent(p.code)}`}
            className="card card-pad tap row gap-2"
            style={{ textDecoration: "none", alignItems: "center" }}
          >
            {(p.logo_url || p.icon_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logo_url ?? p.icon_url ?? ""} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
              {p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}
            </div>
            <div style={{ fontWeight: 700 }}>
              {p.price != null ? `$${p.price}` : p.auth_amount_mandated != null ? "Balance" : ""}
            </div>
            <Icon name="chevronR" size={16} />
          </Link>
        ))}
        {billerProducts.length === 0 && (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>No products available from this biller right now.</div>
        )}
      </div>
    </div>
  );
}
