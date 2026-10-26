import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthRequired } from "@/components/auth-required";
import { Icon } from "@/components/icons";
import { ProfileAvatarCard } from "@/components/account/profile-avatar-card";
import { ProfileDetailsCard } from "@/components/account/profile-details-card";
import { NotificationsToggle } from "@/components/wallet/notifications-toggle";
import { ThemeToggle } from "@/components/wallet/theme-toggle";
import { signOut } from "@/lib/actions/account";
import { fmt } from "@/lib/data/catalog-helpers";
import { getBeneficiaries, getCurrentProfile, getMyWallet } from "@/lib/data/queries";

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

  // Staff don't have a customer-style "account" — their account IS business
  // operations. Middleware already bounces staff off this route; this stays
  // as the page-level guarantee so the rule can't silently drift.
  if (profile.role === "superadmin") redirect("/super-admin");
  if (profile.role === "admin") redirect("/admin");

  const [beneficiaries, wallet] = await Promise.all([getBeneficiaries(profile.id), getMyWallet(profile.id)]);

  return (
    <div className="px content-narrow" style={{ paddingTop: 6 }}>
      <h2 style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Account</h2>
      <ProfileAvatarCard name={profile.full_name} phone={profile.phone} email={profile.email} avatarUrl={profile.avatar_url} />

      {/* Wallet card (account mockup): live balance + the two wallet
          actions. Both link to /wallet, which owns the top-up and
          withdraw panels — no duplicated payment UI here. */}
      <div className="card card-pad mt-3">
        <div className="row between" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="muted">Wallet Balance</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4 }}>
              {fmt(wallet?.balance ?? 0)}
            </div>
          </div>
          <div className="row gap-2">
            <Link href="/wallet" className="btn btn-primary tap" style={{ height: 38, padding: "0 14px", fontSize: 12.5, textDecoration: "none", gap: 5 }}>
              <Icon name="plus" size={13} stroke={2.2} /> Top Up
            </Link>
            <Link href="/wallet" className="btn btn-secondary tap" style={{ height: 38, padding: "0 14px", fontSize: 12.5, textDecoration: "none", gap: 5 }}>
              <Icon name="arrowDnL" size={13} stroke={2.2} /> Withdraw
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions (mockup): pastel tiles deep-linking to the real
          sections further down this page — no new routes. */}
      <div className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2 }}>
        Quick Actions
      </div>
      <div className="acct-qa-grid">
        {[
          { href: "#profile", icon: "user", label: "Personal Info", bg: "#d1fae5", fg: "#047857" },
          { href: "/wallet", icon: "wallet", label: "Wallet", bg: "#dbeafe", fg: "#1d4ed8" },
          { href: "#appearance", icon: "sun", label: "Appearance", bg: "#fef3c7", fg: "#b45309" },
          { href: "#notifications", icon: "bell", label: "Notifications", bg: "#fce7f3", fg: "#be185d" },
        ].map((a) => (
          <Link key={a.label} href={a.href} className="acct-qa tap" style={{ background: a.bg }}>
            <span style={{ color: a.fg, display: "inline-flex" }}>
              <Icon name={a.icon} size={19} stroke={1.9} />
            </span>
            <span className="acct-qa-label">{a.label}</span>
          </Link>
        ))}
      </div>

      <div id="profile" className="mt-3" style={{ scrollMarginTop: 80 }}>
        <ProfileDetailsCard name={profile.full_name} phone={profile.phone} email={profile.email} />
      </div>

      <div className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2 }}>
        Preferences
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row gap-2" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "var(--badge-neutral-bg)", color: "var(--text-soft)" }}>
            <Icon name="users" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em" }}>Saved Beneficiaries</div>
            <div className="muted">{beneficiaries.length} saved</div>
          </div>
          <Icon name="chevronR" size={17} stroke={2} />
        </div>
        <div id="notifications" className="row gap-2" style={{ padding: "14px 16px", scrollMarginTop: 80 }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "var(--badge-neutral-bg)", color: "var(--text-soft)" }}>
            <Icon name="bell" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em" }}>Notifications</div>
          </div>
          <NotificationsToggle initial={profile.notifications_enabled} />
        </div>
      </div>

      <div id="appearance" className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2, scrollMarginTop: 80 }}>
        Appearance
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row gap-2" style={{ padding: "14px 16px" }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "var(--badge-neutral-bg)", color: "var(--text-soft)" }}>
            <Icon name="sun" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em" }}>Dark Mode</div>
            <div className="muted">Off follows your device automatically until you choose</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="eyebrow mt-3 mb-1" style={{ paddingLeft: 2 }}>
        Account
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {[
          { icon: "shield", label: "Security" },
          { icon: "headset", label: "Support" },
          { icon: "gift", label: "Referral Program", sub: "Earn $2 per friend" },
        ].map((row, i, arr) => (
          <div
            key={row.label}
            className="row gap-2"
            style={{ padding: "14px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
          >
            <div className="ibadge round" style={{ width: 38, height: 38, background: "var(--badge-neutral-bg)", color: "var(--text-soft)" }}>
              <Icon name={row.icon} size={17} stroke={1.8} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em" }}>{row.label}</div>
              {row.sub && <div className="muted">{row.sub}</div>}
            </div>
            <Icon name="chevronR" size={17} stroke={2} />
          </div>
        ))}
      </div>

      <form
        action={async () => {
          "use server";
          await signOut();
          redirect("/login");
        }}
      >
        <button className="btn btn-secondary btn-block mt-3" style={{ color: "var(--error)", borderColor: "var(--error-border-soft)" }} type="submit">
          <Icon name="logout" size={17} stroke={2} /> Log out
        </button>
      </form>
      <div className="muted mt-3" style={{ textAlign: "center" }}>
        TopMe
      </div>
    </div>
  );
}
