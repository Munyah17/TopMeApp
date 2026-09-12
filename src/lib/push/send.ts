import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Push notifications are not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
  webpush.setVapidDetails("mailto:accounts@topme.co.zw", publicKey, privateKey);
  configured = true;
}

// Best-effort by design — a push notification failing to send is never
// something a caller should have to handle or that should block the
// action that triggered it (a message was still sent, a payment still
// went through, whether or not the recipient's browser got pinged).
// Every call site below uses `void sendPushToUser(...)`, same as the
// existing `void sendEmail(...)` pattern.
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  try {
    ensureConfigured();
  } catch (e) {
    console.error("[push] not configured:", e instanceof Error ? e.message : e);
    return;
  }

  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/chat" });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      } catch (e) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is dead (browser data cleared, permission revoked,
          // device gone) — remove it instead of retrying it forever.
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error(`[push] failed to send to subscription ${s.id}:`, e instanceof Error ? e.message : e);
        }
      }
    })
  );
}
