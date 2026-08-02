import { AppShell } from "@/components/app-shell/shell";
import { getUnreadChatCount } from "@/lib/data/chat-queries";
import { getCurrentProfile } from "@/lib/data/queries";

// Browsing is open to everyone — login is a choice, not a gate. Routes that
// need an actual account (/wallet, /history, /account, /admin) enforce their
// own auth requirement (see src/lib/supabase/middleware.ts + each page).
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  const unreadChatCount = profile ? await getUnreadChatCount(profile.id) : 0;
  return (
    <AppShell profile={profile} unreadChatCount={unreadChatCount}>
      {children}
    </AppShell>
  );
}
