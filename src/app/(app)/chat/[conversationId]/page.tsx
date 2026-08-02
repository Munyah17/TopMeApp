import { notFound, redirect } from "next/navigation";
import { ChatThread } from "@/components/chat/chat-thread";
import { getConversation, getMessages } from "@/lib/data/chat-queries";
import { getCurrentProfile } from "@/lib/data/queries";
import { markConversationRead } from "@/lib/actions/chat";

export default async function ChatThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const conversation = await getConversation(conversationId, profile.id);
  if (!conversation) notFound();

  const messages = await getMessages(conversationId);
  void markConversationRead(conversationId);

  return (
    <ChatThread
      conversationId={conversationId}
      counterpart={conversation.counterpart}
      currentUserId={profile.id}
      initialMessages={messages}
    />
  );
}
