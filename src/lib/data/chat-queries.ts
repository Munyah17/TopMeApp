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

export async function getUnreadChatCount(userId: string): Promise<number> {
  const conversations = await getConversations(userId);
  return conversations.filter((c) => c.unread).length;
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

export async function getMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*, p2p_transfer:p2p_transfers(*)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data as (ChatMessage & { p2p_transfer: P2pTransfer | null })[]) ?? [];
}
