import Link from "next/link";
import { Icon } from "@/components/icons";
import { CustomersClient } from "@/components/admin/customers-client";
import { getAllProfiles, getCurrentProfile } from "@/lib/data/queries";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [profile, params] = await Promise.all([getCurrentProfile(), searchParams]);
  if (!profile) return null;

  if (profile.role === "customer") {
    return (
      <div>
        <div className="topbar">
          <Link href="/account" className="backbtn tap" style={{ textDecoration: "none" }}>
            <Icon name="chevronL" size={18} stroke={2.2} />
          </Link>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Customer Accounts</div>
        </div>
        <div className="px content-wrap">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
            <div style={{ width: 74, height: 74, borderRadius: 22, background: "#F1F4F9", color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="lock" size={32} stroke={1.6} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>Access restricted</div>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>
              This area is for TopMe staff accounts only.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const customers = await getAllProfiles(params.q);

  return (
    <div>
      <div className="topbar">
        <Link href="/admin" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Customer Accounts</div>
        </div>
      </div>
      <div className="px content-wrap">
        <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
          Search any customer by name, phone, or email. Suspending an account blocks sign-in
          immediately and can be reversed anytime. Super Admin accounts can&apos;t be suspended here.
        </div>

        <form method="get" className="row gap-2 mb-3">
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              border: "1.5px solid var(--border)",
              borderRadius: 14,
              padding: "11px 14px",
            }}
          >
            <Icon name="search" size={16} stroke={2} />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search by name, phone, or email"
              style={{ border: "none", outline: "none", fontFamily: "inherit", fontWeight: 600, fontSize: 13.5, flex: 1, background: "transparent" }}
            />
          </div>
          <button type="submit" className="backbtn tap" style={{ width: 44, height: 44 }}>
            <Icon name="search" size={17} stroke={2} />
          </button>
        </form>

        <CustomersClient customers={customers} />
      </div>
    </div>
  );
}
