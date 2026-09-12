"use client";

import { usePathname } from "next/navigation";

// WhatsApp-style master-detail: on a wide screen the conversation list is a
// permanent left pane (~1/3) next to whichever thread is open (~2/3); on a
// narrow screen it's one column at a time — the list at plain /chat, a
// full-screen thread at /chat/<id>, /chat/new or /chat/topme. The list
// lives in this layout (not in page.tsx) specifically so it survives
// navigating between conversations instead of re-fetching/remounting —
// the same reason any master-detail UI puts the list in a layout, not a
// page.
export function ChatShell({ listPanel, children }: { listPanel: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const hasActiveThread = pathname !== "/chat";

  return (
    <div className={`chat-shell${hasActiveThread ? " chat-shell-thread-open" : ""}`}>
      <div className="chat-list-pane">{listPanel}</div>
      <div className="chat-thread-pane">{children}</div>
    </div>
  );
}
