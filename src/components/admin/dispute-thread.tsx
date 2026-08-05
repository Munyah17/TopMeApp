"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDisputeStatus, sendDisputeMessage } from "@/lib/actions/disputes";
import type { DisputeMessage, DisputeStatus } from "@/types/database";
import type { DisputeWithNames } from "@/lib/data/dispute-queries";

const STATUSES: DisputeStatus[] = ["open", "investigating", "resolved", "rejected"];

export function DisputeThread({
  dispute,
  messages,
  currentUserId,
}: {
  dispute: DisputeWithNames;
  messages: DisputeMessage[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [note, setNote] = useState(dispute.resolution_note ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBody("");
    startTransition(async () => {
      try {
        await sendDisputeMessage(dispute.id, trimmed);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send.");
      }
    });
  }

  function changeStatus(status: DisputeStatus) {
    startTransition(async () => {
      try {
        await setDisputeStatus(dispute.id, status, note);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update status.");
      }
    });
  }

  return (
    <div>
      <div className="card card-pad mb-3">
        <div style={{ fontWeight: 700, fontSize: 15 }}>{dispute.subject}</div>
        {dispute.description && <div className="muted mt-1">{dispute.description}</div>}
        <div className="muted mt-2" style={{ fontSize: 11.5 }}>
          Raised by {dispute.raised_by_profile?.full_name || dispute.raised_by_profile?.phone || "Unknown"}
          {dispute.transaction_id && (
            <>
              {" "}
              · <a href={`/admin/transactions/${dispute.transaction_id}`} style={{ color: "var(--green)", fontWeight: 700 }}>View transaction</a>
            </>
          )}
        </div>

        <div className="row gap-2 mt-3" style={{ flexWrap: "wrap" }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`chip tap ${dispute.status === s ? "selected" : ""}`}
              style={{ textTransform: "capitalize" }}
              disabled={pending}
              onClick={() => changeStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <label className="field-label mt-3">Resolution note</label>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was decided and why" />
        {error && (
          <div className="muted mt-2" style={{ color: "var(--error)" }}>
            {error}
          </div>
        )}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card-pad" style={{ maxHeight: 360, overflowY: "auto" }}>
          {messages.length === 0 ? (
            <div className="muted">No messages yet.</div>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === currentUserId;
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
                  <div
                    style={{
                      maxWidth: 320,
                      borderRadius: 14,
                      padding: "9px 13px",
                      fontSize: 13.5,
                      background: mine ? "var(--green)" : "var(--bg)",
                      color: mine ? "#fff" : "var(--text)",
                    }}
                  >
                    {m.body}
                    <div style={{ fontSize: 10, marginTop: 3, opacity: 0.7 }}>{new Date(m.created_at).toLocaleString("en-GB")}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="row gap-2" style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <input
            className="field"
            style={{ flex: 1 }}
            placeholder="Reply…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="btn btn-primary" style={{ padding: "0 18px" }} disabled={pending || !body.trim()} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
