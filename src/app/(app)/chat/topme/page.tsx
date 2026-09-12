import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { getCurrentProfile, getMyWallet } from "@/lib/data/queries";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const QUICK_ACTIONS = [
  { href: "/wallet", icon: "wallet", label: "Top up my wallet" },
  { href: "/pay/airtime", icon: "phone", label: "Buy airtime" },
  { href: "/pay/zesa", icon: "zap", label: "Buy a ZESA token" },
  { href: "/pay/send", icon: "arrowUpR", label: "Send money" },
  { href: "/history", icon: "clock", label: "View my transactions" },
  { href: "/account", icon: "user", label: "My account" },
];

// The one chat that's always first, never a real conversations row, and
// can't be started, muted or deleted — reserved at the fixed route
// /chat/topme rather than a [conversationId], specifically so it can
// never collide with (or be mistaken for) a real UUID conversation.
// "Perform TopMe functions from chat" is built here as real shortcuts
// into the app's own existing flows, not a text-command parser — every
// action below is the same feature reached the normal way, just one tap
// closer.
export default async function TopMeAssistantPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const wallet = await getMyWallet(profile.id);
  const firstName = profile.full_name?.trim().split(/\s+/)[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="chat-header">
        <Link href="/chat" className="backbtn tap chat-header-back" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div className="ibadge round" style={{ width: 36, height: 36, background: "rgba(255,255,255,0.18)", color: "#fff" }}>
          <Icon name="zap" size={18} stroke={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>TopMe</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Official · always here</div>
        </div>
      </div>

      <div className="chat-wallpaper px content-narrow" style={{ flex: 1, paddingTop: 16, paddingBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
          <div
            className="chat-bubble"
            style={{
              maxWidth: 320,
              borderRadius: "16px 16px 16px 4px",
              padding: "14px 16px",
              fontSize: 14,
              lineHeight: 1.5,
              boxShadow: "0 1px 2px rgba(15,23,42,0.1)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          >
            {firstName ? `Hi ${firstName} 👋` : "Hi 👋"}
            <br />
            Your wallet balance is <strong>{fmt(wallet?.balance ?? 0)}</strong>. What would you like to do?
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="card card-pad tap row gap-2"
              style={{ textDecoration: "none" }}
            >
              <div className="ibadge round" style={{ width: 32, height: 32, background: "var(--green-50)", color: "var(--green-600)", flexShrink: 0 }}>
                <Icon name={a.icon} size={15} stroke={2} />
              </div>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{a.label}</span>
              <Icon name="chevronR" size={16} stroke={2} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
