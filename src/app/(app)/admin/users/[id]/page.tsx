import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PromoteSuperadminForm } from "@/components/admin/promote-superadmin-form";
import { WalletAdjustForm } from "@/components/admin/wallet-adjust-form";
import { fmt } from "@/lib/data/catalog-helpers";
import { getCurrentProfile, getRecentTransactions, getWallet, getWalletLedger } from "@/lib/data/queries";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin", customer: "Customer" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [permissions, viewer] = await Promise.all([getMyPermissions(), getCurrentProfile()]);
  if (!permissions.includes("users.view")) {
    return <div className="muted">You don&apos;t have permission to view customer accounts.</div>;
  }

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!profile) notFound();
  const target = profile as Profile;

  const [wallet, ledger, transactions] = await Promise.all([getWallet(id), getWalletLedger(id, 15), getRecentTransactions(id, 10)]);

  return (
    <div>
      <Link href="/admin/users" className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Users
      </Link>

      <div className="card card-pad mb-3">
        <div className="row gap-2">
          <div className="ibadge round" style={{ width: 46, height: 46, background: "#F1F4F9", color: "var(--text-soft)", fontWeight: 700 }}>
            {(target.full_name || target.phone || target.email || "?").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{target.full_name || "Unnamed"}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {target.phone || "No phone"} · {target.email || "No email"}
            </div>
          </div>
          <span
            style={{
              background: target.role === "superadmin" ? "#F3EEFE" : target.role === "admin" ? "#EAF8FF" : "#F1F4F9",
              color: target.role === "superadmin" ? "#8B5CF6" : target.role === "admin" ? "var(--blue)" : "var(--text-soft)",
              fontSize: 10,
              fontWeight: 800,
              padding: "4px 9px",
              borderRadius: 7,
              height: "fit-content",
            }}
          >
            {ROLE_LABEL[target.role]}
          </span>
        </div>
        <div className="row gap-2 mt-3">
          <div className="card card-pad" style={{ flex: 1, textAlign: "center" }}>
            <div className="muted">Wallet balance</div>
            <div style={{ fontWeight: 800, fontSize: 19 }}>{fmt(wallet?.balance ?? 0)}</div>
          </div>
          <div className="card card-pad" style={{ flex: 1, textAlign: "center" }}>
            <div className="muted">Joined</div>
            <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>{new Date(target.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
          </div>
        </div>
      </div>

      {permissions.includes("wallet.adjust") && (
        <div className="mb-3">
          <WalletAdjustForm userId={id} />
        </div>
      )}

      {viewer?.role === "superadmin" && target.role === "admin" && (
        <div className="mb-3">
          <PromoteSuperadminForm userId={id} email={target.email ?? ""} />
        </div>
      )}

      <div className="section-title mt-2 mb-2">Recent transactions</div>
      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        {transactions.length === 0 ? (
          <div className="card-pad muted">No transactions.</div>
        ) : (
          transactions.map((t, i) => (
            <Link
              key={t.id}
              href={`/admin/transactions/${t.id}`}
              className="row between tap"
              style={{ padding: "12px 16px", borderBottom: i < transactions.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none" }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.reference}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{t.service_id}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(t.amount + t.fee)}</div>
            </Link>
          ))
        )}
      </div>

      <div className="section-title mb-2">Wallet ledger</div>
      <div className="card" style={{ overflow: "hidden" }}>
        {ledger.length === 0 ? (
          <div className="card-pad muted">No ledger activity.</div>
        ) : (
          ledger.map((l, i) => (
            <div key={l.id} className="row between" style={{ padding: "12px 16px", borderBottom: i < ledger.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.type}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{new Date(l.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: l.amount >= 0 ? "var(--success)" : "var(--text)" }}>{fmt(l.amount)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
