import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";

export interface NotificationRecipients {
  /** Email addresses that get every ops alert (HTML mail via notifications@). */
  emails: string[];
  /** Mobile numbers that get the short-text ops alerts via txt.co.zw SMS. */
  sms: string[];
  /** Mobile numbers reserved for WhatsApp alerts — managed in Super Admin
   *  today; no WhatsApp provider is wired yet, so nothing is sent to them. */
  whatsapp: string[];
}

// Editable in Super Admin → Settings → "Notification recipients". Default
// keeps the original single-mailbox behaviour when the row is absent.
export const DEFAULT_NOTIFICATION_RECIPIENTS: NotificationRecipients = {
  emails: ["notifications@topme.co.zw"],
  sms: [],
  whatsapp: [],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeList(v: unknown, test: (s: string) => boolean): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x && test(x)).slice(0, 25);
}

// Cached like getTopupFeeConfig: updateNotificationRecipients busts the
// "settings" tag so a saved edit applies on the very next alert.
export const getNotificationRecipients = unstable_cache(
  async (): Promise<NotificationRecipients> => {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("value").eq("key", "notification_recipients").maybeSingle();
    const v = data?.value as { emails?: unknown; sms?: unknown; whatsapp?: unknown } | null;
    if (!v) return DEFAULT_NOTIFICATION_RECIPIENTS;
    const emails = sanitizeList(v.emails, (s) => EMAIL_RE.test(s));
    return {
      emails: emails.length ? emails : DEFAULT_NOTIFICATION_RECIPIENTS.emails,
      sms: sanitizeList(v.sms, (s) => /^\+?\d[\d\s-]{6,17}$/.test(s)),
      whatsapp: sanitizeList(v.whatsapp, (s) => /^\+?\d[\d\s-]{6,17}$/.test(s)),
    };
  },
  ["notification-recipients"],
  { tags: ["settings"], revalidate: 300 }
);
