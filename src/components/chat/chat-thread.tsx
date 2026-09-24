"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { fmt } from "@/lib/data/catalog-helpers";
import { markConversationRead, sendImageMessage, sendMoneyMessage, sendTextMessage } from "@/lib/actions/chat";
import { compressImage } from "@/lib/client/compress-image";
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
  const wallpaperRef = useRef<HTMLDivElement>(null);
  // Track whether the user is already at the bottom so a new message only
  // scrolls when they're following the conversation — never yanks them
  // away from history they're reading (WhatsApp behaviour).
  const stickToBottom = useRef(true);

  // Adds a message to local state exactly once, however it arrived —
  // pushed straight from a successful send (see submitText/submitImage/
  // submitMoney below) or echoed back over Realtime. Whichever gets there
  // first wins; the id-based dedupe means the other is a harmless no-op,
  // so this one function is safe to call from both paths.
  function addMessage(m: ChatMessage) {
    setMessages((prev) => (prev.some((existing) => existing.id === m.id) ? prev : [...prev, m]));
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const incoming = payload.new as ChatMessage;
          // postgres_changes always delivers the bare row — never a joined
          // one — so a money-transfer message from the OTHER person arrives
          // with p2p_transfer_id set but p2p_transfer itself missing. The
          // render below keys off p2p_transfer being present, so without
          // this fetch their "$X sent" card would render blank until the
          // page was reloaded (which re-fetches through getMessages()'s own
          // join). RLS already allows either party to read the transfer
          // row (p2p_transfers_select_related), so this is just the join
          // getMessages() does server-side, done client-side instead.
          if (incoming.kind === "p2p_transfer" && incoming.p2p_transfer_id && !incoming.p2p_transfer) {
            const { data: transfer } = await supabase.from("p2p_transfers").select("*").eq("id", incoming.p2p_transfer_id).single();
            addMessage({ ...incoming, p2p_transfer: transfer ?? null });
            return;
          }
          addMessage(incoming);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Scroll the wallpaper container directly — scrollIntoView scrolls EVERY
  // scrollable ancestor (the whole page included), which is what made the
  // screen visibly shift when a thread opened.
  useEffect(() => {
    const el = wallpaperRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = wallpaperRef.current;
    if (el && stickToBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
      addMessage(await sendTextMessage(conversationId, body));
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function submitImage(file: File) {
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append("file", compressed);
      addMessage(await sendImageMessage(conversationId, fd));
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
      const res = await sendMoneyMessage(conversationId, counterpart.phone, amt, note.trim() || undefined, moneySheet);
      if (!res.ok) {
        setMoneyError(res.error);
        return;
      }
      addMessage(res.message);
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="chat-header">
        <Link href="/chat" className="backbtn tap chat-header-back" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div className="ibadge round" style={{ width: 36, height: 36, background: "rgba(255,255,255,0.18)", color: "#fff", fontWeight: 700, fontSize: 12 }}>
          {initials(counterpart?.full_name, counterpart?.phone)}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {counterpart?.full_name || counterpart?.phone || "TopMe user"}
        </div>
      </div>

      <div
        ref={wallpaperRef}
        className="chat-wallpaper px content-narrow"
        style={{ paddingTop: 10, paddingBottom: 16 }}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
        }}
      >
        {messages.length === 0 && (
          <div className="muted" style={{ textAlign: "center", padding: "30px 0" }}>
            Say hello 👋
          </div>
        )}

        {messages.map((m, i) => {
          const showDivider = i === 0 || dayLabel(messages[i - 1].created_at) !== dayLabel(m.created_at);
          const divider = showDivider && (
            <div key={`day-${m.id}`} style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
              <span className="chat-day-chip">{dayLabel(m.created_at)}</span>
            </div>
          );

          const mine = m.sender_id === currentUserId;
          if (m.kind === "p2p_transfer" && m.p2p_transfer) {
            const isRedPacket = m.p2p_transfer.kind === "red_packet";
            return (
              <Fragment key={m.id}>
                {divider}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
                  <div
                    className="tap"
                    style={{
                      maxWidth: "min(260px, 80%)",
                      borderRadius: 18,
                      padding: 16,
                      color: "#fff",
                      boxShadow: "0 1px 3px rgba(15,23,42,0.15)",
                      background: isRedPacket ? "#D8434B" : "var(--navy)",
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
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
                  <div style={{ maxWidth: "min(240px, 72%)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.15)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded chat image, variable aspect ratio with no stored dimensions (next/image needs one or the other) */}
                    <img src={m.image_url} alt="Shared photo" loading="lazy" decoding="async" style={{ width: "100%", display: "block" }} />
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
              <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div
                  className="chat-bubble"
                  style={{
                    maxWidth: "min(280px, 80%)",
                    borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    padding: "9px 12px",
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
      </div>

      <div className="content-narrow" style={{ flexShrink: 0, width: "100%", background: "var(--bg)", paddingTop: 8, paddingBottom: 8 }}>
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
              {/* fontSize 16 — iOS zooms the viewport on any focused input
                  under 16px, which was the "auto zoom" when the composer
                  (or the money sheet's .field inputs) opened. */}
              <input
                placeholder="Message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitText()}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 16, minWidth: 0 }}
                enterKeyHint="send"
              />
            </div>
            <button className="chat-send-btn tap" disabled={sending || !text.trim()} onClick={submitText}>
              <Icon name="send" size={18} stroke={2.2} />
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
