"use server";

import { randomUUID } from "node:crypto";
import { revalidateAdminPath } from "@/lib/actions/admin-cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { logAdminAction } from "@/lib/actions/audit";
import type { GuestGateway } from "@/lib/actions/guest-payments";

export async function updateSetting(key: string, value: unknown) {
  const { supabase, user } = await requirePermission("settings.manage");
  const { error } = await supabase.from("app_settings").update({ value, updated_at: new Date().toISOString(), updated_by: user.id }).eq("key", key);
  if (error) throw new Error(error.message);
  await logAdminAction(supabase, { actorId: user.id, action: "settings.update", targetTable: "app_settings", targetId: key, meta: { value } });
  revalidateAdminPath("/settings");
}

export async function toggleFeatureFlag(key: string, enabled: boolean) {
  const { supabase, user } = await requirePermission("flags.manage");
  const { error } = await supabase.from("feature_flags").update({ enabled, updated_at: new Date().toISOString(), updated_by: user.id }).eq("key", key);
  if (error) throw new Error(error.message);
  await logAdminAction(supabase, { actorId: user.id, action: "flags.toggle", targetTable: "feature_flags", targetId: key, meta: { enabled } });
  revalidateAdminPath("/settings/flags");
}

// Uploads a real brand banner (PNG) for one of the three gateway buttons on
// the payment-method picker — Wallet Balance has no third-party brand, so
// it's excluded and always stays the plain styled button.
export async function uploadPaymentBanner(gateway: GuestGateway, formData: FormData) {
  const { user } = await requirePermission("settings.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Banners must be under 2MB.");

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${gateway}-${randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage.from("payment-banners").upload(path, file, { contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = admin.storage.from("payment-banners").getPublicUrl(path);

  const { data: row } = await admin.from("app_settings").select("value").eq("key", "payment_method_banners").single();
  const next = { ...((row?.value as Record<string, string>) ?? {}), [gateway]: publicUrlData.publicUrl };

  const { error } = await admin.from("app_settings").update({ value: next, updated_at: new Date().toISOString(), updated_by: user.id }).eq("key", "payment_method_banners");
  if (error) throw new Error(error.message);

  await logAdminAction(admin, { actorId: user.id, action: "settings.upload_payment_banner", targetTable: "app_settings", targetId: "payment_method_banners", meta: { gateway } });
  revalidateAdminPath("/settings");
  return publicUrlData.publicUrl;
}

export async function removePaymentBanner(gateway: GuestGateway) {
  const { user } = await requirePermission("settings.manage");
  const admin = createAdminClient();

  const { data: row } = await admin.from("app_settings").select("value").eq("key", "payment_method_banners").single();
  const next = { ...((row?.value as Record<string, string>) ?? {}) };
  delete next[gateway];

  const { error } = await admin.from("app_settings").update({ value: next, updated_at: new Date().toISOString(), updated_by: user.id }).eq("key", "payment_method_banners");
  if (error) throw new Error(error.message);

  await logAdminAction(admin, { actorId: user.id, action: "settings.remove_payment_banner", targetTable: "app_settings", targetId: "payment_method_banners", meta: { gateway } });
  revalidateAdminPath("/settings");
}

export async function logAppVersion(version: string, notes: string) {
  const { supabase, user } = await requirePermission("settings.manage");
  const { error } = await supabase.from("app_versions").insert({ version, notes: notes || null, released_by: user.id });
  if (error) throw new Error(error.message);
  revalidateAdminPath("/settings/versions");
}
