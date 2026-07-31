"use server";

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
        ? "This service has transaction history and can't be deleted — deactivate it instead."
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
