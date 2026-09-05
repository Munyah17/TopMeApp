"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setNotificationsEnabled(enabled: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  await supabase.from("profiles").update({ notifications_enabled: enabled }).eq("id", user.id);
  revalidatePath("/account");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/**
 * Welcome email, sent once the account is actually usable — i.e. signup
 * returned a session. When the project requires email confirmation there is
 * no session yet and Supabase's own confirmation mail is the right first
 * touch; landing a "Welcome" beside it would just compete with the link the
 * customer still has to click.
 *
 * Reads the address off the session rather than taking it as an argument, so
 * this can't be used to mail an arbitrary recipient. sendEmail never throws,
 * so a mail failure can't break the signup it follows.
 */
export async function sendWelcomeEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  const { sendEmail } = await import("@/lib/email/client");
  const { welcomeEmail } = await import("@/lib/email/templates");
  const name = (user.user_metadata?.full_name as string | undefined) ?? null;
  const { subject, html } = welcomeEmail({ name });
  await sendEmail({ sender: "noreply", to: user.email, subject, html, replyTo: "help@topme.co.zw" });
}
