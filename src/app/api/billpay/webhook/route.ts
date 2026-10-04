import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncBillPayCatalog } from "@/lib/billpay/sync";

/**
 * BillPay biller-config webhook.
 *
 * BillPay POSTs here when a biller's configuration changes (new products,
 * price changes, disabled billers). Per their docs the body is a JSON array
 * of changed biller codes, e.g. ["ZETDC","LIQUID"] — we re-pull just those
 * codes from ListBillers and upsert the local catalog.
 *
 * Auth: BillPay sends `Authorization: Bearer <token>` where token is the
 * value we registered with their ops (BILLPAY_WEBHOOK_BEARER). Empty body /
 * non-200 responses retry on their side, so failures return 500 to trigger
 * a retry rather than silently dropping a catalog change.
 */
export async function POST(request: Request) {
  const bearer = process.env.BILLPAY_WEBHOOK_BEARER;
  const authHeader = request.headers.get("authorization") ?? "";
  if (!bearer || authHeader !== `Bearer ${bearer}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let codes: string[] | null = null;
  try {
    const body = await request.json();
    if (Array.isArray(body)) {
      codes = body.filter((c): c is string => typeof c === "string");
    } else if (Array.isArray((body as { billerCodes?: string[] })?.billerCodes)) {
      // tolerate {billerCodes:[...]} too — docs show a bare array but the
      // object form costs nothing to accept.
      codes = (body as { billerCodes: string[] }).billerCodes;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!codes?.length) {
    return NextResponse.json({ error: "No biller codes in payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await syncBillPayCatalog(admin, codes);

  if (result.errors.length && result.billers === 0) {
    // Nothing synced at all — tell BillPay to retry by failing the call.
    return NextResponse.json({ error: result.errors.join("; ") }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    billers: result.billers,
    products: result.products,
    mapped: result.mapped,
    warnings: result.errors.length ? result.errors : undefined,
  });
}
