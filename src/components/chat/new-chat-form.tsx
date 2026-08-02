"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { startConversation } from "@/lib/actions/chat";

export function NewChatForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const convo = await startConversation(phone);
      router.push(`/chat/${convo.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start that chat.");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <Link href="/chat" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>New chat</div>
      </div>

      <div className="px content-narrow" style={{ paddingTop: 4 }}>
        <div className="ibadge mt-2" style={{ background: "var(--green-50)", color: "var(--green)", width: 56, height: 56, borderRadius: 18 }}>
          <Icon name="chat" size={26} stroke={1.7} />
        </div>
        <h2 style={{ fontSize: 20, marginTop: 14 }}>Start a conversation</h2>
        <div className="muted mb-3">Enter the phone number of any TopMe user</div>

        <label className="field-label">Phone Number</label>
        <input
          className="field"
          placeholder="077 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && phone.trim().length >= 3 && submit()}
        />

        {error && (
          <div className="muted mt-2" style={{ color: "var(--error)" }}>
            {error}
          </div>
        )}

        <button className="btn btn-primary btn-block mt-4" disabled={busy || phone.trim().length < 3} onClick={submit}>
          {busy ? "Looking up…" : "Start chat"}
        </button>
      </div>
    </div>
  );
}
