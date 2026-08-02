"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findProfileByPhone } from "@/lib/data/queries";
import { sendMoney } from "@/lib/actions/payments";
import type { Conversation } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  recipient_not_found: "No TopMe account found with that phone number.",
  cannot_chat_self: "You can't start a chat with your own number.",
  not_authenticated: "Please log in again to continue.",
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

export async function sendTextMessage(conversationId: string, body: string) {
  const { supabase, user } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Enter a message.");

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    kind: "text",
    body: trimmed,
  });
  if (error) throw new Error(friendlyError(error.message));

  await touchConversation(conversationId, trimmed);
  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");
}

export async function sendImageMessage(conversationId: string, formData: FormData) {
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

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    kind: "image",
    image_url: pub.publicUrl,
  });
  if (error) throw new Error(friendlyError(error.message));

  await touchConversation(conversationId, "📷 Photo");
  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");
}

export async function sendMoneyMessage(conversationId: string, receiverPhone: string, amount: number, note: string | undefined, kind: "transfer" | "red_packet") {
  const { supabase, user } = await requireUser();

  // Money movement itself is unchanged — reuses the exact same wallet_transfer
  // RPC path as the standalone Send Money / Red Packet flow.
  const transfer = await sendMoney(receiverPhone, amount, note, kind);

  const preview = kind === "red_packet" ? `🧧 Sent a red packet` : `Sent $${amount.toFixed(2)}`;
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    kind: "p2p_transfer",
    p2p_transfer_id: transfer.id,
  });
  if (error) throw new Error(friendlyError(error.message));

  await touchConversation(conversationId, preview);
  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");
  revalidatePath("/wallet");

  return transfer;
}

export async function markConversationRead(conversationId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("conversation_reads")
    .upsert({ conversation_id: conversationId, user_id: user.id, last_read_at: new Date().toISOString() });
  revalidatePath("/chat");
}
