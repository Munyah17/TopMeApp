"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { authPayment, payPayment, statusToResult, type BillPayRouting, type BillPayAuthData, type BillPayPaymentResponse } from "@/lib/fulfillment/billpay";
import { logTransactionEvent } from "@/lib/transaction-events";
import { alertTransaction } from "@/lib/email/transaction-alerts";
import type { Transaction } from "@/types/database";

/**
 * BillPay storefront — the topup.co.zw experience driven off our synced
 * billpay_billers/billpay_products catalog.
 *
 * Flow mirrors BillPay's contract exactly:
 *   1. authBillPayProduct — Action=AUTH BEFORE any money moves. Validates
 *      the member number against the biller's regex, confirms the member
 *      exists, and (for bill-style products) returns the balance owing —
 *      the customer sees "Pay $47.20 for J. Moyo, account 37132…" before
 *      committing, exactly like topup.co.zw.
 *   2. payBillPayProduct — re-runs AUTH server-side with the SAME
 *      reference (AUTH-reserved vouchers stay reserved), debits the
 *      wallet via wallet_pay (2% platform fee), then Action=PAY.
 *      PAY is the debit-committed step; failures after it auto-refund.
 */

interface BillerRow {
  code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  logo_url: string | null;
  enabled: boolean;
  member_number_label: string | null;
  member_number_desc: string | null;
  member_number_regex: string | null;
  allow_multiple_products: boolean;
}

interface ProductRow {
  biller_code: string;
  code: string;
  name: string;
  description: string | null;
  price: number | null;
  department: string | null;
  requires_forex: boolean | null;
  returns_vouchers: boolean;
  icon_url: string | null;
  logo_url: string | null;
  pre_purchase_instructions: string | null;
  post_purchase_instructions: string | null;
  amount_field_label: string | null;
  amount_field_desc: string | null;
  min_amount: number | null;
  max_amount: number | null;
  enabled: boolean;
  auth_amount_mandated: boolean | null;
  allow_quantity: boolean;
  quantity_field_label: string | null;
  metadata_fields: { Name?: string; Required?: boolean; Description?: string }[];
}

/** Catalog for the storefront — world-readable table, no auth needed. */
export async function getBillPayCatalog() {
  const supabase = await createClient();
  const [{ data: billers }, { data: products }] = await Promise.all([
    supabase.from("billpay_billers").select("*").eq("enabled", true).order("name"),
    supabase.from("billpay_products").select("*").eq("enabled", true).order("name"),
  ]);
  return {
    billers: (billers ?? []) as BillerRow[],
    products: (products ?? []) as ProductRow[],
  };
}

async function loadProduct(billerCode: string, productCode: string) {
  const admin = createAdminClient();
  const [{ data: biller }, { data: product }] = await Promise.all([
    admin.from("billpay_billers").select("*").eq("code", billerCode).single(),
    admin.from("billpay_products").select("*").eq("biller_code", billerCode).eq("code", productCode).single(),
  ]);
  if (!biller || !biller.enabled || !product || !product.enabled) return { biller: null, product: null };
  return { biller: biller as BillerRow, product: product as ProductRow };
}

function validateMemberNumber(biller: BillerRow, memberNumber: string): string | null {
  const trimmed = memberNumber.trim();
  if (!trimmed) return `${biller.member_number_label || "Member number"} is required.`;
  if (biller.member_number_regex) {
    try {
      if (!new RegExp(biller.member_number_regex).test(trimmed)) {
        return `Enter a valid ${biller.member_number_label || "member number"}.`;
      }
    } catch {
      // Bad regex upstream — don't block the customer on the biller's typo.
    }
  }
  return null;
}

function buildRouting(product: ProductRow, quantity?: number, metadata?: Record<string, string>): BillPayRouting {
  return {
    billerCode: product.biller_code,
    productCode: product.code,
    productPrice: product.price,
    requiresForex: product.requires_forex,
    department: product.department,
    quantity: product.allow_quantity ? quantity ?? 1 : 1,
    metadata: metadata && Object.keys(metadata).length ? [metadata] : undefined,
  };
}

export interface BillPayAuthPreview {
  ok: boolean;
  error?: string;
  reference?: string;
  memberName?: string;
  memberAddress?: string;
  accountDetails?: Record<string, string>;
  accountBalances?: Record<string, string>;
  accountBalance?: number | null;
  /** What the customer will be charged for the product itself (pre-fee). */
  price?: number | null;
  currency?: string;
  narration?: string;
}

/**
 * Step 1 — AUTH. Free, debits nothing. Validates the member number and
 * returns who/what the customer is about to pay for.
 */
export async function authBillPayProduct(params: {
  billerCode: string;
  productCode: string;
  memberNumber: string;
  amount?: number;
  quantity?: number;
  metadata?: Record<string, string>;
}): Promise<BillPayAuthPreview> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Log in to pay a bill." };

  const { biller, product } = await loadProduct(params.billerCode, params.productCode);
  if (!biller || !product) return { ok: false, error: "That product isn't available right now." };

  const memberError = validateMemberNumber(biller, params.memberNumber);
  if (memberError) return { ok: false, error: memberError };

  // Free-priced products need the amount up front — validate against the
  // product's own min/max before bothering the biller.
  if (product.price == null && product.auth_amount_mandated == null) {
    const amount = params.amount;
    if (!(amount != null && amount > 0)) return { ok: false, error: `Enter an amount${product.amount_field_label ? ` (${product.amount_field_label})` : ""}.` };
    if (product.min_amount != null && amount < product.min_amount) return { ok: false, error: `Minimum is ${product.min_amount}.` };
    if (product.max_amount != null && amount > product.max_amount) return { ok: false, error: `Maximum is ${product.max_amount}.` };
  }

  const reference = `BP${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
  try {
    const auth = await authPayment(
      buildRouting(product, params.quantity, params.metadata),
      params.memberNumber.trim(),
      reference,
      params.amount
    );
    if (auth.Status !== "Authorized") {
      return { ok: false, error: auth.Narration || auth.TechnicalNarration || `The biller couldn't authorize that (${auth.Status}).` };
    }
    const authData = auth.AuthData as BillPayAuthData | undefined;
    // Price priority: what AUTH says is owed > fixed product price > the
    // customer's own amount. Multiplied by quantity for countable products.
    const qty = product.allow_quantity ? params.quantity ?? 1 : 1;
    const authPrice = auth.Products?.find((p) => p.Code === product.code)?.Price
      ?? authData?.AccountBalance
      ?? null;
    const unit = product.price ?? authPrice ?? params.amount ?? null;
    return {
      ok: true,
      reference,
      memberName: auth.MemberName ?? authData?.MemberName,
      memberAddress: authData?.MemberAddress,
      accountDetails: authData?.AccountDetails,
      accountBalances: authData?.AccountBalances,
      accountBalance: authData?.AccountBalance,
      price: unit != null ? unit * qty : null,
      currency: auth.Currency ?? "USD",
      narration: auth.Narration,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reach the biller — try again." };
  }
}

/**
 * Step 2 — debit + PAY. Re-AUTHs with the same reference (idempotent on
 * BillPay's side; keeps reserved vouchers for the SAME reservation), then
 * wallet_pay debits, then PAY provisions. A failed PAY auto-refunds.
 */
export async function payBillPayProduct(params: {
  billerCode: string;
  productCode: string;
  memberNumber: string;
  reference: string;
  amount?: number;
  quantity?: number;
  metadata?: Record<string, string>;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to pay a bill." };

  const { biller, product } = await loadProduct(params.billerCode, params.productCode);
  if (!biller || !product) return { error: "That product isn't available right now." };

  const memberError = validateMemberNumber(biller, params.memberNumber);
  if (memberError) return { error: memberError };

  const routing = buildRouting(product, params.quantity, params.metadata);

  try {
    // Server-side AUTH — the authoritative price/member check. Never trust
    // a client-supplied total: the number we debit comes from THIS call.
    const auth = await authPayment(routing, params.memberNumber.trim(), params.reference, params.amount);
    if (auth.Status !== "Authorized") {
      return { error: auth.Narration || `The biller couldn't authorize that (${auth.Status}).` };
    }

    const qty = product.allow_quantity ? params.quantity ?? 1 : 1;
    const authPrice = auth.Products?.find((p) => p.Code === product.code)?.Price
      ?? auth.AuthData?.AccountBalance
      ?? null;
    const unit = product.price ?? authPrice ?? params.amount ?? null;
    if (!(unit != null && unit > 0)) {
      return { error: "Couldn't determine the amount for this product." };
    }
    const payable = Math.round(unit * qty * 100) / 100;

    const { data: txData, error: payError } = await supabase.rpc("wallet_pay", {
      p_service_id: `billpay-${biller.code.toLowerCase()}`,
      p_amount: payable,
      p_recipient: params.memberNumber.trim(),
      p_network_id: null,
      p_extra_value: JSON.stringify({
        biller_code: biller.code,
        product_code: product.code,
        product_name: product.name,
        member_name: auth.MemberName ?? auth.AuthData?.MemberName ?? null,
        billpay_reference: params.reference,
        quantity: qty,
        metadata: params.metadata ?? null,
      }),
      p_fulfillment_provider: "billpay",
      p_owner_label: biller.name,
      p_provider_cost: payable,
    });
    if (payError || !txData) {
      const msg = payError?.message ?? "wallet_pay failed";
      return { error: msg.includes("insufficient_funds") ? "Your wallet balance is too low — top up and try again." : msg };
    }
    const tx = txData as Transaction;

    void logTransactionEvent(admin, {
      transactionId: tx.id,
      reference: tx.reference,
      eventType: "payment_confirmed",
      message: `Paid $${tx.amount.toFixed(2)} from wallet — ${biller.name} ${product.name}.`,
    });

    let result;
    try {
      const pay = await payPayment(routing, params.memberNumber.trim(), params.reference, auth, payable);
      result = statusToResult(pay);
    } catch (e) {
      // Timeout/transport failure mid-PAY is NOT a clean failure — the debit
      // may have landed upstream. Record pending; the reconcile cron's
      // STATUS inquiry resolves it, never blind-retry.
      result = {
        status: "pending" as const,
        message: e instanceof Error ? e.message : "BillPay PAY did not respond — status inquiry will confirm.",
      };
    }

    void logTransactionEvent(admin, {
      transactionId: tx.id,
      reference: tx.reference,
      eventType: result.status === "fulfilled" ? "fulfillment_success" : result.status === "failed" ? "fulfillment_failed" : "fulfillment_started",
      message: result.message || `BillPay returned ${result.status}.`,
      meta: { provider: "billpay", providerRef: result.providerRef ?? null },
    });

    await admin.rpc("set_fulfillment_result", {
      p_transaction_id: tx.id,
      p_status: result.status,
      p_receipt: {
        provider: "billpay",
        providerRef: result.providerRef ?? null,
        biller: biller.name,
        product: product.name,
        member_number: params.memberNumber.trim(),
        message: result.message ?? null,
        ...(result.extra ?? {}),
      },
    });

    if (result.status === "failed") {
      void alertTransaction(admin, {
        outcome: "failed",
        reference: tx.reference,
        service: `${biller.name} — ${product.name}`,
        amount: tx.amount,
        fee: tx.fee,
        recipient: params.memberNumber.trim(),
        method: "wallet",
        customer: user.email ?? user.id,
        detail: `Paid but provisioning failed — ${result.message}`,
      });
      const { recordFailedFulfilmentRefund } = await import("@/lib/payments/refunds");
      const refund = await recordFailedFulfilmentRefund(admin, {
        transactionId: tx.id,
        reference: tx.reference,
        serviceName: `${biller.name} ${product.name}`,
        reason: result.message || "BillPay could not deliver this product.",
      });
      revalidatePath("/wallet");
      revalidatePath("/history");
      return {
        error: refund?.status === "paid"
          ? `Delivery failed — $${refund.amount.toFixed(2)} refunded to your wallet.`
          : "Delivery failed — your refund is being processed.",
      };
    }

    // Receipt SMSes to the customer's phone — one per entry (BillPay UAT).
    const smses = (result.extra?.receipt_smses as string[] | undefined) ?? [];
    if (result.status === "fulfilled" && smses.length) {
      const { data: payerProfile } = await admin.from("profiles").select("phone").eq("id", user.id).single();
      const member = params.memberNumber.trim();
      const phone = payerProfile?.phone ?? (/^(?:\+?263|0)7\d{8}$/.test(member.replace(/\s/g, "")) ? member : null);
      if (phone) {
        const { sendBillPayReceiptSmses } = await import("@/lib/sms/txtzw");
        void sendBillPayReceiptSmses({ admin, transactionId: tx.id, reference: tx.reference, phone, smses });
      }
    }

    void alertTransaction(admin, {
      outcome: "success",
      reference: tx.reference,
      service: `${biller.name} — ${product.name}`,
      amount: tx.amount,
      fee: tx.fee,
      recipient: params.memberNumber.trim(),
      method: "wallet",
      customer: user.email ?? user.id,
    });

    revalidatePath("/wallet");
    revalidatePath("/history");

    return {
      success: true,
      status: result.status, // "fulfilled" | "pending"
      transactionId: tx.id,
      reference: tx.reference,
      memberName: auth.MemberName ?? auth.AuthData?.MemberName ?? null,
      receipt: {
        vouchers: (result.extra?.vouchers as unknown[] | undefined) ?? [],
        receiptHtml: (result.extra?.receipt_html as string[] | undefined) ?? [],
        displayData: (result.extra?.display_data as Record<string, string> | undefined) ?? {},
        accountDetails: auth.AuthData?.AccountDetails ?? {},
        message: result.message ?? null,
        currency: (result.extra?.currency as string | undefined) ?? "USD",
        postPurchaseInstructions: product.post_purchase_instructions,
      },
    };
  } catch (error) {
    console.error("payBillPayProduct error:", error);
    return { error: error instanceof Error ? error.message : "Payment failed." };
  }
}

// --- Gateway checkout (Paynow / Stripe / EcoCash) --------------------------
// Mirrors the insurance checkout: AUTH resolves the real price first, the
// whole order is stored on an intent (including the BillPay reference �
// AUTH-reserved vouchers stay bound to it), the gateway charges the
// customer, and finalize runs PAY from the locked-in numbers. The client
// never supplies the amount.

export type BillPayGateway = "paynow" | "stripe" | "ecocash";

interface BillPayIntentApp {
  billerCode: string;
  billerName: string;
  productCode: string;
  productName: string;
  memberNumber: string;
  memberName: string | null;
  amount?: number;
  quantity: number;
  metadata?: Record<string, string>;
  billpayReference: string;
  /** Price AUTH returned (bill-style), else null � decides PAY payload. */
  authPrice: number | null;
  payable: number;
  currency: string;
  requiresForex: boolean | null;
  department: string | null;
}

export async function startBillPayCheckout(params: {
  gateway: BillPayGateway;
  billerCode: string;
  productCode: string;
  memberNumber: string;
  /** The BP reference from the AUTH preview � keeps the reservation. */
  authReference?: string;
  amount?: number;
  quantity?: number;
  metadata?: Record<string, string>;
  /** Gateway contact details — EcoCash push phone / receipt email. */
  contactEmail?: string;
  contactPhone?: string;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to pay a bill." };
  if (!["paynow", "stripe", "ecocash"].includes(params.gateway)) {
    return { error: "Unsupported payment method." };
  }

  const { biller, product } = await loadProduct(params.billerCode, params.productCode);
  if (!biller || !product) return { error: "That product isn't available right now." };
  const memberError = validateMemberNumber(biller, params.memberNumber);
  if (memberError) return { error: memberError };
  if (params.gateway === "ecocash" && !params.contactPhone) {
    const { data: p } = await admin.from("profiles").select("phone").eq("id", user.id).single();
    if (!p?.phone) return { error: "EcoCash needs a mobile number — enter one to continue." };
  }

  const routing = buildRouting(product, params.quantity, params.metadata);
  try {
    // Server-side AUTH � resolves the real price and locks the BillPay
    // reference into the intent before any gateway charge is initiated.
    const billpayReference = params.authReference || `BP${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
    const auth = await authPayment(routing, params.memberNumber.trim(), billpayReference, params.amount);
    if (auth.Status !== "Authorized") {
      return { error: auth.Narration || `The biller couldn't authorize that (${auth.Status}).` };
    }
    const qty = product.allow_quantity ? params.quantity ?? 1 : 1;
    const authPrice = auth.Products?.find((p) => p.Code === product.code)?.Price
      ?? auth.AuthData?.AccountBalance
      ?? null;
    const unit = product.price ?? authPrice ?? params.amount ?? null;
    if (!(unit != null && unit > 0)) return { error: "Couldn't determine the amount for this product." };
    const payable = Math.round(unit * qty * 100) / 100;

    const { calculatePlatformFee, calculateTopupFee } = await import("@/lib/fees");
    const platformFee = calculatePlatformFee(`billpay-${biller.code.toLowerCase()}`, payable);
    const gatewayFee = calculateTopupFee(params.gateway, payable + platformFee);
    const totalCharge = payable + platformFee + gatewayFee;

    const application: BillPayIntentApp = {
      billerCode: biller.code,
      billerName: biller.name,
      productCode: product.code,
      productName: product.name,
      memberNumber: params.memberNumber.trim(),
      memberName: auth.MemberName ?? auth.AuthData?.MemberName ?? null,
      amount: params.amount,
      quantity: qty,
      metadata: params.metadata,
      billpayReference,
      authPrice,
      payable,
      currency: auth.Currency ?? "USD",
      requiresForex: product.requires_forex,
      department: product.department,
    };

    const reference = `BPQ-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: intentError } = await admin.from("billpay_checkout_intents").insert({
      reference,
      user_id: user.id,
      application,
      amount: payable,
      fee: platformFee + gatewayFee,
      provider: params.gateway,
    });
    if (intentError) {
      console.error("BillPay intent insert failed:", intentError);
      return { error: "Couldn't start the checkout. Please try again." };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const confirmUrl = `${appUrl}/pay/guest/confirm?reference=${encodeURIComponent(reference)}`;

    if (params.gateway === "paynow") {
      const { initiatePaynowPayment } = await import("@/lib/payments/paynow");
      const result = await initiatePaynowPayment({
        reference,
        amount: totalCharge,
        authEmail: params.contactEmail || user.email || "",
        additionalInfo: `${biller.name} ${product.name}`,
        returnUrl: confirmUrl,
      });
      if (!result.ok || !result.browserUrl) {
        await failBillPayCheckout(reference, `Paynow initiation failed � ${result.error ?? "no redirect"}`);
        return { error: result.error || "Paynow couldn't start the payment." };
      }
      await admin.from("billpay_checkout_intents").update({ meta: { pollUrl: result.pollUrl } }).eq("reference", reference);
      return { success: true, gateway: "paynow" as const, reference, redirectUrl: result.browserUrl };
    }

    if (params.gateway === "stripe") {
      const { createGuestCheckoutSession } = await import("@/lib/payments/stripe");
      const session = await createGuestCheckoutSession({
        amount: totalCharge,
        reference,
        serviceName: `${biller.name} ${product.name}`,
        guestEmail: params.contactEmail || user.email || "",
        purpose: "billpay_payment",
      });
      if (!session.url) {
        await failBillPayCheckout(reference, "Stripe couldn't create a checkout session.");
        return { error: "Stripe couldn't start the payment." };
      }
      return { success: true, gateway: "stripe" as const, reference, redirectUrl: session.url };
    }

    // ecocash � push approval to the profile phone.
    const { data: p } = await admin.from("profiles").select("phone").eq("id", user.id).single();
    const { initiateEcocashPush } = await import("@/lib/payments/ecocash");
    const push = await initiateEcocashPush({ phone: p!.phone, amount: totalCharge, reference });
    if (!push.ok || !push.endUserId) {
      await failBillPayCheckout(reference, `EcoCash push failed � ${push.error ?? "no endUserId"}`);
      return { error: push.error || "EcoCash couldn't send the approval prompt." };
    }
    await admin.from("billpay_checkout_intents").update({ meta: { endUserId: push.endUserId } }).eq("reference", reference);
    return { success: true, gateway: "ecocash" as const, reference };
  } catch (error) {
    console.error("startBillPayCheckout error:", error);
    return { error: error instanceof Error ? error.message : "Couldn't start the checkout." };
  }
}

/**
 * After the gateway confirms the money: finalize the intent into a
 * transaction (atomic, idempotent) then run PAY with the stored BillPay
 * reference. Voucher/stock reservations made at AUTH stay bound to that
 * reference � that's why it lives in the intent, not regenerated here.
 */
export async function finalizeBillPayCheckout(reference: string) {
  const admin = createAdminClient();

  const { data: tx, error: finalizeError } = await admin.rpc("finalize_billpay_checkout", { p_reference: reference });
  if (finalizeError || !tx) {
    const { data: status } = await admin.rpc("get_billpay_checkout", { p_reference: reference });
    if (status?.status === "completed") return { success: true, alreadyProcessed: true };
    console.error("finalize_billpay_checkout failed:", finalizeError);
    return { error: "Payment couldn't be recorded." };
  }
  const transaction = tx as Transaction;

  const { data: intent } = await admin
    .from("billpay_checkout_intents")
    .select("*")
    .eq("reference", reference)
    .single();
  if (!intent) return { error: "Checkout record missing after payment." };
  const app = intent.application as BillPayIntentApp;

  void alertTransaction(admin, {
    outcome: "success",
    reference: transaction.reference,
    service: `${app.billerName} � ${app.productName}`,
    amount: transaction.amount,
    fee: transaction.fee,
    recipient: app.memberNumber,
    method: intent.provider,
  });

  try {
    // PAY from the intent's locked numbers. Reconstruct the AUTH response
    // shape payPayment needs: authPrice set ? AUTH returned the amount, so
    // TotalAmount/Price stay blank on PAY (bill-style semantics).
    const routing: BillPayRouting = {
      billerCode: app.billerCode,
      productCode: app.productCode,
      productPrice: app.authPrice != null ? null : app.payable / app.quantity,
      requiresForex: app.requiresForex,
      department: app.department,
      quantity: app.quantity,
      metadata: app.metadata ? [app.metadata] : undefined,
    };
    const authLike = {
      Status: "Authorized",
      Reference: app.billpayReference,
      Products: app.authPrice != null ? [{ Code: app.productCode, Price: app.authPrice }] : [],
    } as BillPayPaymentResponse;

    let result;
    try {
      const pay = await payPayment(routing, app.memberNumber, app.billpayReference, authLike, app.payable);
      result = statusToResult(pay);
    } catch (e) {
      // Transport failure mid-PAY is not a clean failure � pending; the
      // reconcile cron's STATUS inquiry resolves it.
      result = {
        status: "pending" as const,
        message: e instanceof Error ? e.message : "BillPay PAY did not respond � status inquiry will confirm.",
      };
    }

    void logTransactionEvent(admin, {
      transactionId: transaction.id,
      reference: transaction.reference,
      eventType: result.status === "fulfilled" ? "fulfillment_success" : result.status === "failed" ? "fulfillment_failed" : "fulfillment_started",
      message: result.message || `BillPay returned ${result.status}.`,
      meta: { provider: "billpay", providerRef: result.providerRef ?? null },
    });

    await admin.rpc("set_fulfillment_result", {
      p_transaction_id: transaction.id,
      p_status: result.status,
      p_receipt: {
        provider: "billpay",
        providerRef: result.providerRef ?? null,
        biller: app.billerName,
        product: app.productName,
        member_number: app.memberNumber,
        member_name: app.memberName,
        message: result.message ?? null,
        ...(result.extra ?? {}),
      },
    });

    // Receipt SMSes to the customer's phone � one per entry (UAT).
    const smses = (result.extra?.receipt_smses as string[] | undefined) ?? [];
    if (result.status === "fulfilled" && smses.length) {
      const { data: payerProfile } = await admin.from("profiles").select("phone").eq("id", intent.user_id).single();
      const phone = payerProfile?.phone ?? (/^(?:\+?263|0)7\d{8}$/.test(app.memberNumber.replace(/\s/g, "")) ? app.memberNumber : null);
      if (phone) {
        const { sendBillPayReceiptSmses } = await import("@/lib/sms/txtzw");
        void sendBillPayReceiptSmses({ admin, transactionId: transaction.id, reference: transaction.reference, phone, smses });
      }
    }

    if (result.status === "failed") {
      void alertTransaction(admin, {
        outcome: "failed",
        reference: transaction.reference,
        service: `${app.billerName} � ${app.productName}`,
        amount: transaction.amount,
        fee: transaction.fee,
        recipient: app.memberNumber,
        method: intent.provider,
        detail: `Paid via ${intent.provider} but provisioning failed � ${result.message}`,
      });
      const { recordFailedFulfilmentRefund } = await import("@/lib/payments/refunds");
      await recordFailedFulfilmentRefund(admin, {
        transactionId: transaction.id,
        reference: transaction.reference,
        serviceName: `${app.billerName} ${app.productName}`,
        reason: result.message || "BillPay could not deliver this product.",
      });
    }

    return { success: true, status: result.status };
  } catch (error) {
    console.error("finalizeBillPayCheckout error:", error);
    await admin.rpc("set_fulfillment_result", {
      p_transaction_id: transaction.id,
      p_status: "failed",
      p_receipt: { provider: "billpay", message: "fulfillment error" },
    });
    void alertTransaction(admin, {
      outcome: "failed",
      reference: transaction.reference,
      service: `${app.billerName} � ${app.productName}`,
      amount: transaction.amount,
      fee: transaction.fee,
      recipient: app.memberNumber,
      method: intent.provider,
      detail: `Paid but provisioning threw � ${error instanceof Error ? error.message : "unknown error"}`,
    });
    return { error: "Payment received but delivery failed � support has been notified." };
  }
}

export async function failBillPayCheckout(reference: string, detail?: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("fail_billpay_checkout", { p_reference: reference });
  void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: detail ?? "BillPay payment did not go through." });
}

/** Payer's own status poll � reference-gated, same trust model as guests. */
export async function getBillPayCheckoutStatus(reference: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_billpay_checkout", { p_reference: reference });
  if (error) {
    console.error("get_billpay_checkout failed:", error);
    return { status: "not_found" };
  }
  return data as { status: string; transaction?: Record<string, unknown> };
}

/** Manual/periodic status check for a pending billpay intent (paynow
 *  pollUrl / ecocash push status) � same shape as checkInsurancePaymentNow. */
export async function checkBillPayPaymentNow(reference: string) {
  const admin = createAdminClient();
  const { data: intent } = await admin
    .from("billpay_checkout_intents")
    .select("*")
    .eq("reference", reference)
    .single();
  if (!intent || intent.status !== "pending") {
    return { checked: true };
  }

  if (intent.provider === "paynow") {
    const pollUrl = (intent.meta as { pollUrl?: string })?.pollUrl;
    if (!pollUrl) return { checked: false };
    const { checkPaynowStatus } = await import("@/lib/payments/paynow");
    const result = await checkPaynowStatus(pollUrl);
    if (result.ok && result.status) {
      const { applyPaynowResult } = await import("@/lib/payments/paynow-result");
      await applyPaynowResult(reference, result.status, result.fields);
    }
    return { checked: true };
  }

  if (intent.provider === "ecocash") {
    const endUserId = (intent.meta as { endUserId?: string })?.endUserId;
    if (!endUserId) return { checked: false };
    const { getEcocashStatus } = await import("@/lib/payments/ecocash");
    const status = await getEcocashStatus(endUserId, reference);
    if (status === "completed") {
      await finalizeBillPayCheckout(reference);
    } else if (status === "failed" || status === "cancelled") {
      await failBillPayCheckout(reference, `EcoCash reported ${status}.`);
    }
    return { checked: true };
  }

  return { checked: false };
}
