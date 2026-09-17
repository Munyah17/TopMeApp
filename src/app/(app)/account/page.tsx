import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthRequired } from "@/components/auth-required";
import { Icon } from "@/components/icons";
import { ProfileAvatarCard } from "@/components/account/profile-avatar-card";
import { ProfileDetailsCard } from "@/components/account/profile-details-card";
import { NotificationsToggle } from "@/components/wallet/notifications-toggle";
import { ThemeToggle } from "@/components/wallet/theme-toggle";
import { signOut } from "@/lib/actions/account";
import { getBeneficiaries, getCurrentProfile } from "@/lib/data/queries";

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
  // operations. /super-admin and /admin are the real destination, not a
  // doorway bolted onto a wallet/beneficiaries page they'll never use in
  // that capacity.
  if (profile.role === "superadmin") redirect("/super-admin");
  if (profile.role === "admin") redirect("/admin");

  const beneficiaries = await getBeneficiaries(profile.id);

  return (
    <div className="px content-narrow" style={{ paddingTop: 6 }}>
      <h2 style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Account</h2>
      <ProfileAvatarCard name={profile.full_name} phone={profile.phone} email={profile.email} avatarUrl={profile.avatar_url} />

      <div className="mt-3">
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
        Wallet
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <Link href="/wallet" className="row gap-2 tap" style={{ padding: "14px 16px", textDecoration: "none" }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "var(--green-50)", color: "var(--green)" }}>
            <Icon name="wallet" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>Wallet & Top Up</div>
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
