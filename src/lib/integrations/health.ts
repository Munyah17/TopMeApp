import type { SupabaseClient } from "@supabase/supabase-js";

export type IntegrationId = "paynow" | "stripe" | "ecocash" | "vitalpay" | "vitalpay_gateway";

/**
 * Records a real success/failure for one of the four payment/fulfillment
 * integrations, called from the actual webhook/poll routes that talk to
 * them — never a synthetic "everything's fine" heartbeat, so
 * /admin/system-health always shows genuine last-known-good state.
 */
export async function recordIntegrationHealth(
  admin: SupabaseClient,
  id: IntegrationId,
  result: { success: boolean; error?: string }
) {
  const now = new Date().toISOString();
  if (result.success) {
    await admin.from("integration_health").update({ last_success_at: now, consecutive_failures: 0, updated_at: now }).eq("id", id);
  } else {
    const { data: current } = await admin.from("integration_health").select("consecutive_failures").eq("id", id).single();
    await admin
      .from("integration_health")
      .update({
        last_failure_at: now,
        last_error: result.error ?? null,
        consecutive_failures: (current?.consecutive_failures ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", id);
  }
}
