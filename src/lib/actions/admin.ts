"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { revalidateAdminPath } from "@/lib/actions/admin-cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { logAdminAction } from "@/lib/actions/audit";
import { requirePermission } from "@/lib/auth/permissions";

// Reserved for the handful of actions that must stay locked to the owner
// no matter what a permissions array says — granting superadmin itself is
// the obvious one. Everything else below delegates via requirePermission()
// so toggling a key on a staff member's team_members row actually works.
// Super Admin is the system owner — total control over every account,
// staff included, not just customers. A regular admin (staff.manage /
// users.suspend granted via permissions, not the role itself) stays
// restricted to customer accounts only, since staff/role management has
// its own dedicated page and blast radius. Throws the same friendly
// message either way so a regular admin can't tell staff accounts even
// exist via this path.
async function assertProfileEditable(admin: ReturnType<typeof createAdminClient>, actingUserId: string, targetRole: string) {
  if (targetRole === "customer") return;
  const { data: actingProfile } = await admin.from("profiles").select("role").eq("id", actingUserId).single();
  if (actingProfile?.role !== "superadmin") throw new Error("Only customer accounts can be edited here.");
}

async function requireSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "superadmin") throw new Error("forbidden");
  return { supabase, user };
}

// Uploads a product/service logo to the public "product-images" storage
// bucket and returns its public URL, ready to save on the service row.
export async function uploadServiceImage(formData: FormData) {
  await requirePermission("catalog.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be under 5MB.");

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `services/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

// Uploads a network operator logo (Econet/NetOne/…) to the same public
// bucket and returns its public URL. Kept separate from uploadServiceImage
// only so the storage path is tidy (networks/… vs services/…).
export async function uploadNetworkLogo(formData: FormData) {
  await requirePermission("catalog.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Logos must be under 2MB.");

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `networks/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

// Uploads a Home-page promo banner image the owner picks from their own
// device — the banner form previously only took a pasted URL, with
// nowhere to actually upload one from.
export async function uploadBannerImage(formData: FormData) {
  await requirePermission("announcements.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Banner images must be under 5MB.");

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `banners/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

// Sets (or clears, with null) the logo shown for one network on the
// airtime "Choose network" step.
export async function setNetworkLogo(networkId: string, logoUrl: string | null) {
  await requirePermission("catalog.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("networks").update({ logo_url: logoUrl }).eq("id", networkId);
  if (error) throw new Error(error.message);
  revalidateCatalog();
}

// Show / hide a network on the customer-facing airtime flow. Deactivate a
// network with no working provider (e.g. Telecel) so a customer can never
// start a purchase that's guaranteed to fail.
export async function setNetworkActive(networkId: string, isActive: boolean) {
  await requirePermission("catalog.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("networks").update({ is_active: isActive }).eq("id", networkId);
  if (error) throw new Error(error.message);
  revalidateCatalog();
}

export async function createApiModule(input: {
  name: string;
  provider: string;
  category: string;
  key: string;
  webhookUrl?: string;
}) {
  const { user } = await requirePermission("apis.manage");
  const admin = createAdminClient();

  await admin.from("api_modules").insert({
    name: input.name,
    provider: input.provider,
    category: input.category || null,
    status: "active",
    key_encrypted: encryptSecret(input.key),
    key_last4: input.key.slice(-4),
    webhook_url: input.webhookUrl || null,
    created_by: user.id,
  });

  revalidateAdminPath("/apis");
}

export async function toggleApiModule(id: string, currentStatus: "active" | "inactive") {
  await requirePermission("apis.manage");
  const admin = createAdminClient();
  await admin
    .from("api_modules")
    .update({ status: currentStatus === "active" ? "inactive" : "active" })
    .eq("id", id);
  revalidateAdminPath("/apis");
}

// Directly creates a real, ready-to-use staff account — no email-invite
// round trip. The owner wanted staff to be added the way any admin panel
// lets you add a teammate, not "invited" like a guest to someone else's
// platform: this is their own app, so the account exists and can log in
// immediately, password handed to the owner once to pass on however they
// like (WhatsApp, in person, whatever) — never logged, never stored
// anywhere but the one return value.
export async function addTeamMember(input: { name: string; email: string; role: string }) {
  const { user } = await requirePermission("staff.manage");
  const admin = createAdminClient();

  const password = randomUUID().replace(/-/g, "").slice(0, 12);

  const { data: created, error } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.name },
  });
  if (error) throw new Error(error.message);
  if (!created.user) throw new Error("Could not create the account.");

  await admin.from("team_members").insert({
    owner_id: user.id,
    user_id: created.user.id,
    invited_email: input.email,
    name: input.name,
    role: input.role,
    status: "active",
  });

  // handle_new_user() defaults every new auth user to role 'customer' — flip
  // it to 'admin' immediately, same write activateTeamMember used to do,
  // since there's no separate accept-the-invite step to wait for any more.
  const { data: updatedProfile, error: roleError } = await admin.from("profiles").update({ role: "admin" }).eq("id", created.user.id).select("role").single();
  if (roleError) throw new Error(roleError.message);
  if (updatedProfile?.role !== "admin") throw new Error("Account was created but the role change didn't take — please check Staff & Access.");

  await logAdminAction(admin, { actorId: user.id, action: "staff.add", targetTable: "team_members", targetId: created.user.id, meta: { email: input.email } });

  revalidateAdminPath("/staff");
  return { email: input.email, password };
}

export async function togglePermission(memberId: string, permission: string, currentPermissions: string[]) {
  await requirePermission("staff.manage");
  const admin = createAdminClient();
  const next = currentPermissions.includes(permission)
    ? currentPermissions.filter((p) => p !== permission)
    : [...currentPermissions, permission];
  await admin.from("team_members").update({ permissions: next }).eq("id", memberId);
  revalidateAdminPath("/staff");
}

// Activates an invited team member: this is the actual moment they gain
// /admin access. Inviting alone only creates the auth user + team_members
// row — profiles.role stays 'customer' (handle_new_user's default) until
// this runs. Both writes go through the admin client because
// prevent_role_self_escalation blocks any non-service-role change to
// profiles.role, not just self-updates.
export async function activateTeamMember(memberId: string) {
  const { user: actingUser } = await requirePermission("staff.manage");
  const admin = createAdminClient();

  const { data: member, error: memberError } = await admin.from("team_members").select("*").eq("id", memberId).single();
  if (memberError || !member) throw new Error("Team member not found.");
  if (!member.user_id) throw new Error("This invite hasn't been accepted yet — the person needs to complete signup first.");

  const { error: statusError } = await admin.from("team_members").update({ status: "active" }).eq("id", memberId);
  if (statusError) throw new Error(statusError.message);

  const { data: updatedProfile, error: roleError } = await admin.from("profiles").update({ role: "admin" }).eq("id", member.user_id).select("role").single();
  if (roleError) throw new Error(roleError.message);
  if (updatedProfile?.role !== "admin") throw new Error("Role change didn't take — please try again or check the account isn't already superadmin.");

  await logAdminAction(admin, { actorId: actingUser.id, action: "staff.activate", targetTable: "team_members", targetId: memberId, meta: { user_id: member.user_id } });

  revalidateAdminPath("/staff");
}

// Offboards a team member: disables their team_members row and drops their
// role back to customer, revoking /admin access immediately.
export async function deactivateTeamMember(memberId: string) {
  const { user: actingUser } = await requirePermission("staff.manage");
  const admin = createAdminClient();

  const { data: member, error: memberError } = await admin.from("team_members").select("*").eq("id", memberId).single();
  if (memberError || !member) throw new Error("Team member not found.");

  await admin.from("team_members").update({ status: "disabled" }).eq("id", memberId);
  if (member.user_id) {
    const { data: target } = await admin.from("profiles").select("role").eq("id", member.user_id).single();
    if (target?.role === "admin") {
      await admin.from("profiles").update({ role: "customer" }).eq("id", member.user_id);
    }
  }

  await logAdminAction(admin, { actorId: actingUser.id, action: "staff.deactivate", targetTable: "team_members", targetId: memberId, meta: { user_id: member.user_id } });

  revalidateAdminPath("/staff");
}

// The highest-privilege, hardest-to-undo action in the system — deliberately
// requires re-typing the target's email as a confirmation, not just a click.
export async function promoteToSuperadmin(userId: string, confirmEmail: string) {
  const { user: actingUser } = await requireSuperadmin();
  const admin = createAdminClient();

  const { data: target, error: targetError } = await admin.from("profiles").select("email, role").eq("id", userId).single();
  if (targetError || !target) throw new Error("Account not found.");
  if ((target.email || "").trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    throw new Error("That email doesn't match — please retype it exactly to confirm.");
  }

  const { data: updated, error: roleError } = await admin.from("profiles").update({ role: "superadmin" }).eq("id", userId).select("role").single();
  if (roleError) throw new Error(roleError.message);
  if (updated?.role !== "superadmin") throw new Error("Role change didn't take — please try again.");

  await logAdminAction(admin, { actorId: actingUser.id, action: "staff.promote_superadmin", targetTable: "profiles", targetId: userId });

  revalidateAdminPath("/staff");
  revalidateAdminPath("/users");
}

// Suspends or reactivates a customer account: blocks sign-in via Supabase
// Auth's own ban_duration (a 100-year ban reads as "suspended", "none" lifts
// it) and mirrors the flag onto profiles so the admin list can show it
// without a separate auth.admin.listUsers() call per row.
export async function toggleAccountSuspension(userId: string, currentlySuspended: boolean) {
  const { user: actingUser } = await requirePermission("users.suspend");
  if (userId === actingUser.id) throw new Error("You can't suspend your own account.");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (target?.role === "superadmin") throw new Error("Super Admin accounts can't be suspended.");

  const nextSuspended = !currentlySuspended;
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: nextSuspended ? "876000h" : "none",
  });
  if (authError) throw new Error(authError.message);

  await admin.from("profiles").update({ is_suspended: nextSuspended }).eq("id", userId);
  await logAdminAction(admin, {
    actorId: actingUser.id,
    action: nextSuspended ? "user.suspend" : "user.reactivate",
    targetTable: "profiles",
    targetId: userId,
  });
  revalidateAdminPath("/users");
}

// Edit a customer's account details from the support console. Name/phone
// live on `profiles`; email lives on `auth.users` and is mirrored to
// `profiles`. Phone is the P2P lookup key, so it stays unique.
export async function updateCustomerProfile(
  userId: string,
  input: { fullName?: string; phone?: string; email?: string }
) {
  const { user: actingUser } = await requirePermission("users.suspend");
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("role, email").eq("id", userId).single();
  if (!target) throw new Error("That account couldn't be found.");
  await assertProfileEditable(admin, actingUser.id, target.role);

  const patch: Record<string, string | null> = {};
  const changed: Record<string, unknown> = {};

  if (input.fullName !== undefined) {
    const v = input.fullName.trim();
    if (v && v.length > 120) throw new Error("Name is too long.");
    patch.full_name = v || null;
    changed.full_name = v || null;
  }

  if (input.phone !== undefined) {
    const v = input.phone.trim().replace(/[\s-]/g, "");
    if (v && !/^\+?\d{9,15}$/.test(v)) throw new Error("That doesn't look like a valid phone number.");
    if (v) {
      const { data: clash } = await admin.from("profiles").select("id").eq("phone", v).neq("id", userId).maybeSingle();
      if (clash) throw new Error("Another account already uses that phone number.");
    }
    patch.phone = v || null;
    changed.phone = v || null;
  }

  if (input.email !== undefined) {
    const v = input.email.trim().toLowerCase();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error("Enter a valid email address.");
    if (v && v !== (target.email ?? "").toLowerCase()) {
      const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email: v, email_confirm: true });
      if (authErr) {
        throw new Error(/already|registered|exists/i.test(authErr.message) ? "That email is already in use." : authErr.message);
      }
      patch.email = v;
      changed.email = v;
    }
  }

  if (Object.keys(patch).length === 0) return { changed: {} as Record<string, unknown> };

  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);

  await logAdminAction(admin, {
    actorId: actingUser.id,
    action: "user.edit_profile",
    targetTable: "profiles",
    targetId: userId,
    meta: changed,
  });
  revalidateAdminPath(`/users/${userId}`);
  revalidateAdminPath("/users");
  return { changed };
}

// Send the customer a password-reset email (same link the public
// "forgot password" flow uses).
export async function sendCustomerPasswordReset(userId: string) {
  const { user: actingUser } = await requirePermission("users.suspend");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("email").eq("id", userId).single();
  if (!target?.email) throw new Error("This account has no email address to send a reset to.");

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://www.topme.co.zw";
  const { error } = await admin.auth.resetPasswordForEmail(target.email as string, {
    redirectTo: `${origin}/auth/confirm?type=recovery`,
  });
  if (error) throw new Error(error.message);

  await logAdminAction(admin, {
    actorId: actingUser.id,
    action: "user.password_reset_sent",
    targetTable: "profiles",
    targetId: userId,
  });
  return { email: target.email as string };
}

// Sets the password directly — no email round trip, for when the owner
// wants to hand someone working credentials right now rather than wait on
// a reset email (same reasoning as addTeamMember below).
export async function setCustomerPassword(userId: string, newPassword: string) {
  const { user: actingUser } = await requirePermission("users.suspend");
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (!target) throw new Error("That account couldn't be found.");
  await assertProfileEditable(admin, actingUser.id, target.role);

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(error.message);

  await logAdminAction(admin, { actorId: actingUser.id, action: "user.password_set", targetTable: "profiles", targetId: userId });
}

// Uploads a profile picture for a user the admin is editing — same public
// bucket and size/type checks as uploadServiceImage, just its own path
// prefix so avatars don't mix in with catalog images.
export async function uploadUserAvatar(formData: FormData) {
  await requirePermission("users.suspend");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Profile pictures must be under 3MB.");

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `avatars/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function setUserAvatar(userId: string, avatarUrl: string | null) {
  const { user: actingUser } = await requirePermission("users.suspend");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (target) await assertProfileEditable(admin, actingUser.id, target.role);
  const { error } = await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) throw new Error(error.message);
  await logAdminAction(admin, { actorId: actingUser.id, action: "user.avatar_set", targetTable: "profiles", targetId: userId });
  revalidateAdminPath(`/users/${userId}`);
}

// Permanently deletes a customer account. Deliberately the most guarded
// action on this page after promoteToSuperadmin: deleting auth.users
// cascades to profiles -> wallets/wallet_ledger/transactions (see
// supabase/schema.sql's `on delete cascade` chain), so this doesn't just
// remove a login, it erases their entire financial history. Refuses
// outright if there's still money on the account (get it to zero first —
// withdraw or adjust it away deliberately, not as a side effect of
// deleting someone), and requires retyping their email, same confirmation
// pattern as granting superadmin.
export async function deleteCustomerAccount(userId: string, confirmEmail: string) {
  const { user: actingUser } = await requirePermission("users.suspend");
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("role, email").eq("id", userId).single();
  if (!target) throw new Error("That account couldn't be found.");
  if (target.role === "superadmin") throw new Error("A Super Admin account can't be deleted here.");
  await assertProfileEditable(admin, actingUser.id, target.role);
  if ((target.email || "").trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    throw new Error("That email doesn't match — please retype it exactly to confirm.");
  }

  const { data: wallet } = await admin.from("wallets").select("balance, gift_locked").eq("user_id", userId).maybeSingle();
  if (wallet && (Number(wallet.balance) !== 0 || Number(wallet.gift_locked ?? 0) !== 0)) {
    throw new Error(`This account still has money on it ($${Number(wallet.balance).toFixed(2)}) — settle or withdraw it first, then delete.`);
  }

  await logAdminAction(admin, { actorId: actingUser.id, action: "user.delete", targetTable: "profiles", targetId: userId, meta: { email: target.email } });

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  revalidateAdminPath("/users");
}

// Operations Center's "stuck" queues (getAttentionQueue) used to be pure
// display — a list with nowhere to click. These give staff an actual way
// to resolve a stuck top-up or guest checkout instead of only being able
// to look at it and wait, or go dig through the gateway's own dashboard.
export async function adminForceCheckTopup(reference: string) {
  const { user: actingUser } = await requirePermission("transactions.rectify");
  const admin = createAdminClient();
  const { data: intent } = await admin.from("topup_intents").select("status, provider, meta").eq("reference", reference).single();
  if (!intent) throw new Error("That top-up couldn't be found.");
  if (intent.status !== "pending") return { checked: true, alreadyResolved: true };
  if (intent.provider !== "paynow") throw new Error("Manual check is only available for Paynow top-ups — mark it failed instead if the gateway confirms nothing happened.");

  const pollUrl = (intent.meta as { pollUrl?: string } | null)?.pollUrl;
  if (!pollUrl) throw new Error("This top-up has no status handle to check yet.");

  const { checkPaynowStatus } = await import("@/lib/payments/paynow");
  const { applyPaynowResult } = await import("@/lib/payments/paynow-result");
  const result = await checkPaynowStatus(pollUrl);
  if (!result.ok || !result.status) throw new Error(result.error || "Paynow didn't respond — try again shortly.");

  await applyPaynowResult(reference, result.status, result.fields);
  await logAdminAction(admin, { actorId: actingUser.id, action: "operations.force_check_topup", targetTable: "topup_intents", targetId: reference });
  revalidateAdminPath("/operations");
  return { checked: true };
}

export async function adminForceCheckGuestCheckout(reference: string) {
  const { user: actingUser } = await requirePermission("transactions.rectify");
  const admin = createAdminClient();
  const { data: intent } = await admin.from("guest_checkout_intents").select("status, provider, meta").eq("reference", reference).single();
  if (!intent) throw new Error("That checkout couldn't be found.");
  if (intent.status !== "pending") return { checked: true, alreadyResolved: true };
  if (intent.provider !== "paynow") throw new Error("Manual check is only available for Paynow checkouts — mark it failed instead if the gateway confirms nothing happened.");

  const pollUrl = (intent.meta as { pollUrl?: string } | null)?.pollUrl;
  if (!pollUrl) throw new Error("This checkout has no status handle to check yet.");

  const { checkPaynowStatus } = await import("@/lib/payments/paynow");
  const { applyPaynowResult } = await import("@/lib/payments/paynow-result");
  const result = await checkPaynowStatus(pollUrl);
  if (!result.ok || !result.status) throw new Error(result.error || "Paynow didn't respond — try again shortly.");

  await applyPaynowResult(reference, result.status, result.fields);
  await logAdminAction(admin, { actorId: actingUser.id, action: "operations.force_check_guest_checkout", targetTable: "guest_checkout_intents", targetId: reference });
  revalidateAdminPath("/operations");
  return { checked: true };
}

// Manual last resort when a gateway will never answer (dead pollUrl, no
// webhook ever arriving) — conditional on status still being 'pending' so
// a webhook that lands a split-second later can't be silently overwritten.
export async function adminMarkPendingFailed(kind: "topup" | "guest", reference: string) {
  const { user: actingUser } = await requirePermission("transactions.rectify");
  const admin = createAdminClient();
  const table = kind === "topup" ? "topup_intents" : "guest_checkout_intents";
  const { data: updated, error } = await admin.from(table).update({ status: "failed" }).eq("reference", reference).eq("status", "pending").select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("This was already resolved — nothing to change.");
  await logAdminAction(admin, { actorId: actingUser.id, action: `operations.mark_${kind}_failed`, targetTable: table, targetId: reference });
  revalidateAdminPath("/operations");
}

// Insurance products are synced from the underwriter (TariqifyIMS/Motions,
// or EnpassentIMS once that key exists — see src/lib/insurance/tariqify.ts
// and the sync cron) into insurance_products, but that table never had an
// admin UI of its own — this is it. Only the owner-editable override
// columns are writable here; name/description/premium/etc. are the
// underwriter's own data and get overwritten by the next sync regardless
// (see 2026-09-08-insurance-services.sql's comment on display_name).
export interface InsuranceProductPatch {
  displayName?: string | null;
  displayDescription?: string | null;
  markupPercent?: number;
  isActive?: boolean;
  isPurchasable?: boolean;
  sortOrder?: number;
}
export async function updateInsuranceProduct(id: string, patch: InsuranceProductPatch) {
  const { user: actingUser } = await requirePermission("catalog.manage");
  const admin = createAdminClient();

  const dbPatch: Record<string, unknown> = {};
  if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName?.trim() || null;
  if (patch.displayDescription !== undefined) dbPatch.display_description = patch.displayDescription?.trim() || null;
  if (patch.markupPercent !== undefined) {
    if (!(patch.markupPercent >= 0)) throw new Error("Markup can't be negative.");
    dbPatch.markup_percent = patch.markupPercent;
  }
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
  if (patch.isPurchasable !== undefined) dbPatch.is_purchasable = patch.isPurchasable;
  if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder;

  const { error } = await admin.from("insurance_products").update(dbPatch).eq("id", id);
  if (error) throw new Error(error.message);

  await logAdminAction(admin, { actorId: actingUser.id, action: "insurance_product.update", targetTable: "insurance_products", targetId: id, meta: dbPatch });
  revalidateAdminPath("/products");
  revalidatePath("/insurance");
  revalidatePath("/insurance/[productId]", "page");
}

function revalidateCatalog() {
  // getCategories/getAllServices/getNetworks are unstable_cache-wrapped
  // (see src/lib/data/queries.ts) precisely so customer pages don't
  // re-query Postgres on every view. updateTag (not revalidateTag) is the
  // one that guarantees a read-your-own-writes result — the admin who just
  // saved an edit must never see their own stale data on the very next
  // page load, which revalidateTag's stale-while-revalidate semantics
  // would allow.
  updateTag("catalog");
  revalidateAdminPath("/products");
  revalidatePath("/home");
  // "layout" cascades to /services/[categoryId] sub-routes too — a plain
  // "page" revalidation only covers the exact /services path.
  revalidatePath("/services", "layout");
}

export interface CategoryInput {
  id: string;
  name: string;
  icon: string;
  color: string;
  bg: string;
  description: string;
  sortOrder: number;
}

export async function createCategory(input: CategoryInput) {
  await requirePermission("catalog.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("service_categories").insert({
    id: input.id,
    name: input.name,
    icon: input.icon,
    color: input.color,
    bg: input.bg,
    description: input.description || null,
    sort_order: input.sortOrder,
  });
  if (error) throw new Error(error.message.includes("duplicate") ? "A category with that ID already exists." : error.message);
  revalidateCatalog();
}

export async function updateCategory(id: string, input: Omit<CategoryInput, "id">) {
  await requirePermission("catalog.manage");
  const admin = createAdminClient();
  await admin
    .from("service_categories")
    .update({
      name: input.name,
      icon: input.icon,
      color: input.color,
      bg: input.bg,
      description: input.description || null,
      sort_order: input.sortOrder,
    })
    .eq("id", id);
  revalidateCatalog();
}

export interface ServiceInput {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  icon: string;
  providerLabel: string;
  logoUrl: string;
  color: string;
  amountMode: "chips" | "bundles" | "packages" | "outstanding";
  chips: number[];
  outstanding: number | null;
  needsNetwork: boolean;
  idLabel: string;
  idPlaceholder: string;
  extraFieldLabel: string;
  extraFieldPlaceholder: string;
  isGift: boolean;
  sortOrder: number;
  costPercentage: number;
}

function serviceRow(input: ServiceInput) {
  return {
    category_id: input.categoryId,
    name: input.name,
    description: input.description || null,
    icon: input.icon,
    provider_label: input.providerLabel || null,
    logo_url: input.logoUrl || null,
    color: input.color,
    amount_mode: input.amountMode,
    chips: input.amountMode === "chips" ? input.chips : null,
    outstanding: input.amountMode === "outstanding" ? input.outstanding : null,
    needs_network: input.needsNetwork,
    id_label: input.idLabel,
    id_placeholder: input.idPlaceholder || null,
    extra_field_label: input.extraFieldLabel || null,
    extra_field_placeholder: input.extraFieldPlaceholder || null,
    is_gift: input.isGift,
    sort_order: input.sortOrder,
    cost_percentage: input.costPercentage,
  };
}

export async function createService(input: ServiceInput) {
  await requirePermission("catalog.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("services").insert({ id: input.id, ...serviceRow(input) });
  if (error) throw new Error(error.message.includes("duplicate") ? "A service with that ID already exists." : error.message);
  revalidateCatalog();
}

export async function updateService(id: string, input: ServiceInput) {
  await requirePermission("catalog.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("services").update(serviceRow(input)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateCatalog();
}

export async function toggleServiceActive(id: string, currentlyActive: boolean) {
  await requirePermission("catalog.manage");
  const admin = createAdminClient();
  await admin.from("services").update({ is_active: !currentlyActive }).eq("id", id);
  revalidateCatalog();
}

export async function deleteService(id: string) {
  const { user } = await requirePermission("catalog.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("services").delete().eq("id", id);
  if (error) {
    throw new Error(
      error.code === "23503"
        ? "This service has transaction history and can't be deleted. Deactivate it instead."
        : error.message
    );
  }
  await logAdminAction(admin, { actorId: user.id, action: "catalog.delete_service", targetTable: "services", targetId: id });
  revalidateCatalog();
}

function revalidateBanners() {
  revalidateAdminPath("/announcements");
  revalidatePath("/home");
}

export interface PromoBannerInput {
  kind: "image" | "announcement";
  imageUrl: string;
  linkUrl: string;
  title: string;
  body: string;
  audience: "customers" | "staff" | "all";
  placement: "home_top" | "grid_widget";
  sortOrder: number;
}

function promoBannerRow(input: PromoBannerInput) {
  return {
    kind: input.kind,
    image_url: input.kind === "image" ? input.imageUrl : null,
    link_url: input.linkUrl || null,
    title: input.kind === "announcement" ? input.title || null : null,
    body: input.kind === "announcement" ? input.body || null : null,
    audience: input.audience,
    placement: input.kind === "image" ? input.placement : "home_top",
    sort_order: input.sortOrder,
  };
}

export async function createPromoBanner(input: PromoBannerInput) {
  await requirePermission("announcements.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("promo_banners").insert(promoBannerRow(input));
  if (error) throw new Error(error.message);
  revalidateBanners();
}

export async function updatePromoBanner(id: string, input: PromoBannerInput) {
  await requirePermission("announcements.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("promo_banners").update(promoBannerRow(input)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateBanners();
}

export async function togglePromoBannerActive(id: string, currentlyActive: boolean) {
  await requirePermission("announcements.manage");
  const admin = createAdminClient();
  await admin.from("promo_banners").update({ is_active: !currentlyActive }).eq("id", id);
  revalidateBanners();
}

export async function deletePromoBanner(id: string) {
  await requirePermission("announcements.manage");
  const admin = createAdminClient();
  const { error } = await admin.from("promo_banners").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateBanners();
}
