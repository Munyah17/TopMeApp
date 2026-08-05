import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthRequired } from "@/components/auth-required";
import { Icon } from "@/components/icons";
import { NotificationsToggle } from "@/components/wallet/notifications-toggle";
import { signOut } from "@/lib/actions/account";
import { getBeneficiaries, getCurrentProfile } from "@/lib/data/queries";

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin", customer: "Customer" };

function initials(name: string | null) {
  if (!name) return "TM";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return (
      <div className="px content-narrow" style={{ paddingTop: 6 }}>
        <h2 style={{ fontSize: 20 }}>Account</h2>
        <AuthRequired
          title="Log in to view your account"
          message="Manage your profile, wallet, beneficiaries, and settings once you're signed in."
        />
      </div>
    );
  }
  const beneficiaries = await getBeneficiaries(profile.id);

  const roleColor = profile.role === "superadmin" ? "#8B5CF6" : profile.role === "admin" ? "#38BDF8" : "var(--green)";
  const roleBg = profile.role === "superadmin" ? "#F3EEFE" : profile.role === "admin" ? "#EAF8FF" : "var(--green-50)";

  return (
    <div className="px content-narrow" style={{ paddingTop: 6 }}>
      <h2 style={{ fontSize: 20 }}>Account</h2>
      <div className="card card-pad row gap-2 mt-3">
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: "var(--navy)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          {initials(profile.full_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-1" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>{profile.full_name || "Your name"}</div>
            <span
              style={{
                background: roleBg,
                color: roleColor,
                fontSize: 9.5,
                fontWeight: 800,
                padding: "3px 7px",
                borderRadius: 7,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
              }}
            >
              {ROLE_LABEL[profile.role]}
            </span>
          </div>
          <div className="muted">{profile.phone || profile.email}</div>
        </div>
      </div>

      <div className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2 }}>
        Preferences
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row gap-2" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)" }}>
            <Icon name="users" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Saved Beneficiaries</div>
            <div className="muted">{beneficiaries.length} saved</div>
          </div>
          <Icon name="chevronR" size={17} stroke={2} />
        </div>
        <div className="row gap-2" style={{ padding: "14px 16px" }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)" }}>
            <Icon name="bell" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Notifications</div>
          </div>
          <NotificationsToggle initial={profile.notifications_enabled} />
        </div>
      </div>

      <div className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2 }}>
        Wallet
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <Link href="/wallet" className="row gap-2 tap" style={{ padding: "14px 16px", textDecoration: "none" }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "var(--green-50)", color: "var(--green)" }}>
            <Icon name="wallet" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>Wallet & Top Up</div>
            <div className="muted">Balance, top up, send money</div>
          </div>
          <Icon name="chevronR" size={17} stroke={2} />
        </Link>
      </div>

      <div className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2 }}>
        Account
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {[
          { icon: "shield", label: "Security" },
          { icon: "headset", label: "Support" },
          { icon: "settings", label: "Settings" },
          { icon: "gift", label: "Referral Program", sub: "Earn $2 per friend" },
        ].map((row, i, arr) => (
          <div
            key={row.label}
            className="row gap-2"
            style={{ padding: "14px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
          >
            <div className="ibadge round" style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)" }}>
              <Icon name={row.icon} size={17} stroke={1.8} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{row.label}</div>
              {row.sub && <div className="muted">{row.sub}</div>}
            </div>
            <Icon name="chevronR" size={17} stroke={2} />
          </div>
        ))}
      </div>

      {profile.role !== "customer" && (
        <>
          <div className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2 }}>
            Business
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            <Link href="/admin" className="row gap-2 tap" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textDecoration: "none" }}>
              <div className="ibadge round" style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)" }}>
                <Icon name="grid" size={17} stroke={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>Admin Dashboard</div>
                <div className="muted">Operator view</div>
              </div>
              <Icon name="chevronR" size={17} stroke={2} />
            </Link>
            {profile.role === "superadmin" && (
              <>
                <Link href="/admin/apis" className="row gap-2 tap" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textDecoration: "none" }}>
                  <div className="ibadge round" style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)" }}>
                    <Icon name="plug" size={17} stroke={1.8} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>APIs Management</div>
                    <div className="muted">Manage integrations</div>
                  </div>
                  <Icon name="chevronR" size={17} stroke={2} />
                </Link>
                <Link href="/admin/staff" className="row gap-2 tap" style={{ padding: "14px 16px", textDecoration: "none" }}>
                  <div className="ibadge round" style={{ width: 38, height: 38, background: "#F1F4F9", color: "var(--text-soft)" }}>
                    <Icon name="users" size={17} stroke={1.8} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>Team & Roles</div>
                    <div className="muted">Staff & permissions</div>
                  </div>
                  <Icon name="chevronR" size={17} stroke={2} />
                </Link>
              </>
            )}
          </div>
        </>
      )}

      <form
        action={async () => {
          "use server";
          await signOut();
          redirect("/login");
        }}
      >
        <button className="btn btn-secondary btn-block mt-3" style={{ color: "var(--error)", borderColor: "#FBD5D5" }} type="submit">
          <Icon name="logout" size={17} stroke={2} /> Log out
        </button>
      </form>
      <div className="muted mt-3" style={{ textAlign: "center" }}>
        TopMe
      </div>
    </div>
  );
}
