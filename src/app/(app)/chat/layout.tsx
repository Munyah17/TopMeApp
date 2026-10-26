import Link from "next/link";
import { Icon } from "@/components/icons";
import { ChatShell } from "@/components/chat/chat-shell";
import { PushSubscribeButton } from "@/components/push/push-subscribe-button";
import { getConversations } from "@/lib/data/chat-queries";
import { getCurrentProfile } from "@/lib/data/queries";

function initials(name: string | null, phone: string | null) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "TM";
  }
  return (phone ?? "TM").slice(-2);
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// The conversation list lives in this layout, not in page.tsx — a layout
// stays mounted across sibling navigations under the same segment (here,
// every /chat/* route), which is exactly what a WhatsApp-style
// master-detail list needs: it doesn't remount or re-fetch every time the
// customer opens a different thread, it just sits there as the left pane
// on a wide screen (see .chat-shell in globals.css for the responsive
// split; on a narrow screen it's shown instead of the thread, not next to
// it).
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    // No split-pane chrome for a logged-out visitor — page.tsx (or
    // /chat/[id], /new) already renders its own AuthRequired prompt full
    // width, and there's no list to show anyway.
    return <>{children}</>;
  }

  const conversations = await getConversations(profile.id);

  const listPanel = (
    <div className="px content-wrap" style={{ paddingTop: 6 }}>
      {/* Green header card (chat mockup): title + subtitle + the new-chat
          action, same gradient treatment as the wallet/account cards. */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--green-800) 0%, var(--green-950) 100%)",
          borderRadius: 16,
          padding: "18px 18px 16px",
          position: "relative",
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div style={{ position: "absolute", right: -40, top: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(167,243,208,0.10)", pointerEvents: "none" }} />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10, position: "relative" }}>
          <div>
            <h2 style={{ fontSize: 22, color: "#fff", letterSpacing: "-0.02em", fontWeight: 800 }}>Chat & Pay</h2>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, marginTop: 4, maxWidth: 300, lineHeight: 1.45 }}>
              Send money, pay bills and more right from your chats.
            </div>
          </div>
          <Link
            href="/chat/new"
            className="btn tap"
            style={{ height: 34, padding: "0 12px", fontSize: 12, flexShrink: 0, background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", textDecoration: "none", gap: 5 }}
          >
            <Icon name="plus" size={13} stroke={2.4} /> New
          </Link>
        </div>
      </div>

      {/* Quick actions (mockup) — every tile is a real existing route. */}
      <div className="acct-qa-grid" style={{ marginBottom: 4 }}>
        {[
          { href: "/pay/send", icon: "send", label: "Send Money", bg: "#d1fae5", fg: "#047857" },
          { href: "/bills", icon: "building", label: "Pay Bill", bg: "#dbeafe", fg: "#1d4ed8" },
          { href: "/services/airtimedata", icon: "smartphone", label: "Buy Airtime", bg: "#fef3c7", fg: "#b45309" },
          { href: "/pay/gift", icon: "gift", label: "Gift Voucher", bg: "#fce7f3", fg: "#be185d" },
        ].map((a) => (
          <Link key={a.label} href={a.href} className="acct-qa tap" style={{ background: a.bg }}>
            <span style={{ color: a.fg, display: "inline-flex" }}>
              <Icon name={a.icon} size={19} stroke={1.9} />
            </span>
            <span className="acct-qa-label">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent Contacts (mockup): avatar shortcuts into the real recent
          threads, plus a New tile for starting a conversation. */}
      {conversations.length > 0 && (
        <>
          <div className="eyebrow mt-3 mb-2" style={{ paddingLeft: 2 }}>
            Recent Contacts
          </div>
          <div className="scroll-x" style={{ display: "flex", gap: 14, paddingBottom: 4 }}>
            <Link href="/chat/new" className="chat-contact tap">
              <span className="chat-contact-av" style={{ background: "var(--badge-neutral-bg)", color: "var(--text-tertiary)", border: "1.5px dashed var(--border)" }}>
                <Icon name="plus" size={17} stroke={2.2} />
              </span>
              <span className="chat-contact-name">New</span>
            </Link>
            {conversations.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/chat/${c.id}`} className="chat-contact tap">
                <span className="chat-contact-av" style={{ background: "var(--navy)", color: "#fff", position: "relative" }}>
                  {initials(c.counterpart?.full_name ?? null, c.counterpart?.phone ?? null)}
                  {c.unread && (
                    <span
                      style={{
                        position: "absolute",
                        right: 0,
                        bottom: 2,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "var(--green)",
                        border: "2px solid var(--surface)",
                      }}
                    />
                  )}
                </span>
                <span className="chat-contact-name">
                  {(c.counterpart?.full_name || c.counterpart?.phone || "User").trim().split(/\s+/)[0]}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <PushSubscribeButton />

      <div className="eyebrow mt-3 mb-2" style={{ paddingLeft: 2 }}>
        Chats
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <Link
          href="/chat/topme"
          className="row gap-2 tap chat-pinned-row"
          style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", textDecoration: "none" }}
        >
          <div className="ibadge round" style={{ background: "var(--green)", color: "var(--text-inverse)" }}>
            <Icon name="zap" size={18} stroke={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row gap-1" style={{ alignItems: "center" }}>
              <span style={{ fontWeight: 800, fontSize: 13.5, color: "var(--text)" }}>TopMe</span>
              <Icon name="check" size={13} stroke={3} className="text-faint" />
            </div>
            <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Top up, pay bills, check your balance — right here
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--green-600)", textTransform: "uppercase" }}>Official</span>
        </Link>

        {conversations.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div className="muted">
              Start a conversation with any TopMe user by their phone number.
            </div>
          </div>
        ) : (
          conversations.map((c, i) => (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className="row gap-2 tap"
              style={{
                padding: "12px 14px",
                borderBottom: i < conversations.length - 1 ? "1px solid var(--border)" : "none",
                textDecoration: "none",
              }}
            >
              <div className="ibadge round" style={{ background: "var(--navy)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                {initials(c.counterpart?.full_name ?? null, c.counterpart?.phone ?? null)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: c.unread ? 800 : 700, fontSize: 13.5, color: "var(--text)" }}>
                  {c.counterpart?.full_name || c.counterpart?.phone || "TopMe user"}
                </div>
                <div className="muted" style={{ fontWeight: c.unread ? 700 : 400, color: c.unread ? "var(--text)" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.last_message || "Say hello"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <span className="muted" style={{ fontSize: 11 }}>
                  {relativeTime(c.last_message_at)}
                </span>
                {c.unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );

  return <ChatShell listPanel={listPanel}>{children}</ChatShell>;
}
