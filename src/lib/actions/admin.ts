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
