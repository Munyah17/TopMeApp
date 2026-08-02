import { AuthRequired } from "@/components/auth-required";
import { NewChatForm } from "@/components/chat/new-chat-form";
import { getCurrentProfile } from "@/lib/data/queries";

export default async function NewChatPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return (
      <div className="px content-wrap" style={{ paddingTop: 6 }}>
        <h2 style={{ fontSize: 20 }}>New chat</h2>
        <AuthRequired title="Log in to chat" message="Message friends and family, and send money or a red packet right in the conversation." />
      </div>
    );
  }

  return <NewChatForm />;
}
