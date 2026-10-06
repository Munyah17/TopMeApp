import { notFound, redirect } from "next/navigation";
import { ChatThread } from "@/components/chat/chat-thread";
import { getConversation, getMessages } from "@/lib/data/chat-queries";
import { getCurrentProfile } from "@/lib/data/queries";

export default async function ChatThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [conversation, messages] = await Promise.all([
    getConversation(conversationId, profile.id),
    getMessages(conversationId),
  ]);
  if (!conversation) notFound();
  // Read-receipt is marked client-side by ChatThread's useEffect — calling
  // the server action here ran revalidatePath mid-render, which threw during
  // the post-send revalidation and surfaced as the masked production error.

  return (
    <ChatThread
      conversationId={conversationId}
      counterpart={conversation.counterpart}
      currentUserId={profile.id}
      myShowLastSeen={profile.show_last_seen !== false}
      initialMessages={messages}
    />
  );
}
