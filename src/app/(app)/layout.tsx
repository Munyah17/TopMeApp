import { AnnouncementStrip } from "@/components/app-shell/announcement-strip";
import { AppShell } from "@/components/app-shell/shell";
import { getUnreadChatCount } from "@/lib/data/chat-queries";
import { isFeatureEnabled } from "@/lib/data/flags";
import { getCurrentProfile } from "@/lib/data/queries";

// Browsing is open to everyone — login is a choice, not a gate. Routes that
// need an actual account (/wallet, /history, /account, /admin) enforce their
// own auth requirement (see src/lib/supabase/middleware.ts + each page).
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [profile, chatEnabled] = await Promise.all([getCurrentProfile(), isFeatureEnabled("chat_enabled")]);
  const unreadChatCount = profile ? await getUnreadChatCount(profile.id) : 0;
  return (
    <AppShell
      profile={profile}
      unreadChatCount={unreadChatCount}
      chatEnabled={chatEnabled}
      announcements={<AnnouncementStrip audience="customers" />}
    >
      {children}
    </AppShell>
  );
}
