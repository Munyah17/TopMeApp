import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

// Vercel sets x-forwarded-for on every request; the first entry is the
// real client. Never trust this for identity/authorization — it's only
// used here to throttle abuse, and a spoofed value at worst makes someone
// share a bucket with a fake IP, not bypass money validation (that's
// still enforced server-side wherever the actual charge happens).
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

// Throws a friendly, non-technical error when a caller has hit the limit.
// See supabase/migrations/2026-09-13-rate-limiting.sql for check_rate_limit —
// DB-backed on purpose, since a Vercel function has no memory shared
// between invocations for an in-process counter to live in.
export async function assertRateLimit(bucket: string, identifier: string, max: number, windowSeconds: number) {
  const admin = createAdminClient();
  const { data: allowed, error } = await admin.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_identifier: identifier,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  // Fail open, not closed — a rate-limit outage should never be the thing
  // that stops a real customer from paying.
  if (error) {
    console.error(`[rate-limit] check failed for ${bucket}:`, error.message);
    return;
  }
  if (!allowed) {
    throw new Error("Too many attempts — please wait a few minutes and try again.");
  }
}
