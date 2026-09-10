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

export async function inviteTeamMember(input: { name: string; email: string; role: string }) {
  const { user } = await requirePermission("staff.manage");
  const admin = createAdminClient();

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.name },
  });
  if (error) throw new Error(error.message);

  await admin.from("team_members").insert({
    owner_id: user.id,
    user_id: invited.user?.id ?? null,
    invited_email: input.email,
    name: input.name,
    role: input.role,
    status: "invited",
  });

  revalidateAdminPath("/staff");
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
  if (target.role !== "customer") throw new Error("Only customer accounts can be edited here.");

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
