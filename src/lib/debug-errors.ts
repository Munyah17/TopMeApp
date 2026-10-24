import { createAdminClient } from "@/lib/supabase/server";

export async function logDebugError(error: Error, context: {
  serviceId?: string;
  userId?: string;
  requestPath?: string;
  requestMethod?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const admin = createAdminClient();
    const { error: insertError } = await admin.from("debug_errors").insert({
      error_message: error.message,
      error_stack: error.stack || null,
      error_type: error.name,
      service_id: context.serviceId || null,
      user_id: context.userId || null,
      request_path: context.requestPath || null,
      request_method: context.requestMethod || null,
      metadata: context.metadata || {},
    });
    if (insertError) {
      // Some deployments have not applied the debug_errors migration yet.
      // Keep diagnostics in private server logs rather than losing the cause.
      console.error("[payment-debug]", error, {
        serviceId: context.serviceId,
        requestPath: context.requestPath,
        loggingErrorCode: insertError.code,
      });
    }
  } catch (e) {
    // Don't throw if logging fails - would cause infinite loop
    console.error("[payment-debug]", error, "Failed to persist diagnostics:", e);
  }
}
