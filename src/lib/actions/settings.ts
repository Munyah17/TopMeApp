"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
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

// Top-up / gateway processing fee — the "Processing fee" line customers
// see on the wallet top-up screen and every gateway surcharge in checkout.
// Stored as {flat: dollars, pct: decimal} under app_settings key topup_fee;
// the admin UI takes the percent as a human number (2.5 means 2.5%, stored
// 0.025). Upsert so this works even before the seed migration has run.
export async function updateTopupFee(flat: number, percent: number) {
  const { supabase, user } = await requirePermission("settings.manage");
  if (!Number.isFinite(flat) || !Number.isFinite(percent) || flat < 0 || percent < 0 || percent > 100) {
    throw new Error("Enter a non-negative flat amount and a percentage between 0 and 100.");
  }
  const value = { flat, pct: percent / 100 };
  const { error } = await supabase.from("app_settings").upsert({
    key: "topup_fee",
    value,
    description: "Wallet top-up / gateway processing fee: $ flat + % of amount (uniform across all payment rails).",
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  await logAdminAction(supabase, { actorId: user.id, action: "settings.update_topup_fee", targetTable: "app_settings", targetId: "topup_fee", meta: { value } });
  // getTopupFeeConfig caches under the "settings" tag — updateTag (not
  // revalidateTag) guarantees the admin's own next render sees the new
  // rate immediately rather than a stale-while-revalidate window.
  updateTag("settings");
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
