"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { logAdminAction } from "@/lib/actions/audit";

export async function updateSetting(key: string, value: unknown) {
  const { supabase, user } = await requirePermission("settings.manage");
  const { error } = await supabase.from("app_settings").update({ value, updated_at: new Date().toISOString(), updated_by: user.id }).eq("key", key);
  if (error) throw new Error(error.message);
  await logAdminAction(supabase, { actorId: user.id, action: "settings.update", targetTable: "app_settings", targetId: key, meta: { value } });
  revalidatePath("/admin/settings");
}

export async function toggleFeatureFlag(key: string, enabled: boolean) {
  const { supabase, user } = await requirePermission("flags.manage");
  const { error } = await supabase.from("feature_flags").update({ enabled, updated_at: new Date().toISOString(), updated_by: user.id }).eq("key", key);
  if (error) throw new Error(error.message);
  await logAdminAction(supabase, { actorId: user.id, action: "flags.toggle", targetTable: "feature_flags", targetId: key, meta: { enabled } });
  revalidatePath("/admin/settings/flags");
}

export async function logAppVersion(version: string, notes: string) {
  const { supabase, user } = await requirePermission("settings.manage");
  const { error } = await supabase.from("app_versions").insert({ version, notes: notes || null, released_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings/versions");
}
