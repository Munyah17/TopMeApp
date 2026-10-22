import { NextResponse } from "next/server";
import { staffApiDenied } from "@/lib/auth/api-staff";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const denied = await staffApiDenied(["reports.view", "apis.manage"]);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: errors, error } = await admin
    .from("debug_errors")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ errors });
}
