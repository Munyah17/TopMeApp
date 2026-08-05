import type { SupabaseClient } from "@supabase/supabase-js";

// Thin, consistent wrapper around the admin_audit_log insert — called from
// the tail of every mutating admin action so there's one shape for "who did
// what, to what, when" rather than each action hand-rolling its own insert.
export async function logAdminAction(
  admin: SupabaseClient,
  entry: { actorId: string; action: string; targetTable?: string; targetId?: string; meta?: Record<string, unknown> }
) {
  await admin.from("admin_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    meta: entry.meta ?? {},
  });
}
