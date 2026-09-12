import Link from "next/link";
import { AuthRequired } from "@/components/auth-required";
import { Icon } from "@/components/icons";
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

export default async function ChatInboxPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return (
      <div className="px content-wrap" style={{ paddingTop: 6 }}>
        <h2 style={{ fontSize: 20 }}>Chat & Pay</h2>
        <AuthRequired title="Log in to chat" message="Message friends and family, and send money or a red packet right in the conversation." />
      </div>
    );
  }

  const conversations = await getConversations(profile.id);

  return (
    <div className="px content-wrap" style={{ paddingTop: 6 }}>
      <div className="row between">
        <h2 style={{ fontSize: 20 }}>Chat & Pay</h2>
        <Link href="/chat/new" className="btn btn-primary" style={{ height: 38, padding: "0 14px", fontSize: 13 }}>
          <Icon name="plus" size={15} stroke={2.4} /> New chat
        </Link>
      </div>
      <div className="muted mb-3">Talk and pay — send money or a red packet right in the conversation</div>

      {conversations.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
          <div style={{ width: 74, height: 74, borderRadius: 22, background: "var(--badge-neutral-bg)", color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="chat" size={30} stroke={1.6} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>No chats yet</div>
          <div className="muted mt-1" style={{ maxWidth: 260 }}>
            Start a conversation with any TopMe user by their phone number.
          </div>
          <Link href="/chat/new" className="btn btn-primary mt-4" style={{ textDecoration: "none", padding: "0 20px", height: 44 }}>
            Start a chat
          </Link>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {conversations.map((c, i) => (
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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span className="muted" style={{ fontSize: 11 }}>
                  {relativeTime(c.last_message_at)}
                </span>
                {c.unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
