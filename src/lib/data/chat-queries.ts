import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, Conversation, P2pTransfer, Profile } from "@/types/database";

export interface ConversationWithCounterpart extends Conversation {
  counterpart: Pick<Profile, "id" | "full_name" | "phone"> | null;
  unread: boolean;
}

export async function getConversations(userId: string): Promise<ConversationWithCounterpart[]> {
  const supabase = await createClient();

  const { data: convos } = await supabase
    .from("conversations")
    .select("*")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("last_message_at", { ascending: false });
  const rows = (convos as Conversation[]) ?? [];
  if (rows.length === 0) return [];

  const counterpartIds = Array.from(new Set(rows.map((c) => (c.user_a === userId ? c.user_b : c.user_a))));
  const [{ data: profiles }, { data: reads }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone").in("id", counterpartIds),
    supabase.from("conversation_reads").select("conversation_id, last_read_at").eq("user_id", userId),
  ]);
  const profileById = new Map(((profiles as Pick<Profile, "id" | "full_name" | "phone">[]) ?? []).map((p) => [p.id, p]));
  const readAtByConvo = new Map(((reads as { conversation_id: string; last_read_at: string }[]) ?? []).map((r) => [r.conversation_id, r.last_read_at]));

  return rows.map((c) => {
    const counterpartId = c.user_a === userId ? c.user_b : c.user_a;
    const readAt = readAtByConvo.get(c.id);
    return {
      ...c,
      counterpart: profileById.get(counterpartId) ?? null,
      unread: !readAt || new Date(readAt) < new Date(c.last_message_at),
    };
  });
}

// Powers the nav badge, called on every page load via the (app) layout —
// deliberately NOT reusing getConversations(), which also joins counterpart
// profiles just to render names nobody needs for a number. Two lightweight
// queries instead of three (one of them a profiles join) on every single
// navigation across the whole app, not just /chat.
export async function getUnreadChatCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const [{ data: convos }, { data: reads }] = await Promise.all([
    supabase.from("conversations").select("id, last_message_at").or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from("conversation_reads").select("conversation_id, last_read_at").eq("user_id", userId),
  ]);
  const readAtByConvo = new Map(((reads as { conversation_id: string; last_read_at: string }[]) ?? []).map((r) => [r.conversation_id, r.last_read_at]));
  return ((convos as { id: string; last_message_at: string }[]) ?? []).filter((c) => {
    const readAt = readAtByConvo.get(c.id);
    return !readAt || new Date(readAt) < new Date(c.last_message_at);
  }).length;
}

export async function getConversation(conversationId: string, userId: string): Promise<ConversationWithCounterpart | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("conversations").select("*").eq("id", conversationId).single();
  const convo = data as Conversation | null;
  if (!convo || (convo.user_a !== userId && convo.user_b !== userId)) return null;

  const counterpartId = convo.user_a === userId ? convo.user_b : convo.user_a;
  const [{ data: profile }, { data: read }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone").eq("id", counterpartId).single(),
    supabase.from("conversation_reads").select("last_read_at").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle(),
  ]);
  const readAt = (read as { last_read_at: string } | null)?.last_read_at;

  return {
    ...convo,
    counterpart: (profile as Pick<Profile, "id" | "full_name" | "phone">) ?? null,
    unread: !readAt || new Date(readAt) < new Date(convo.last_message_at),
  };
}

// Fetches the most recent `limit` messages — ordering descending then
// limiting (instead of ascending+limit, which silently returned the
// OLDEST messages in any conversation past `limit` and made long threads
// look frozen in the past) then reversing back to chronological order for
// display.
export async function getMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
  const supabase = await createClient();
  // Plain select — the p2p_transfer:p2p_transfers(*) embed intermittently
  // fails when PostgREST can't resolve the relationship (stale schema
  // cache), and the throw surfaced as the masked "Server Components render"
  // error in the money sheet even though the transfer had already succeeded.
  // Transfers are fetched in a second query and merged instead — same shape,
  // no fragile join.
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data as ChatMessage[]) ?? [];

  const transferIds = rows.map((m) => m.p2p_transfer_id).filter((id): id is string => Boolean(id));
  if (transferIds.length > 0) {
    const { data: transfers } = await supabase.from("p2p_transfers").select("*").in("id", transferIds);
    const byId = new Map(((transfers as P2pTransfer[]) ?? []).map((t) => [t.id, t]));
    for (const m of rows) {
      m.p2p_transfer = m.p2p_transfer_id ? byId.get(m.p2p_transfer_id) ?? null : null;
    }
  }
  return rows.reverse();
}
