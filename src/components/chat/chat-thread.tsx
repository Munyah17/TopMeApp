"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { fmt } from "@/lib/data/catalog-helpers";
import { markConversationRead, sendImageMessage, sendMoneyMessage, sendTextMessage } from "@/lib/actions/chat";
import type { ChatMessage, ProfileLookup } from "@/types/database";

function initials(name: string | null | undefined, phone: string | null | undefined) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "TM";
  }
  return (phone ?? "TM").slice(-2);
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

export function ChatThread({
  conversationId,
  counterpart,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  counterpart: Pick<ProfileLookup, "id" | "full_name" | "phone"> | null;
  currentUserId: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [moneySheet, setMoneySheet] = useState<null | "transfer" | "red_packet">(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [moneyBusy, setMoneyBusy] = useState(false);
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    void markConversationRead(conversationId);
  }, [conversationId]);

  async function submitText() {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    setSending(true);
    try {
      await sendTextMessage(conversationId, body);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function submitImage(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await sendImageMessage(conversationId, fd);
    } catch (e) {
      setMoneyError(null);
      alert(e instanceof Error ? e.message : "Could not send that image.");
    } finally {
      setUploading(false);
    }
  }

  async function submitMoney() {
    if (!counterpart?.phone || !moneySheet) return;
    const amt = parseFloat(amount);
    if (!(amt > 0)) return;
    setMoneyBusy(true);
    setMoneyError(null);
    try {
      await sendMoneyMessage(conversationId, counterpart.phone, amt, note.trim() || undefined, moneySheet);
      setMoneySheet(null);
      setAmount("");
      setNote("");
    } catch (e) {
      setMoneyError(e instanceof Error ? e.message : "Could not send that.");
    } finally {
      setMoneyBusy(false);
    }
  }

  return (
    <div>
      <div className="chat-header">
        <Link href="/chat" className="backbtn tap chat-header-back" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div className="ibadge round" style={{ width: 36, height: 36, background: "rgba(255,255,255,0.18)", color: "#fff", fontWeight: 700, fontSize: 12 }}>
          {initials(counterpart?.full_name, counterpart?.phone)}
        </div>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15, color: "#fff" }}>{counterpart?.full_name || counterpart?.phone || "TopMe user"}</div>
      </div>

      <div className="chat-wallpaper px content-narrow" style={{ paddingTop: 10, paddingBottom: 90, minHeight: "calc(100vh - 160px)" }}>
        {messages.length === 0 && (
          <div className="muted" style={{ textAlign: "center", padding: "30px 0" }}>
            Say hello 👋
          </div>
        )}

        {messages.map((m, i) => {
          const showDivider = i === 0 || dayLabel(messages[i - 1].created_at) !== dayLabel(m.created_at);
          const divider = showDivider && (
            <div key={`day-${m.id}`} style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}>
              <span className="chat-day-chip">{dayLabel(m.created_at)}</span>
            </div>
          );

          const mine = m.sender_id === currentUserId;
          if (m.kind === "p2p_transfer" && m.p2p_transfer) {
            const isRedPacket = m.p2p_transfer.kind === "red_packet";
            return (
              <Fragment key={m.id}>
                {divider}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 12 }}>
                  <div
                    className="tap"
                    style={{
                      maxWidth: 240,
                      borderRadius: 18,
                      padding: 16,
                      color: "#fff",
                      boxShadow: "0 1px 3px rgba(15,23,42,0.15)",
                      background: isRedPacket ? "linear-gradient(135deg, #B91C1C, #EF4444 65%, #F59E0B 130%)" : "linear-gradient(135deg, var(--navy), #16324f)",
                    }}
                  >
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <Icon name={isRedPacket ? "packet" : "arrowUpR"} size={20} stroke={2} />
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>{isRedPacket ? "Red Packet" : "Money Transfer"}</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{fmt(m.p2p_transfer.amount)}</div>
                    {m.p2p_transfer.note && (
                      <div style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>{m.p2p_transfer.note}</div>
                    )}
                    <div style={{ fontSize: 10.5, marginTop: 8, opacity: 0.7 }}>{timeOf(m.created_at)}</div>
                  </div>
                </div>
              </Fragment>
            );
          }

          if (m.kind === "image" && m.image_url) {
            return (
              <Fragment key={m.id}>
                {divider}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 12 }}>
                  <div style={{ maxWidth: 220, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.15)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded chat image, arbitrary content */}
                    <img src={m.image_url} alt="Shared photo" style={{ width: "100%", display: "block" }} />
                    <div style={{ background: mine ? "var(--chat-bubble-mine)" : "var(--surface)", padding: "4px 8px", fontSize: 10, opacity: 0.65, textAlign: "right" }}>
                      {timeOf(m.created_at)}
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          }

          return (
            <Fragment key={m.id}>
              {divider}
              <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
                <div
                  className="chat-bubble"
                  style={{
                    maxWidth: 260,
                    borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    padding: "10px 14px",
                    fontSize: 14,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.1)",
                    background: mine ? "var(--chat-bubble-mine)" : "var(--surface)",
                    color: "var(--text)",
                  }}
                >
                  {m.body}
                  <div className="muted" style={{ fontSize: 10, marginTop: 4, textAlign: "right" }}>{timeOf(m.created_at)}</div>
                </div>
              </div>
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="content-narrow" style={{ position: "sticky", bottom: 0, background: "var(--bg)", paddingTop: 8, paddingBottom: 8 }}>
        <div className="px">
          <div className="row gap-2" style={{ alignItems: "flex-end" }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && submitImage(e.target.files[0])} />
            <div className="chat-composer-pill">
              <button className="chat-composer-icon tap" disabled={uploading} onClick={() => fileRef.current?.click()} title="Send a photo">
                <Icon name="image" size={19} stroke={1.8} />
              </button>
              <button className="chat-composer-icon tap" style={{ color: "var(--green)" }} onClick={() => setMoneySheet("transfer")} title="Send money or a red packet">
                <Icon name="wallet" size={19} stroke={1.8} />
              </button>
              <input
                placeholder="Message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitText()}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14, minWidth: 0 }}
              />
            </div>
            <button className="chat-send-btn tap" disabled={sending || !text.trim()} onClick={submitText}>
              <Icon name="send" size={18} stroke={2.2} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {moneySheet && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => !moneyBusy && setMoneySheet(null)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 480, borderRadius: "22px 22px 0 0", padding: 22, background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row gap-2 mb-3">
              {(
                [
                  { id: "transfer" as const, label: "Send Money" },
                  { id: "red_packet" as const, label: "Red Packet" },
                ]
              ).map((k) => (
                <div key={k.id} className={`chip tap ${moneySheet === k.id ? "selected" : ""}`} style={{ flex: 1, textAlign: "center" }} onClick={() => setMoneySheet(k.id)}>
                  {k.label}
                </div>
              ))}
            </div>

            <label className="field-label">Amount</label>
            <input className="field" placeholder="$0.00" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />

            <label className="field-label mt-2">Message (optional)</label>
            <input className="field" placeholder={moneySheet === "red_packet" ? "Happy birthday!" : "What's this for?"} value={note} onChange={(e) => setNote(e.target.value)} />

            {moneyError && (
              <div className="muted mt-2" style={{ color: "var(--error)" }}>
                {moneyError}
              </div>
            )}

            <button className="btn btn-primary btn-block mt-4" disabled={moneyBusy || !(parseFloat(amount) > 0)} onClick={submitMoney}>
              {moneyBusy ? "Sending…" : `Send ${amount ? fmt(parseFloat(amount)) : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
