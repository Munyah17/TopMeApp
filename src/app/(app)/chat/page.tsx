import { Icon } from "@/components/icons";
import { getCurrentProfile } from "@/lib/data/queries";
import { AuthRequired } from "@/components/auth-required";

// The conversation list itself is rendered by chat/layout.tsx (it needs to
// stay mounted across thread navigations — see that file's comment). This
// page is only ever the right-pane placeholder shown on a wide screen when
// no thread is open; on a narrow screen .chat-shell hides it entirely and
// shows the list instead (see .chat-shell-thread-open in globals.css).
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

  return (
    <div className="chat-thread-empty">
      <div className="ibadge round" style={{ width: 64, height: 64, background: "var(--badge-neutral-bg)", color: "var(--text-faint)", margin: "0 auto" }}>
        <Icon name="chat" size={28} stroke={1.6} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>Select a conversation</div>
      <div className="muted mt-1" style={{ maxWidth: 260 }}>
        Pick someone from the list, or open TopMe to top up, pay a bill, or check your balance.
      </div>
    </div>
  );
}
