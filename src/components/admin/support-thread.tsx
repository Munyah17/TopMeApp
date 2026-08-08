"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTicket, setTicketPriority, setTicketStatus, sendTicketMessage } from "@/lib/actions/support";
import type { Profile, SupportTicketMessage, TicketPriority, TicketStatus } from "@/types/database";
import type { SupportTicketWithNames } from "@/lib/data/support-queries";

const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

export function SupportThread({
  ticket,
  messages,
  currentUserId,
  staff,
}: {
  ticket: SupportTicketWithNames;
  messages: SupportTicketMessage[];
  currentUserId: string;
  staff: Pick<Profile, "id" | "full_name" | "email">[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBody("");
    startTransition(async () => {
      try {
        await sendTicketMessage(ticket.id, trimmed);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send.");
      }
    });
  }

  function changeStatus(status: TicketStatus) {
    startTransition(async () => {
      try {
        await setTicketStatus(ticket.id, status);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update status.");
      }
    });
  }

  function changePriority(priority: TicketPriority) {
    startTransition(async () => {
      try {
        await setTicketPriority(ticket.id, priority);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update priority.");
      }
    });
  }

  function changeAssignee(assigneeId: string) {
    startTransition(async () => {
      try {
        await assignTicket(ticket.id, assigneeId || null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not reassign.");
      }
    });
  }

  return (
    <div>
      <div className="card card-pad mb-3">
        <div style={{ fontWeight: 700, fontSize: 15 }}>{ticket.subject}</div>
        <div className="muted mt-1" style={{ fontSize: 11.5 }}>
          {ticket.user_profile?.full_name || ticket.user_profile?.email || ticket.guest_email || ticket.guest_phone || "Unknown"}
        </div>
        <div className="row gap-2 mt-3" style={{ flexWrap: "wrap" }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`chip tap ${ticket.status === s ? "selected" : ""}`}
              style={{ textTransform: "capitalize" }}
              disabled={pending}
              onClick={() => changeStatus(s)}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="row gap-2 mt-3" style={{ flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Priority</label>
            <select className="field" value={ticket.priority} disabled={pending} onChange={(e) => changePriority(e.target.value as TicketPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Assigned to</label>
            <select className="field" value={ticket.assigned_to ?? ""} disabled={pending} onChange={(e) => changeAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.email}
                </option>
              ))}
            </select>
          </div>
        </div>
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
              const isCustomer = m.sender_id === null || m.sender_id === ticket.user_id;
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
                    <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>{isCustomer ? "Customer" : "Staff"}</div>
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
