import Link from "next/link";
import { Icon } from "@/components/icons";
import { TopupPanel } from "@/components/wallet/topup-panel";
import { fmt } from "@/lib/data/catalog-helpers";
import { getCurrentProfile, getWallet, getWalletLedger } from "@/lib/data/queries";

const LEDGER_LABEL: Record<string, string> = {
  topup: "Wallet top up",
  debit: "Payment",
  refund: "Refund",
  gift_send: "Gift voucher sent",
  gift_redeem: "Gift voucher redeemed",
};

export default async function WalletPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const [wallet, ledger] = await Promise.all([getWallet(profile.id), getWalletLedger(profile.id, 10)]);

  return (
    <div className="px content-wrap" style={{ paddingTop: 6 }}>
      <h2 style={{ fontSize: 20 }}>Wallet</h2>
      <div className="muted mb-3">Top up once, pay for anything instantly</div>

      <div className="wallet-grid">
        <div className="col-main">
          <div className="card card-pad" style={{ background: "linear-gradient(135deg, var(--navy), #16324f)", border: "none" }}>
            <div className="muted" style={{ color: "rgba(255,255,255,0.55)" }}>
              Available balance
            </div>
            <div style={{ color: "#fff", fontSize: 32, fontWeight: 800, marginTop: 4 }}>{fmt(wallet?.balance ?? 0)}</div>
            <Link href="/pay/gift" className="btn wallet-action-btn mt-3" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", textDecoration: "none", display: "inline-flex" }}>
              <Icon name="gift" size={15} stroke={2.4} /> <span>Send a Gift</span>
            </Link>
          </div>

          <div className="row between mt-3 mb-2">
            <span className="section-title">Top up</span>
          </div>
          <div className="card card-pad">
            <TopupPanel userPhone={profile.phone} />
          </div>
        </div>

        <div className="col-side">
          <div className="row between mb-2">
            <span className="section-title">Wallet activity</span>
          </div>
          {ledger.length === 0 ? (
            <div className="card card-pad muted">No wallet activity yet.</div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              {ledger.map((l, i) => (
                <div
                  key={l.id}
                  className="row gap-2"
                  style={{ padding: "14px 16px", borderBottom: i < ledger.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <div
                    className="ibadge round"
                    style={{
                      width: 38,
                      height: 38,
                      background: l.amount >= 0 ? "var(--green-50)" : "#FEF6E7",
                      color: l.amount >= 0 ? "var(--success)" : "var(--warning)",
                    }}
                  >
                    <Icon name={l.amount >= 0 ? "arrowDnL" : "arrowUpR"} size={17} stroke={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{LEDGER_LABEL[l.type] ?? l.type}</div>
                    <div className="muted">{new Date(l.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: l.amount >= 0 ? "var(--success)" : "var(--text)" }}>
                    {l.amount >= 0 ? "+" : "-"}
                    {fmt(l.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
