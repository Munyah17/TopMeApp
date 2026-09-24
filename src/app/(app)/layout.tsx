import { AnnouncementStrip } from "@/components/app-shell/announcement-strip";
import { AppShell } from "@/components/app-shell/shell";
import { getMyPermissions } from "@/lib/auth/permissions";
import { getUnreadChatCount } from "@/lib/data/chat-queries";
import { isFeatureEnabled } from "@/lib/data/flags";
import { getCurrentProfile } from "@/lib/data/queries";

// Browsing is open to everyone — login is a choice, not a gate. Routes that
// need an actual account (/wallet, /history, /account, /admin) enforce their
// own auth requirement (see src/lib/supabase/middleware.ts + each page).
// Staff may browse the public pages, but the customer-account routes above
// bounce them to their console in middleware — and the nav they see here is
// their console's, never the customer tabs.
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [profile, chatEnabled] = await Promise.all([getCurrentProfile(), isFeatureEnabled("chat_enabled")]);
  const isStaff = profile?.role === "admin" || profile?.role === "superadmin";
  const staffPermissions = isStaff ? await getMyPermissions() : null;
  const unreadChatCount = profile && !isStaff ? await getUnreadChatCount(profile.id) : 0;
  return (
    <AppShell
      profile={profile}
      unreadChatCount={unreadChatCount}
      chatEnabled={chatEnabled}
      staffConsole={
        profile?.role === "superadmin"
          ? { basePath: "/super-admin" as const, permissions: staffPermissions ?? [] }
          : profile?.role === "admin"
            ? { basePath: "/admin" as const, permissions: staffPermissions ?? [] }
            : undefined
      }
      announcements={<AnnouncementStrip audience="customers" />}
    >
      {children}
    </AppShell>
  );
}
