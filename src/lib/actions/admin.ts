"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

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

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "superadmin") throw new Error("forbidden");
  return { supabase, user };
}

// Uploads a product/service logo to the public "product-images" storage
// bucket and returns its public URL, ready to save on the service row.
export async function uploadServiceImage(formData: FormData) {
  await requireSuperadmin();
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

export async function createApiModule(input: {
  name: string;
  provider: string;
  category: string;
  key: string;
  webhookUrl?: string;
}) {
  const { user } = await requireSuperadmin();
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

  revalidatePath("/admin/apis");
}

export async function toggleApiModule(id: string, currentStatus: "active" | "inactive") {
  await requireSuperadmin();
  const admin = createAdminClient();
  await admin
    .from("api_modules")
    .update({ status: currentStatus === "active" ? "inactive" : "active" })
    .eq("id", id);
  revalidatePath("/admin/apis");
}

export async function inviteTeamMember(input: { name: string; email: string; role: string }) {
  const { user } = await requireSuperadmin();
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

  revalidatePath("/admin/team");
}

export async function togglePermission(memberId: string, permission: string, currentPermissions: string[]) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const next = currentPermissions.includes(permission)
    ? currentPermissions.filter((p) => p !== permission)
    : [...currentPermissions, permission];
  await admin.from("team_members").update({ permissions: next }).eq("id", memberId);
  revalidatePath("/admin/team");
}

// Suspends or reactivates a customer account: blocks sign-in via Supabase
// Auth's own ban_duration (a 100-year ban reads as "suspended", "none" lifts
// it) and mirrors the flag onto profiles so the admin list can show it
// without a separate auth.admin.listUsers() call per row.
export async function toggleAccountSuspension(userId: string, currentlySuspended: boolean) {
  const { user: actingUser } = await requireStaff();
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
  revalidatePath("/admin/customers");
}

function revalidateCatalog() {
  revalidatePath("/admin/products");
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
  await requireSuperadmin();
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
  await requireSuperadmin();
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
  validateMsg: string;
  mockName: string;
  mockSub: string;
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
    validate_msg: input.validateMsg || null,
    mock_name: input.mockName || null,
    mock_sub: input.mockSub || null,
    sort_order: input.sortOrder,
    cost_percentage: input.costPercentage,
  };
}

export async function createService(input: ServiceInput) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin.from("services").insert({ id: input.id, ...serviceRow(input) });
  if (error) throw new Error(error.message.includes("duplicate") ? "A service with that ID already exists." : error.message);
  revalidateCatalog();
}

export async function updateService(id: string, input: ServiceInput) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin.from("services").update(serviceRow(input)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateCatalog();
}

export async function toggleServiceActive(id: string, currentlyActive: boolean) {
  await requireSuperadmin();
  const admin = createAdminClient();
  await admin.from("services").update({ is_active: !currentlyActive }).eq("id", id);
  revalidateCatalog();
}

export async function deleteService(id: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin.from("services").delete().eq("id", id);
  if (error) {
    throw new Error(
      error.code === "23503"
        ? "This service has transaction history and can't be deleted. Deactivate it instead."
        : error.message
    );
  }
  revalidateCatalog();
}

function revalidateBanners() {
  revalidatePath("/admin/banners");
  revalidatePath("/home");
}

export interface PromoBannerInput {
  imageUrl: string;
  linkUrl: string;
  sortOrder: number;
}

export async function createPromoBanner(input: PromoBannerInput) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin.from("promo_banners").insert({
    image_url: input.imageUrl,
    link_url: input.linkUrl || null,
    sort_order: input.sortOrder,
  });
  if (error) throw new Error(error.message);
  revalidateBanners();
}

export async function updatePromoBanner(id: string, input: PromoBannerInput) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("promo_banners")
    .update({ image_url: input.imageUrl, link_url: input.linkUrl || null, sort_order: input.sortOrder })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateBanners();
}

export async function togglePromoBannerActive(id: string, currentlyActive: boolean) {
  await requireSuperadmin();
  const admin = createAdminClient();
  await admin.from("promo_banners").update({ is_active: !currentlyActive }).eq("id", id);
  revalidateBanners();
}

export async function deletePromoBanner(id: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin.from("promo_banners").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateBanners();
}
