import type { SupabaseClient } from "@supabase/supabase-js";
import { listBillers, type BillPayBiller, type BillPayProduct } from "@/lib/fulfillment/billpay";

/**
 * BillPay catalog sync — mirrors ListBillers into billpay_billers /
 * billpay_products, then auto-links products into service_provider_map so
 * the dynamic selector can route to them.
 *
 * Called from two places:
 *   - /api/billpay/webhook  (bearer-authed POST with changed biller codes)
 *   - /api/cron/sync-billpay-catalog (daily full refresh, safety net)
 *
 * The full ListBillers response is heavy — the webhook always passes the
 * changed codes; the cron does an unfiltered pull once a day.
 */

export interface SyncResult {
  billers: number;
  products: number;
  mapped: number;
  errors: string[];
}

/**
 * Heuristic auto-map: BillPay biller/product names → TopMe service ids.
 * First matching (biller OR product name) wins. Admin can override any row
 * in service_provider_map — auto-mapped rows are marked auto:true so a
 * manual edit is never overwritten.
 */
const BILLER_HINTS: { match: RegExp; service: string; network?: string }[] = [
  { match: /zetdc|zesa|electricity/i, service: "zesa" },
  { match: /dstv|multichoice|gotv/i, service: "dstv" },
  { match: /\bzol\b|liquid|telco/i, service: "zol" },
  { match: /telone|tel-one/i, service: "telone" },
  { match: /starlink/i, service: "starlink" },
  { match: /utande|dandemutande/i, service: "utande" },
  { match: /africom/i, service: "africom" },
  { match: /council|municipal|harare city|bulawayo city/i, service: "council" },
  { match: /school|university|college|fees|msu|nust|\buz\b|\bcut\b|\bhit\b/i, service: "schoolfees" },
  { match: /zimra|zinara|vehicle|licen[cs]e|gov|nssa|zbc|vid/i, service: "govfees" },
  { match: /fuel|petro|totalenergies|engen|\bpuma\b|shell/i, service: "fuel" },
  { match: /netflix/i, service: "netflix" },
  { match: /spotify/i, service: "spotify" },
  { match: /voucher|gift|token.*voucher/i, service: "vouchers" },
  { match: /airtime/i, service: "airtime" }, // generic airtime products
];

function hintService(billerName: string, product: BillPayProduct): { service: string; network?: string } | null {
  for (const hint of BILLER_HINTS) {
    if (hint.match.test(billerName) || hint.match.test(product.Name) || hint.match.test(product.Code)) {
      return { service: hint.service, network: hint.network };
    }
  }
  return null;
}

function billerRow(b: BillPayBiller) {
  return {
    code: b.Code,
    name: b.Name,
    description: b.Description ?? null,
    icon_url: b.IconUrl ?? null,
    logo_url: b.LogoUrl ?? null,
    reference_prefix: b.ReferencePrefix ?? null,
    enabled: b.Enabled !== false,
    member_number_label: b.MemberNumberFieldLabel ?? null,
    member_number_desc: b.MemberNumberFieldDesc ?? null,
    member_number_regex: b.MemberNumberFieldRegex ?? null,
    allow_multiple_products: b.AllowMultipleProductsPerPayment === true,
    vendor_must_invoice: b.VendorMustInvoicePayments === true,
    meta_title: b.MetaTitle ?? null,
    meta_description: b.MetaDescription ?? null,
    raw: b as unknown as Record<string, unknown>,
    synced_at: new Date().toISOString(),
  };
}

function productRow(billerCode: string, p: BillPayProduct) {
  return {
    biller_code: billerCode,
    code: p.Code,
    name: p.Name,
    description: p.Description ?? null,
    price: p.Price ?? null,
    department: p.Department ?? null,
    requires_forex: p.RequiresForex ?? null,
    returns_vouchers: p.ReturnsVouchers === true,
    icon_url: p.IconUrl ?? null,
    logo_url: p.LogoUrl ?? null,
    pre_purchase_instructions: p.PrePurchaseInstructions ?? null,
    post_purchase_instructions: p.PostPurchaseInstructions ?? null,
    amount_field_label: p.AmountFieldLabel ?? null,
    amount_field_desc: p.AmountFieldDesc ?? null,
    min_amount: p.MinAmount ?? null,
    max_amount: p.MaxAmount ?? null,
    new_product: p.NewProduct === true,
    invoice_title: p.InvoiceTitle ?? null,
    enabled: p.Enabled !== false,
    reminder_days: p.ReminderDays ?? null,
    auth_amount_mandated: p.AuthAmountMandated ?? null,
    allow_quantity: p.AllowSpecifyQuantity === true,
    quantity_field_label: p.QuantityFieldLabel ?? null,
    quantity_field_desc: p.QuantityFieldDesc ?? null,
    metadata_fields: (p.MetadataFields ?? []) as unknown as Record<string, unknown>[],
    raw: p as unknown as Record<string, unknown>,
    synced_at: new Date().toISOString(),
  };
}

export async function syncBillPayCatalog(admin: SupabaseClient, billerCodes?: string[]): Promise<SyncResult> {
  const result: SyncResult = { billers: 0, products: 0, mapped: 0, errors: [] };

  let billers: BillPayBiller[];
  try {
    billers = await listBillers(billerCodes);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "ListBillers failed");
    return result;
  }
  if (!billers.length) {
    result.errors.push("ListBillers returned no billers");
    return result;
  }

  // Upsert billers first (products FK on biller_code).
  const { error: billerError } = await admin
    .from("billpay_billers")
    .upsert(billers.map(billerRow), { onConflict: "code" });
  if (billerError) {
    result.errors.push(`billpay_billers upsert: ${billerError.message}`);
    return result;
  }
  result.billers = billers.length;

  // Upsert products in one pass, then reconcile mappings.
  const allProducts = billers.flatMap((b) => (b.Products ?? []).map((p) => productRow(b.Code, p)));
  if (allProducts.length) {
    const { error: productError } = await admin
      .from("billpay_products")
      .upsert(allProducts, { onConflict: "biller_code,code" });
    if (productError) result.errors.push(`billpay_products upsert: ${productError.message}`);
    result.products = allProducts.length;
  }

  // Auto-map into service_provider_map. Only inserts — never deletes or
  // overwrites admin-edited rows (onConflict do nothing), so manually set
  // cost/commission/priority survives every sync.
  for (const biller of billers) {
    for (const product of biller.Products ?? []) {
      if (product.Enabled === false || biller.Enabled === false) continue;
      const hint = hintService(biller.Name, product);
      if (!hint) continue;
      const { error } = await admin.from("service_provider_map").upsert(
        {
          service_id: hint.service,
          provider: "billpay",
          provider_product_id: biller.Code,
          provider_sku: product.Code,
          network_id: hint.network ?? "",
          cost_amount: product.Price ?? null,
          cost_currency: product.RequiresForex === true ? "USD" : "USD",
          enabled: true,
          meta: { auto: true, biller_name: biller.Name, product_name: product.Name },
        },
        { onConflict: "service_id,provider,provider_product_id,provider_sku,network_id", ignoreDuplicates: true }
      );
      if (!error) result.mapped += 1;
      else result.errors.push(`map ${biller.Code}/${product.Code}: ${error.message}`);
    }
  }

  return result;
}
