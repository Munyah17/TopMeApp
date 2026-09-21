import Link from "next/link";
import { NotificationsToggle } from "@/components/wallet/notifications-toggle";
import { getCurrentProfile } from "@/lib/data/queries";

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin", customer: "Customer" };

export default async function AdminProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>My Profile</h2>
      <div className="muted mb-3">Your own account, as seen by the command center.</div>

      <div className="card card-pad mb-3">
        <div style={{ fontWeight: 700, fontSize: 15 }}>{profile.full_name || "Unnamed"}</div>
        <div className="muted mt-1">{profile.phone || "No phone"} · {profile.email || "No email"}</div>
        <span
          style={{
            display: "inline-block",
            marginTop: 8,
            background: profile.role === "superadmin" ? "var(--adm-purple-bg)" : "var(--blue-50)",
            color: profile.role === "superadmin" ? "var(--adm-purple)" : "var(--blue)",
            fontSize: 10,
            fontWeight: 800,
            padding: "4px 9px",
            borderRadius: 7,
            textTransform: "uppercase",
          }}
        >
          {ROLE_LABEL[profile.role]}
        </span>
      </div>

      <div className="card card-pad row between" style={{ alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Notifications</div>
          <div className="muted" style={{ fontSize: 12 }}>Payment and account emails</div>
        </div>
        <NotificationsToggle initial={profile.notifications_enabled} />
      </div>

      <div className="muted mt-3" style={{ fontSize: 12 }}>
        Name, phone, and password are managed from your{" "}
        <Link href="/account" style={{ color: "var(--green)", fontWeight: 700 }}>
          regular Account page
        </Link>
        .
      </div>
    </div>
  );
}
