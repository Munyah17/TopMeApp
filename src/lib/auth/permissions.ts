import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permission-keys";

export { PERMISSION_KEYS, PERMISSION_LABEL, type PermissionKey } from "@/lib/auth/permission-keys";

/**
 * Gate for a mutating admin action, stricter than a UI check — throws
 * unless the caller is superadmin (always allowed) or an active admin
 * whose team_members.permissions includes this key (checked via the
 * has_permission RPC, not trusted from the client).
 */
export async function requirePermission(perm: PermissionKey) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "superadmin") return { supabase, user };
  if (profile?.role !== "admin") throw new Error("forbidden");

  const { data: allowed } = await supabase.rpc("has_permission", { uid: user.id, perm });
  if (!allowed) throw new Error("forbidden");
  return { supabase, user };
}

/** All permission keys the current user actually has — powers the admin shell's nav. */
export async function getMyPermissions(): Promise<PermissionKey[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "superadmin") return [...PERMISSION_KEYS];
  if (profile?.role !== "admin") return [];

  const { data: member } = await supabase
    .from("team_members")
    .select("permissions")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return ((member?.permissions as string[] | undefined) ?? []).filter((p): p is PermissionKey =>
    (PERMISSION_KEYS as readonly string[]).includes(p)
  );
}
