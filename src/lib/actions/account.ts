"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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
 * Self-service basic identity edit — full name and contact email. Runs through
 * the caller's own session (not the admin client) so the profiles_update_own
 * RLS policy is what authorises the write, and the prevent_role_self_escalation
 * trigger still silently restores role/is_suspended if they're ever smuggled
 * into the payload. Phone is deliberately NOT editable here: it's the sign-in
 * credential (auth.users.phone), so changing it needs a verified auth flow, not
 * a bare profile column update that would desync login.
 */
export async function updateMyProfile(input: { fullName: string; email: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const email = input.email.trim();
  if (fullName.length < 2) throw new Error("Please enter your full name.");
  if (fullName.length > 80) throw new Error("That name is too long.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email doesn't look right.");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, email: email || null })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/account");
  revalidatePath("/home");
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

// Self-service profile picture. Same public "product-images" bucket and
// avatars/ path prefix as the admin uploadUserAvatar, but scoped to the
// caller's own profile (resolved from the session) rather than gated behind
// an admin permission — a customer can only ever set their own avatar here.
export async function uploadMyAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Profile pictures must be under 3MB.");

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `avatars/${user.id}-${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("product-images").getPublicUrl(path);
  const { error: updateError } = await admin.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/account");
  return data.publicUrl;
}

export async function removeMyAvatar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}
