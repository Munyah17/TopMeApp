import { NextResponse } from "next/server";
import { syncInsuranceCatalog } from "@/lib/insurance/sync-catalog";

/**
 * Cron job to sync insurance products from TariqifyIMS.
 * Keeps the local catalog in sync and preserves admin display overrides
 * by only writing the upstream fields (display_* columns are untouched).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncInsuranceCatalog();
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    synced: result.synced,
    excluded: result.excluded,
    message: `Synced ${result.synced} insurance products from TariqifyIMS`,
  });
}
