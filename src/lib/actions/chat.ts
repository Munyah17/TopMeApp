"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { findProfileByPhone } from "@/lib/data/queries";
import { isFeatureEnabled } from "@/lib/data/flags";
import { sendMoney } from "@/lib/actions/payments";
import { sendPushToUser } from "@/lib/push/send";
import type { ChatMessage, Conversation } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  recipient_not_found: "No TopMe account found with that phone number.",
  cannot_chat_self: "You can't start a chat with your own number.",
  not_authenticated: "Please log in again to continue.",
  feature_disabled: "Chat is temporarily turned off. Please check back soon.",
};

function friendlyError(message: string) {
  const key = Object.keys(FRIENDLY_ERRORS).find((k) => message.includes(k));
  return key ? FRIENDLY_ERRORS[key] : "Something went wrong. Please try again.";
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(FRIENDLY_ERRORS.not_authenticated);
  return { supabase, user };
}

export async function startConversation(phone: string) {
  if (!(await isFeatureEnabled("chat_enabled"))) throw new Error(FRIENDLY_ERRORS.feature_disabled);

  const { supabase } = await requireUser();

  const profile = await findProfileByPhone(phone.trim());
  if (!profile) throw new Error(FRIENDLY_ERRORS.recipient_not_found);

  const { data, error } = await supabase.rpc("start_conversation", { p_other_user_id: profile.id });
  if (error) throw new Error(friendlyError(error.message));

  return data as Conversation;
}

async function touchConversation(conversationId: string, preview: string) {
  const { supabase } = await requireUser();
  await supabase
    .from("conversations")
    .update({ last_message: preview.slice(0, 140), last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

// Push notifications go to whoever *isn't* sending — reads the
// conversation with the admin client because RLS on push_subscriptions is
// owner-only, and the recipient here is never the calling user.
async function notifyOtherParticipant(conversationId: string, senderId: string, body: string) {
  const admin = createAdminClient();
  const [{ data: convo }, { data: sender }] = await Promise.all([
    admin.from("conversations").select("user_a, user_b").eq("id", conversationId).single(),
    admin.from("profiles").select("full_name, phone").eq("id", senderId).single(),
  ]);
  if (!convo) return;
  const recipientId = convo.user_a === senderId ? convo.user_b : convo.user_a;
  const title = sender?.full_name || sender?.phone || "TopMe";
  void sendPushToUser(admin, recipientId, { title, body, url: `/chat/${conversationId}` });
}

export async function sendTextMessage(conversationId: string, body: string): Promise<ChatMessage> {
  const { supabase, user } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Enter a message.");

  // Returns the inserted row rather than void: the sender's own bubble was
  // previously rendered only once the Realtime postgres_changes event for
  // this exact insert round-tripped back through the DB — extra, avoidable
  // latency for your own message, and if that channel wasn't connected
  // yet (a real possibility right after opening a thread) it never
  // rendered at all until the next page load. The caller now appends this
  // return value straight to local state.
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, kind: "text", body: trimmed })
    .select()
    .single();
  if (error) throw new Error(friendlyError(error.message));

  await touchConversation(conversationId, trimmed);
  void notifyOtherParticipant(conversationId, user.id, trimmed);
  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");
  return data as ChatMessage;
}

export async function sendImageMessage(conversationId: string, formData: FormData): Promise<ChatMessage> {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to send.");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be under 8MB.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `messages/${conversationId}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, file, { contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = supabase.storage.from("chat-images").getPublicUrl(path);

  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, kind: "image", image_url: pub.publicUrl })
    .select()
    .single();
  if (error) throw new Error(friendlyError(error.message));

  await touchConversation(conversationId, "📷 Photo");
  void notifyOtherParticipant(conversationId, user.id, "📷 Sent a photo");
  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");
  return data as ChatMessage;
}

export async function sendMoneyMessage(conversationId: string, receiverPhone: string, amount: number, note: string | undefined, kind: "transfer" | "red_packet"): Promise<ChatMessage> {
  const { supabase, user } = await requireUser();

  // Money movement itself is unchanged — reuses the exact same wallet_transfer
  // RPC path as the standalone Send Money / Red Packet flow.
  const transfer = await sendMoney(receiverPhone, amount, note, kind);

  const preview = kind === "red_packet" ? `🧧 Sent a red packet` : `Sent $${amount.toFixed(2)}`;
  // select() joins p2p_transfer the same way getMessages() does for the
  // initial page load — needed so the sender's own bubble can render the
  // "$X sent" card immediately instead of a blank one. Postgres Realtime's
  // postgres_changes payloads are always the bare row with no joins, which
  // is a real, separate bug on the *recipient's* side: their card would
  // render blank until they reloaded the page. See the join fetched
  // client-side in chat-thread.tsx's realtime handler for that half of it.
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, kind: "p2p_transfer", p2p_transfer_id: transfer.id })
    .select("*, p2p_transfer:p2p_transfers(*)")
    .single();
  if (error) throw new Error(friendlyError(error.message));

  // No separate push trigger here — sendMoney() above already sends one to
  // the receiver, covering this chat-embedded path and the standalone
  // Send Money/Red Packet page identically from one place.
  await touchConversation(conversationId, preview);
  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");
  revalidatePath("/wallet");

  return data as ChatMessage;
}

export async function markConversationRead(conversationId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("conversation_reads")
    .upsert({ conversation_id: conversationId, user_id: user.id, last_read_at: new Date().toISOString() });
  revalidatePath("/chat");
}
