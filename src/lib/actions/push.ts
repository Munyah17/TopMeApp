"use server";

import { createClient } from "@/lib/supabase/server";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribeToPush(sub: PushSubscriptionInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please log in again to continue.");

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

export async function unsubscribeFromPush(endpoint: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
}
