import Link from "next/link";
import { Icon } from "@/components/icons";
import { ChatShell } from "@/components/chat/chat-shell";
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
      <div className="row between">
        <h2 style={{ fontSize: 20 }}>Chat & Pay</h2>
        <Link href="/chat/new" className="btn btn-primary" style={{ height: 38, padding: "0 14px", fontSize: 13 }}>
          <Icon name="plus" size={15} stroke={2.4} /> New chat
        </Link>
      </div>
      <div className="muted mb-3">Talk and pay — send money or a red packet right in the conversation</div>

      <div className="card" style={{ overflow: "hidden" }}>
        <Link
          href="/chat/topme"
          className="row gap-2 tap chat-pinned-row"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textDecoration: "none" }}
        >
          <div className="ibadge round" style={{ background: "var(--green)", color: "#fff" }}>
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
                padding: "14px 16px",
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
