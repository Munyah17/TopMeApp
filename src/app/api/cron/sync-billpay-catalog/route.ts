import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncBillPayCatalog } from "@/lib/billpay/sync";
import { billpayConfigured } from "@/lib/fulfillment/billpay";

/**
 * Daily BillPay catalog refresh — safety net behind the biller-config
 * webhook. Pulls the full ListBillers catalog once a day so drift in
 * webhooks delivery can't leave stale products/prices live.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Credentials aren't issued yet — a skipped run is a success, not a 502
  // that would spam Vercel logs until Paynow approves the API key.
  if (!billpayConfigured()) {
    return NextResponse.json({ skipped: true, reason: "BILLPAY_USERNAME/BILLPAY_PASSWORD not configured" });
  }

  const admin = createAdminClient();
  const result = await syncBillPayCatalog(admin);

  if (result.errors.length && result.billers === 0) {
    return NextResponse.json({ error: result.errors.join("; ") }, { status: 502 });
  }
  return NextResponse.json({ ok: true, ...result });
}
