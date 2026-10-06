"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { fmt } from "@/lib/data/catalog-helpers";
import {
  markConversationRead,
  sendImageMessage,
  sendMoneyMessage,
  sendTextMessage,
  sendVoiceMessage,
  setLastSeenVisibility,
  touchLastSeen,
} from "@/lib/actions/chat";
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

function lastSeenLabel(iso: string | null | undefined) {
  if (!iso) return "offline";
  const d = new Date(iso);
  const now = new Date();
  const diffMins = (now.getTime() - d.getTime()) / 60000;
  if (diffMins < 2) return "last seen just now";
  if (d.toDateString() === now.toDateString()) return `last seen ${timeOf(iso)}`;
  const yest = new Date();
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `last seen yesterday ${timeOf(iso)}`;
  return `last seen ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function voiceLength(ms: number | null | undefined) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Incoming-message tones. Device-level preference (localStorage), so it's
// instant and survives sign-out — like WhatsApp's per-device tone setting.
// Tones are generated WebAudio chimes: no asset files, no network fetches.
const TONES = {
  off: { label: "Off" },
  chime: { label: "Chime", notes: [880, 1175] },
  pop: { label: "Pop", notes: [660] },
  ding: { label: "Ding", notes: [1047, 1568] },
} as const;
type ToneId = keyof typeof TONES;

function playTone(tone: ToneId) {
  const def = TONES[tone];
  if (!("notes" in def)) return;
  try {
    const ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    def.notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio blocked — silent */
  }
}

function loadChatPrefs(): { tone: ToneId } {
  if (typeof window === "undefined") return { tone: "chime" };
  const t = window.localStorage.getItem("topme-chat-tone");
  return { tone: t && t in TONES ? (t as ToneId) : "chime" };
}

export function ChatThread({
  conversationId,
  counterpart,
  currentUserId,
  myShowLastSeen,
  initialMessages,
}: {
  conversationId: string;
  counterpart: Pick<ProfileLookup, "id" | "full_name" | "phone" | "last_seen_at" | "show_last_seen"> | null;
  currentUserId: string;
  myShowLastSeen: boolean;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [moneySheet, setMoneySheet] = useState<null | "transfer" | "red_packet">(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [moneyBusy, setMoneyBusy] = useState(false);
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Presence
  const [counterpartOnline, setCounterpartOnline] = useState(false);
  const [counterpartLastSeen, setCounterpartLastSeen] = useState(counterpart?.last_seen_at ?? null);
  const [showLastSeen, setShowLastSeen] = useState(myShowLastSeen);

  // Voice notes
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAt = useRef(0);
  const recordChunks = useRef<Blob[]>([]);
  const recordCancel = useRef(false);

  // Chat prefs (localStorage device setting)
  const [tone, setTone] = useState<ToneId>(() => loadChatPrefs().tone);
  const toneRef = useRef(tone);
  useEffect(() => {
    toneRef.current = tone;
  }, [tone]);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const wallpaperRef = useRef<HTMLDivElement>(null);
  // Track whether the user is already at the bottom so a new message only
  // scrolls when they're following the conversation — never yanks them
  // away from history they're reading (WhatsApp behaviour).
  const stickToBottom = useRef(true);
  const meRef = useRef(currentUserId);
  useEffect(() => {
    meRef.current = currentUserId;
  }, [currentUserId]);

  // Adds a message to local state exactly once, however it arrived —
  // pushed straight from a successful send or echoed back over Realtime.
  // Whichever gets there first wins; the id-based dedupe means the other
  // is a harmless no-op.
  function addMessage(m: ChatMessage) {
    setMessages((prev) => (prev.some((existing) => existing.id === m.id) ? prev : [...prev, m]));
  }

  // Realtime: subscribe with reconnection retry — if the channel errors or
  // closes (flaky network, Supabase reconnect), resubscribe with backoff
  // rather than silently going dead until reload.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const subscribe = () => {
      if (disposed) return;
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          async (payload) => {
            const incoming = payload.new as ChatMessage;
            attempts = 0;
            if (incoming.sender_id !== meRef.current) playTone(toneRef.current);
            // postgres_changes delivers the bare row, so money transfers from
            // the other person need their transfer row fetched separately.
            if (incoming.kind === "p2p_transfer" && incoming.p2p_transfer_id && !incoming.p2p_transfer) {
              const { data: transfer } = await supabase.from("p2p_transfers").select("*").eq("id", incoming.p2p_transfer_id).single();
              addMessage({ ...incoming, p2p_transfer: transfer ?? null });
              return;
            }
            addMessage(incoming);
          }
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            attempts = 0;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            const delay = Math.min(1000 * 2 ** attempts, 15000);
            attempts += 1;
            retryTimer = setTimeout(() => {
              if (channel) void supabase.removeChannel(channel);
              subscribe();
            }, delay);
          }
        });
    };

    subscribe();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Presence: a dedicated presence channel per thread. Realtime Presence
  // gives the live "online" state for free; on leave we also stamp
  // profiles.last_seen_at so the "last seen …" label is fresh. Only the
  // counterpart's presence is shown to the user.
  useEffect(() => {
    const supabase = createClient();
    const counterpartId = counterpart?.id;
    const channel = supabase
      .channel(`presence:${conversationId}`)
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const online = counterpartId
          ? Object.values(state).some((metas) => metas.some((m) => (m as { user_id?: string }).user_id === counterpartId))
          : false;
        setCounterpartOnline(online);
        if (!online && counterpartId) {
          // They left — their heartbeat on leave keeps last_seen_at fresh,
          // but re-read it so the label updates without a reload.
          void supabase
            .from("profiles")
            .select("last_seen_at, show_last_seen")
            .eq("id", counterpartId)
            .single()
            .then(({ data }) => {
              if (data?.show_last_seen) setCounterpartLastSeen(data.last_seen_at as string | null);
            });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: currentUserId });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, counterpart?.id, currentUserId]);

  // Last-seen heartbeat: stamp now, every 60s while open, and once more on
  // tab-hide/unmount so "last seen" is accurate the moment they leave.
  useEffect(() => {
    void touchLastSeen();
    const tick = setInterval(() => void touchLastSeen(), 60000);
    const stampOnHide = () => {
      if (document.visibilityState === "hidden") void touchLastSeen();
    };
    document.addEventListener("visibilitychange", stampOnHide);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", stampOnHide);
      void touchLastSeen();
    };
  }, []);

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
    setSendError(null);
    try {
      addMessage(await sendTextMessage(conversationId, body));
    } catch (e) {
      setText(body);
      setSendError(e instanceof Error ? e.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  async function submitImage(file: File) {
    setUploading(true);
    setSendError(null);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append("file", compressed);
      addMessage(await sendImageMessage(conversationId, fd));
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not send that image.");
    } finally {
      setUploading(false);
    }
  }

  const stopRecording = useCallback((cancel: boolean) => {
    recordCancel.current = cancel;
    if (mediaRecorder.current?.state !== "inactive") mediaRecorder.current?.stop();
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordTimer.current = null;
  }, []);

  async function startRecording() {
    if (recording || sending || uploading) return;
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorder.current = recorder;
      recordChunks.current = [];
      recordCancel.current = false;
      recordStartedAt.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const cancelled = recordCancel.current;
        const duration = Date.now() - recordStartedAt.current;
        const blob = new Blob(recordChunks.current, { type: recorder.mimeType || "audio/webm" });
        setRecording(false);
        if (cancelled || blob.size === 0 || duration < 500) return; // discard taps/cancels
        setUploading(true);
        try {
          const ext = recorder.mimeType?.includes("mp4") ? "m4a" : "webm";
          const fd = new FormData();
          fd.append("file", new File([blob], `voice.${ext}`, { type: blob.type }));
          fd.append("durationMs", String(duration));
          addMessage(await sendVoiceMessage(conversationId, fd));
        } catch (e) {
          setSendError(e instanceof Error ? e.message : "Could not send that voice note.");
        } finally {
          setUploading(false);
        }
      };

      recorder.start();
      setRecording(true);
      setRecordMs(0);
      recordTimer.current = setInterval(() => {
        const elapsed = Date.now() - recordStartedAt.current;
        setRecordMs(elapsed);
        if (elapsed >= 120000) stopRecording(false); // 2-minute cap
      }, 100);
    } catch {
      setSendError("Microphone access is needed to record voice notes.");
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

  const privacyLabel = counterpart?.show_last_seen === false ? "last seen hidden" : lastSeenLabel(counterpartLastSeen);
  const presenceText = counterpartOnline ? "online" : privacyLabel;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="chat-header">
        <Link href="/chat" className="backbtn tap chat-header-back" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div className="ibadge round" style={{ width: 36, height: 36, background: "rgba(255,255,255,0.18)", color: "#fff", fontWeight: 700, fontSize: 12 }}>
          {initials(counterpart?.full_name, counterpart?.phone)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {counterpart?.full_name || counterpart?.phone || "TopMe user"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", gap: 4 }}>
            {counterpartOnline && <span style={{ width: 7, height: 7, borderRadius: 999, background: "#4ade80", flexShrink: 0 }} />}
            {presenceText}
          </div>
        </div>
        <button className="chat-composer-icon tap" style={{ color: "#fff" }} onClick={() => setSettingsOpen(true)} title="Chat settings" aria-label="Chat settings">
          <Icon name="settings" size={19} stroke={1.8} />
        </button>
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

          if (m.kind === "voice" && m.voice_url) {
            return (
              <Fragment key={m.id}>
                {divider}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                  <div
                    style={{
                      maxWidth: "min(280px, 80%)",
                      minWidth: 200,
                      borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      padding: "8px 10px",
                      boxShadow: "0 1px 2px rgba(15,23,42,0.1)",
                      background: mine ? "var(--chat-bubble-mine)" : "var(--surface)",
                      color: "var(--text)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="mic" size={16} />
                      <audio controls preload="metadata" src={m.voice_url} style={{ flex: 1, minWidth: 0, height: 32 }} />
                    </div>
                    <div className="muted" style={{ fontSize: 10, marginTop: 2, textAlign: "right" }}>
                      {m.voice_duration_ms ? `${voiceLength(m.voice_duration_ms)} · ` : ""}{timeOf(m.created_at)}
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

      {sendError && (
        <div className="content-narrow" style={{ width: "100%" }}>
          <div className="px" style={{ color: "var(--error)", fontSize: 12.5, paddingBottom: 4 }}>{sendError}</div>
        </div>
      )}

      <div className="content-narrow" style={{ flexShrink: 0, width: "100%", background: "var(--bg)", paddingTop: 8, paddingBottom: 8 }}>
        <div className="px">
          {recording ? (
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <button className="chat-composer-icon tap" onClick={() => stopRecording(true)} title="Discard" aria-label="Discard voice note">
                <Icon name="x" size={19} stroke={2} />
              </button>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, color: "var(--error)", fontWeight: 600, fontSize: 13.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--error)", animation: "pulse 1s infinite" }} />
                Recording {voiceLength(recordMs)}
              </div>
              <button className="chat-send-btn tap" onClick={() => stopRecording(false)} title="Send voice note" aria-label="Send voice note">
                <Icon name="send" size={18} stroke={2.2} />
              </button>
            </div>
          ) : (
            <div className="row gap-2" style={{ alignItems: "flex-end" }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && submitImage(e.target.files[0])} />
              {/* capture="environment" opens the camera directly on mobile; on
                  desktop browsers without a camera it falls back to file
                  picker. */}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && submitImage(e.target.files[0])} />
              <div className="chat-composer-pill">
                <button className="chat-composer-icon tap" disabled={uploading} onClick={() => cameraRef.current?.click()} title="Take a photo">
                  <Icon name="camera" size={19} stroke={1.8} />
                </button>
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
              {text.trim() ? (
                <button className="chat-send-btn tap" disabled={sending} onClick={submitText} aria-label="Send message">
                  <Icon name="send" size={18} stroke={2.2} />
                </button>
              ) : (
                <button className="chat-send-btn tap" disabled={uploading} onClick={startRecording} title="Record a voice note" aria-label="Record a voice note">
                  <Icon name="mic" size={18} stroke={2.2} />
                </button>
              )}
            </div>
          )}
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

      {settingsOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 480, borderRadius: "22px 22px 0 0", padding: 22, background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Chat settings</div>

            <label className="field-label">Notification tone</label>
            <div className="row gap-2" style={{ flexWrap: "wrap", marginBottom: 14 }}>
              {(Object.keys(TONES) as ToneId[]).map((t) => (
                <div
                  key={t}
                  className={`chip tap ${tone === t ? "selected" : ""}`}
                  onClick={() => {
                    setTone(t);
                    window.localStorage.setItem("topme-chat-tone", t);
                    playTone(t);
                  }}
                >
                  {TONES[t].label}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Share my &quot;last seen&quot;</div>
                <div className="muted" style={{ fontSize: 12 }}>When off, people you chat with won&apos;t see when you were last online.</div>
              </div>
              <button
                className={`chip tap ${showLastSeen ? "selected" : ""}`}
                onClick={() => {
                  const next = !showLastSeen;
                  setShowLastSeen(next);
                  void setLastSeenVisibility(next).catch(() => setShowLastSeen(!next));
                }}
              >
                {showLastSeen ? "On" : "Off"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
