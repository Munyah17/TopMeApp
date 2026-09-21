"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createOrGetClient, getQuote, createPolicy, getPolicy, recordPayment as recordTariqifyPayment, createTicket as createTariqifyTicket, getProducts as getTariqifyProducts } from "@/lib/insurance/tariqify";
import { enrichInsuranceProduct } from "@/lib/insurance/types";
import { isExcludedProduct } from "@/lib/insurance/exclusions";
import { calculateTopupFee } from "@/lib/fees";
import { initiatePaynowPayment, checkPaynowStatus } from "@/lib/payments/paynow";
import { applyPaynowResult } from "@/lib/payments/paynow-result";
import { createGuestCheckoutSession } from "@/lib/payments/stripe";
import { initiateEcocashPush, getEcocashStatus } from "@/lib/payments/ecocash";
import { logTransactionEvent } from "@/lib/transaction-events";
import { alertTransaction } from "@/lib/email/transaction-alerts";
import { revalidatePath } from "next/cache";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Get a quote for an insurance product
 */
export async function getInsuranceQuote(params: {
  productId: string;
  nationalId: string;
  fieldValues?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Authentication required" };
  }

  const { data: product } = await supabase
    .from("insurance_products")
    .select("provider, is_purchasable")
    .eq("id", params.productId)
    .single();
  if (!product || !product.is_purchasable) {
    return { error: "This product isn't available to buy yet." };
  }

  try {
    const quote = await getQuote({
      product_id: params.productId,
      national_id: params.nationalId,
      field_values: params.fieldValues,
    });

    return { success: true, quote };
  } catch (error) {
    console.error("Quote error:", error);
    return { error: error instanceof Error ? error.message : "Failed to get quote" };
  }
}

/** One dependant on a cover — same shape the Motions /apply form collects. */
export interface InsuranceDependant {
  name: string;
  relationship?: string;
  dob?: string;
  nationalId?: string;
}

/** One cover line in an application — a product plus its dependants. */
export interface CoverSelectionInput {
  productId: string;
  dependants?: InsuranceDependant[];
}

/** Tariqify payment statuses that count as "confirmed" on their side. */
const CONFIRMED_PAYMENT_STATUSES = new Set(["recorded", "confirmed", "completed", "success", "paid", "successful"]);

interface DependantsPayload {
  name: string;
  relationship?: string;
  dob?: string;
  national_id?: string;
}

/**
 * Everything that happens AFTER money has moved, identical for the wallet
 * path (wallet_pay already debited) and the gateway path (Paynow/Stripe/
 * EcoCash already captured): create the Tariqify policy, write the local
 * policy + premium-payment rows, then dual-confirm the payment landed on
 * the underwriter's side. A mismatch marks the policy pending_verification,
 * files a Tariqify ticket, and raises an urgent admin task — the customer
 * is never told a payment failed when it may have succeeded.
 */
async function issuePolicyAfterPayment(opts: {
  admin: Admin;
  userId: string;
  localClientId: string;
  tariqifyClientId: string;
  nationalId: string;
  fullName: string;
  product: Record<string, unknown>;
  productId: string;
  dependants: DependantsPayload[];
  headCount: number;
  basePremium: number;
  markupAmount: number;
  totalPremium: number;
  currency: string;
  transactionId: string;
}): Promise<{ policy?: Record<string, unknown>; error?: string; pendingVerification?: boolean }> {
  const { admin, product, productId, dependants, headCount, basePremium, markupAmount, totalPremium, currency } = opts;
  const productName = String(product.name ?? productId);

  // Create policy in TariqifyIMS — premium is the per-period total for all
  // members, dependants forwarded so the underwriter's record matches the
  // application exactly.
  const tariqifyPolicy = await createPolicy({
    product_id: productId,
    client_id: opts.tariqifyClientId,
    premium: basePremium,
    currency,
    dependants,
  });

  // Local policy record
  const { data: localPolicy, error: policyError } = await admin
    .from("insurance_policies")
    .insert({
      policy_number: tariqifyPolicy.policy_number,
      product_id: productId,
      profile_id: opts.userId,
      insurance_client_id: opts.localClientId,
      base_premium: basePremium,
      markup_amount: markupAmount,
      total_premium: totalPremium,
      currency,
      status: "active",
      transaction_id: opts.transactionId,
      raw: { ...tariqifyPolicy.raw, dependants, members: headCount },
    })
    .select()
    .single();

  if (policyError || !localPolicy) {
    return { error: "Failed to create policy record" };
  }

  // Record payment with TariqifyIMS
  const tariqifyPayment = await recordTariqifyPayment({
    policy_number: tariqifyPolicy.policy_number,
    amount: basePremium,
    currency,
  });

  // Dual confirmation — the money already moved on TopMe's side, so the
  // payment must also be confirmed on Tariqify's: the payment record's own
  // status AND the policy it was recorded against must both check out.
  let paymentConfirmed = CONFIRMED_PAYMENT_STATUSES.has(tariqifyPayment.status.toLowerCase());
  let policyStatus = tariqifyPolicy.status;
  try {
    const check = await getPolicy(tariqifyPolicy.policy_number);
    policyStatus = check.status;
  } catch (checkError) {
    console.error("Policy re-check failed:", checkError);
    paymentConfirmed = false;
  }
  const verified = paymentConfirmed && Boolean(policyStatus);

  // Local payment record — flagged for manual review when the dual
  // confirmation didn't come back clean.
  const { error: paymentRecordError } = await admin
    .from("insurance_premium_payments")
    .insert({
      policy_id: localPolicy.id,
      amount: basePremium,
      transaction_id: opts.transactionId,
      tariqify_payment_id: tariqifyPayment.id,
      status: verified ? "recorded_with_provider" : "pending_review",
      raw: { ...tariqifyPayment.raw, verification: { payment_status: tariqifyPayment.status, policy_status: policyStatus } },
    });

  if (paymentRecordError) {
    console.error("Failed to record payment:", paymentRecordError);
    // Non-fatal - policy is created, payment record can be reconciled later
  }

  if (!verified) {
    await admin
      .from("insurance_policies")
      .update({ status: "pending_verification" })
      .eq("id", localPolicy.id);

    // Notify Tariqify — a ticket on their side so their team can trace the
    // payment from their end.
    try {
      await createTariqifyTicket({
        policy_number: tariqifyPolicy.policy_number,
        client_id: opts.tariqifyClientId,
        subject: `Payment verification needed — ${tariqifyPolicy.policy_number}`,
        message:
          `TopMe recorded a premium payment of ${currency} ${basePremium.toFixed(2)} for policy ` +
          `${tariqifyPolicy.policy_number} (product ${productId}, client ${opts.fullName}, ` +
          `national ID ${opts.nationalId}), but the payment status came back as ` +
          `"${tariqifyPayment.status}" and the policy status as "${policyStatus}". ` +
          `Please confirm receipt on your side.`,
      });
    } catch (ticketError) {
      console.error("Failed to file Tariqify ticket:", ticketError);
    }

    // Notify TopMe superadmins — an urgent task in the admin console so a
    // human verifies before the customer is told they're covered.
    await admin.from("admin_tasks").insert({
      title: `Verify insurance payment — ${tariqifyPolicy.policy_number}`,
      description:
        `Charged ${currency} ${totalPremium.toFixed(2)} for ${productName} ` +
        `(${opts.fullName}, ${opts.nationalId}), but Tariqify returned payment status ` +
        `"${tariqifyPayment.status}" / policy status "${policyStatus}". ` +
        `A ticket was filed with Motions. Confirm the payment landed, then set the policy ` +
        `back to active and the premium payment to recorded_with_provider.`,
      priority: "urgent",
      related_table: "insurance_policies",
      related_id: localPolicy.id,
    });
  }

  return { policy: localPolicy, pendingVerification: !verified || undefined };
}

/**
 * Purchase one or more insurance policies from a single Apply-for-Cover
 * submission — the same application shape motions.co.zw/apply sends: each
 * cover carries its own dependants, and non-agriculture covers are priced
 * per member (policyholder + each named dependant) while agriculture is a
 * flat annual premium.
 *
 * The client is registered with TariqifyIMS once, then each selected
 * product runs the full flow — quote → wallet charge → policy creation →
 * payment recording → dual confirmation (the payment record AND the
 * policy are re-fetched from Tariqify so both sides must agree the money
 * landed). A mismatch marks the policy pending_verification, the payment
 * pending_review, files a ticket with Tariqify, and raises an urgent
 * admin task for manual verification — the customer is never told a
 * payment failed when it may have succeeded.
 */
export async function purchaseInsurancePolicy(params: {
  selections: CoverSelectionInput[];
  nationalId: string;
  fullName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  occupation?: string;
  fieldValues?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Authentication required" };
  }

  // De-dupe by product — Motions treats picking the same product twice as
  // an error (dependants belong on one row), so merge is never ambiguous.
  const selections = params.selections.filter((s) => s.productId);
  const seen = new Set<string>();
  const deduped = selections.filter((s) => (seen.has(s.productId) ? false : (seen.add(s.productId), true)));
  if (deduped.length === 0) {
    return { error: "Choose at least one cover to buy." };
  }

  try {
    // Register (or fetch) the client in TariqifyIMS once for the whole
    // submission — every policy below is written against this client id.
    const tariqifyClient = await createOrGetClient({
      national_id: params.nationalId,
      full_name: params.fullName,
      phone: params.phone,
      email: params.email,
      date_of_birth: params.dateOfBirth,
      address: params.address,
      occupation: params.occupation,
    });

    // Create/update the local client record once, carrying the extra
    // application fields in `raw` alongside Tariqify's own response.
    const { data: localClient, error: clientError } = await admin
      .from("insurance_clients")
      .upsert(
        {
          profile_id: user.id,
          national_id: params.nationalId,
          full_name: params.fullName,
          phone: params.phone,
          tariqify_client_id: tariqifyClient.id,
          raw: {
            ...tariqifyClient.raw,
            application: {
              email: params.email ?? null,
              date_of_birth: params.dateOfBirth ?? null,
              address: params.address ?? null,
              occupation: params.occupation ?? null,
            },
          },
        },
        {
          onConflict: "profile_id,national_id",
        }
      )
      .select()
      .single();

    if (clientError || !localClient) {
      return { error: "Failed to create client record" };
    }

    const policies: Record<string, unknown>[] = [];
    const failures: { productId: string; error: string }[] = [];
    let pendingVerification = false;

    for (const selection of deduped) {
      const productId = selection.productId;
      // Named dependants only — blank rows the customer added but never
      // filled in don't count toward the per-head price.
      const dependants = (selection.dependants ?? []).filter((d) => d.name.trim());
      // Set only once wallet_pay has debited — lets the catch below tell a
      // "paid but issuance threw" failure (ops must be alerted) apart from a
      // pre-payment one (no money moved, nothing to report).
      let charged: { reference: string; productName: string; basePremium: number; markupAmount: number } | null = null;
      try {
        // 1. Get product details
        const { data: product, error: productError } = await admin
          .from("insurance_products")
          .select("*")
          .eq("id", productId)
          .eq("is_active", true)
          .single();

        if (productError || !product) {
          failures.push({ productId, error: "Product not found or inactive" });
          continue;
        }
        if (!product.is_purchasable) {
          failures.push({ productId, error: `${product.name} isn't available to buy yet.` });
          continue;
        }

        // 2. Get quote — dependants ride along in field_values so the
        // underwriter sees the full application, not just the principal.
        const quote = await getQuote({
          product_id: productId,
          national_id: params.nationalId,
          field_values: {
            ...params.fieldValues,
            dependants: dependants.map((d) => ({
              name: d.name.trim(),
              relationship: d.relationship?.trim() || undefined,
              dob: d.dob || undefined,
              national_id: d.nationalId?.trim() || undefined,
            })),
          },
        });

        if (!quote.eligible) {
          failures.push({ productId, error: quote.message || `Not eligible for ${product.name}` });
          continue;
        }

        // 3. Per-head pricing, same as Motions: non-agriculture covers are
        // priced per member (policyholder + each named dependant);
        // agriculture is a flat annual premium. Markup applies per head.
        const perHead = product.category !== "agriculture";
        const headCount = perHead ? 1 + dependants.length : 1;
        const basePremium = quote.base_premium * headCount;
        const markupPercent = Number(product.markup_percent);
        const markupAmount = basePremium * (markupPercent / 100);
        const totalPremium = basePremium + markupAmount;

        // 4. Charge wallet (using wallet_pay RPC). p_amount is the base
        // premium and p_fee the markup — together exactly the "Charged
        // today" total the form showed. (Before p_fee existed, wallet_pay
        // added its own 2% platform fee on top of p_amount=totalPremium,
        // silently debiting MORE than the displayed total.) owner_label/
        // provider_cost are passed explicitly — TopMe is Motions
        // Microinsurance's agent/dealer, not an insurer, selling under
        // their licence, so the audit trail must say so the same way every
        // other service records who it's "sold by TopMe, processed and
        // paid to <owner_label>". provider_cost is the real base_premium
        // from the live quote above, not a guessed percentage (there's no
        // `services` row for insurance products at all — see
        // 2026-09-13-wallet-pay-explicit-attribution.sql for why the normal
        // cost_percentage lookup silently produced 0 here).
        const { data: transaction, error: paymentError } = await admin.rpc("wallet_pay", {
          p_service_id: `insurance-${productId}`,
          p_amount: basePremium,
          p_recipient: params.nationalId,
          p_network_id: null,
          p_extra_value: JSON.stringify({ product_id: productId, client_id: localClient.id, members: headCount }),
          p_fulfillment_provider: "insurance",
          p_owner_label: "Motions Microinsurance",
          p_provider_cost: basePremium,
          p_fee: markupAmount,
        });

        if (paymentError) {
          console.error("Wallet payment error:", paymentError);
          void alertTransaction(admin, {
            outcome: "failed",
            reference: `wallet_pay:insurance-${productId}`,
            service: `Insurance — ${product.name}`,
            amount: totalPremium,
            recipient: params.nationalId,
            method: "wallet",
            customer: user.email ?? user.id,
            detail: paymentError.message,
          });
          failures.push({ productId, error: paymentError.message || "Payment failed" });
          continue;
        }
        charged = { reference: transaction.reference, productName: String(product.name ?? productId), basePremium, markupAmount };

        // 5-9. Policy creation → payment recording → dual confirmation —
        // shared with the gateway path (see issuePolicyAfterPayment).
        const issued = await issuePolicyAfterPayment({
          admin,
          userId: user.id,
          localClientId: localClient.id,
          tariqifyClientId: tariqifyClient.id,
          nationalId: params.nationalId,
          fullName: params.fullName,
          product,
          productId,
          dependants: dependants.map((d) => ({
            name: d.name.trim(),
            relationship: d.relationship?.trim() || undefined,
            dob: d.dob || undefined,
            national_id: d.nationalId?.trim() || undefined,
          })),
          headCount,
          basePremium,
          markupAmount,
          totalPremium,
          currency: quote.currency,
          transactionId: transaction.id,
        });

        if (issued.error) {
          void alertTransaction(admin, {
            outcome: "failed",
            reference: transaction.reference,
            service: `Insurance — ${product.name}`,
            amount: basePremium,
            fee: markupAmount,
            recipient: params.nationalId,
            method: "wallet",
            customer: user.email ?? user.id,
            detail: `Paid but policy issuance failed — ${issued.error}`,
          });
          failures.push({ productId, error: issued.error });
          continue;
        }
        // Wallet debited + policy issued — the transaction succeeded.
        void alertTransaction(admin, {
          outcome: "success",
          reference: transaction.reference,
          service: `Insurance — ${product.name}`,
          amount: basePremium,
          fee: markupAmount,
          recipient: params.nationalId,
          method: "wallet",
          customer: user.email ?? user.id,
          detail: issued.pendingVerification ? "Issued — underwriter confirmation pending" : null,
        });
        if (issued.pendingVerification) pendingVerification = true;
        policies.push(issued.policy!);
      } catch (productError) {
        console.error(`Insurance purchase failed for ${productId}:`, productError);
        if (charged) {
          void alertTransaction(admin, {
            outcome: "failed",
            reference: charged.reference,
            service: `Insurance — ${charged.productName}`,
            amount: charged.basePremium,
            fee: charged.markupAmount,
            recipient: params.nationalId,
            method: "wallet",
            customer: user.email ?? user.id,
            detail: `Paid but policy issuance threw — ${productError instanceof Error ? productError.message : "unknown error"}`,
          });
        }
        failures.push({ productId, error: productError instanceof Error ? productError.message : "Purchase failed" });
      }
    }

    revalidatePath("/account");
    revalidatePath("/history");

    if (policies.length === 0) {
      return { error: failures[0]?.error || "Failed to purchase insurance" };
    }

    return {
      success: true,
      policies,
      // Surface partial failures so the UI can say which covers didn't go
      // through even though others did.
      failures: failures.length > 0 ? failures : undefined,
      // True when at least one policy's payment couldn't be dual-confirmed —
      // the UI shows "pending verification" instead of a hard success.
      pendingVerification: pendingVerification || undefined,
    };
  } catch (error) {
    console.error("Insurance purchase error:", error);
    return { error: error instanceof Error ? error.message : "Failed to purchase insurance" };
  }
}

/** Gateways insurance checkout can start — same rails as guest checkout. */
export type InsuranceGateway = "paynow" | "stripe" | "ecocash";

/** One priced cover line stored on the intent — recomputed server-side. */
interface PricedLine {
  productId: string;
  dependants: DependantsPayload[];
  headCount: number;
  basePremium: number;
  markupAmount: number;
  totalPremium: number;
  currency: string;
}

/**
 * Start an insurance checkout on a real payment rail (Paynow hosted page,
 * Stripe checkout, or EcoCash push). Mirrors startGuestCheckout: the whole
 * order is re-priced server-side from live Tariqify quotes — the client's
 * displayed total is never trusted — then the full application payload is
 * stored on an intent so the webhook/redirect can finish the policy flow
 * with nothing but the reference.
 *
 * The customer pays base premiums + markup + the gateway's own surcharge
 * (calculateTopupFee — the rail's cut isn't recoverable from a wallet
 * funding step here, same gap fixed for guest checkout 2026-09-12).
 */
export async function startInsuranceCheckout(params: {
  gateway: InsuranceGateway;
  selections: CoverSelectionInput[];
  nationalId: string;
  fullName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  occupation?: string;
  fieldValues?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Authentication required" };
  }
  if (!["paynow", "stripe", "ecocash"].includes(params.gateway)) {
    return { error: "Unsupported payment method." };
  }
  if (params.gateway === "ecocash" && !params.phone) {
    return { error: "EcoCash needs the mobile number to push the approval to." };
  }

  const seen = new Set<string>();
  const deduped = params.selections.filter((s) => s.productId && (seen.has(s.productId) ? false : (seen.add(s.productId), true)));
  if (deduped.length === 0) {
    return { error: "Choose at least one cover to buy." };
  }

  try {
    // Price every line server-side from a live quote — same math as the
    // wallet path, so the gateway charge can never disagree with what the
    // underwriter will be paid.
    const lines: PricedLine[] = [];
    for (const selection of deduped) {
      const dependants = (selection.dependants ?? []).filter((d) => d.name.trim());
      const { data: product } = await admin
        .from("insurance_products")
        .select("*")
        .eq("id", selection.productId)
        .eq("is_active", true)
        .single();
      if (!product) return { error: "One of the selected covers is no longer available." };
      if (!product.is_purchasable) return { error: `${product.name} isn't available to buy yet.` };

      const quote = await getQuote({
        product_id: selection.productId,
        national_id: params.nationalId,
        field_values: {
          ...params.fieldValues,
          dependants: dependants.map((d) => ({
            name: d.name.trim(),
            relationship: d.relationship?.trim() || undefined,
            dob: d.dob || undefined,
            national_id: d.nationalId?.trim() || undefined,
          })),
        },
      });
      if (!quote.eligible) {
        return { error: quote.message || `Not eligible for ${product.name}` };
      }

      const perHead = product.category !== "agriculture";
      const headCount = perHead ? 1 + dependants.length : 1;
      const basePremium = quote.base_premium * headCount;
      const markupAmount = basePremium * (Number(product.markup_percent) / 100);
      lines.push({
        productId: selection.productId,
        dependants: dependants.map((d) => ({
          name: d.name.trim(),
          relationship: d.relationship?.trim() || undefined,
          dob: d.dob || undefined,
          national_id: d.nationalId?.trim() || undefined,
        })),
        headCount,
        basePremium,
        markupAmount,
        totalPremium: basePremium + markupAmount,
        currency: quote.currency,
      });
    }

    const baseTotal = lines.reduce((s, l) => s + l.basePremium, 0);
    const markupTotal = lines.reduce((s, l) => s + l.markupAmount, 0);
    const gatewayFee = calculateTopupFee(params.gateway, baseTotal + markupTotal);
    const totalCharge = baseTotal + markupTotal + gatewayFee;

    const reference = `INS-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: intentError } = await admin.from("insurance_checkout_intents").insert({
      reference,
      user_id: user.id,
      application: {
        selections: deduped,
        nationalId: params.nationalId,
        fullName: params.fullName,
        phone: params.phone ?? null,
        email: params.email ?? null,
        dateOfBirth: params.dateOfBirth ?? null,
        address: params.address ?? null,
        occupation: params.occupation ?? null,
        fieldValues: params.fieldValues ?? {},
        lines,
      },
      amount: baseTotal,
      fee: markupTotal + gatewayFee,
      provider: params.gateway,
    });
    if (intentError) {
      console.error("Insurance intent insert failed:", intentError);
      return { error: "Couldn't start the checkout. Please try again." };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const confirmUrl = `${appUrl}/pay/guest/confirm?reference=${encodeURIComponent(reference)}`;

    if (params.gateway === "paynow") {
      const result = await initiatePaynowPayment({
        reference,
        amount: totalCharge,
        authEmail: params.email ?? "",
        additionalInfo: "Insurance cover",
        returnUrl: confirmUrl,
      });
      if (!result.ok || !result.browserUrl || !result.pollUrl) {
        await failInsuranceCheckout(reference, `Paynow initiation failed — ${result.error ?? "no redirect"}`);
        return { error: result.error || "Paynow couldn't start the payment." };
      }
      await admin.from("insurance_checkout_intents").update({ meta: { pollUrl: result.pollUrl } }).eq("reference", reference);
      return { success: true, gateway: "paynow", reference, redirectUrl: result.browserUrl };
    }

    if (params.gateway === "stripe") {
      const session = await createGuestCheckoutSession({
        amount: totalCharge,
        reference,
        serviceName: "Insurance cover",
        guestEmail: params.email ?? "",
        purpose: "insurance_payment",
      });
      if (!session.url) {
        await failInsuranceCheckout(reference, "Stripe couldn't create a checkout session.");
        return { error: "Stripe couldn't start the payment." };
      }
      return { success: true, gateway: "stripe", reference, redirectUrl: session.url };
    }

    // ecocash — push the approval prompt straight to the customer's phone.
    const push = await initiateEcocashPush({ phone: params.phone!, amount: totalCharge, reference });
    if (!push.ok || !push.endUserId) {
      await failInsuranceCheckout(reference, `EcoCash push failed — ${push.error ?? "no endUserId"}`);
      return { error: push.error || "EcoCash couldn't send the approval prompt." };
    }
    await admin.from("insurance_checkout_intents").update({ meta: { endUserId: push.endUserId } }).eq("reference", reference);
    return { success: true, gateway: "ecocash", reference };
  } catch (error) {
    console.error("startInsuranceCheckout error:", error);
    return { error: error instanceof Error ? error.message : "Couldn't start the checkout." };
  }
}

/**
 * Finish an insurance gateway payment once the rail confirms it. The RPC
 * does the atomic part (pending intent → transaction + completed intent);
 * then the Tariqify policy flow runs per priced line — same shared helper
 * as the wallet path, using the quote values locked in at checkout start
 * (the money's already taken, so policies must be issued from those
 * numbers, not re-quoted).
 */
export async function finalizeInsuranceCheckout(reference: string) {
  const admin = createAdminClient();

  const { data: tx, error: finalizeError } = await admin.rpc("finalize_insurance_checkout", { p_reference: reference });
  if (finalizeError || !tx) {
    // Already processed (webhook + redirect racing) is not an error.
    const { data: status } = await admin.rpc("get_insurance_checkout", { p_reference: reference });
    if (status?.status === "completed") return { success: true, alreadyProcessed: true };
    console.error("finalize_insurance_checkout failed:", finalizeError);
    return { error: "Payment couldn't be recorded." };
  }

  const { data: intent } = await admin
    .from("insurance_checkout_intents")
    .select("*")
    .eq("reference", reference)
    .single();
  if (!intent) {
    return { error: "Checkout record missing after payment." };
  }
  const app = intent.application as {
    nationalId: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    dateOfBirth?: string | null;
    address?: string | null;
    occupation?: string | null;
    lines: PricedLine[];
  };

  // Money captured at the gateway — the transaction succeeded even if
  // policy issuance below hits a snag (that alerts separately as failed).
  void alertTransaction(admin, {
    outcome: "success",
    reference: tx.reference,
    service: "Insurance cover",
    amount: tx.amount,
    fee: tx.fee,
    recipient: app.nationalId,
    method: intent.provider,
    customer: app.email ?? intent.user_id,
  });

  try {
    const tariqifyClient = await createOrGetClient({
      national_id: app.nationalId,
      full_name: app.fullName,
      phone: app.phone ?? undefined,
      email: app.email ?? undefined,
      date_of_birth: app.dateOfBirth ?? undefined,
      address: app.address ?? undefined,
      occupation: app.occupation ?? undefined,
    });

    const { data: localClient } = await admin
      .from("insurance_clients")
      .upsert(
        {
          profile_id: intent.user_id,
          national_id: app.nationalId,
          full_name: app.fullName,
          phone: app.phone,
          tariqify_client_id: tariqifyClient.id,
          raw: {
            ...tariqifyClient.raw,
            application: {
              email: app.email ?? null,
              date_of_birth: app.dateOfBirth ?? null,
              address: app.address ?? null,
              occupation: app.occupation ?? null,
            },
          },
        },
        { onConflict: "profile_id,national_id" }
      )
      .select()
      .single();

    if (!localClient) {
      await admin.rpc("set_fulfillment_result", { p_transaction_id: tx.id, p_status: "failed", p_receipt: { message: "client record failed" } });
      void alertTransaction(admin, {
        outcome: "failed",
        reference: tx.reference,
        service: "Insurance cover",
        amount: tx.amount,
        fee: tx.fee,
        recipient: app.nationalId,
        method: intent.provider,
        customer: app.email ?? intent.user_id,
        detail: "Paid but the client record failed.",
      });
      return { error: "Payment received but the client record failed — support has been notified." };
    }

    let issued = 0;
    let pendingVerification = false;
    for (const line of app.lines) {
      try {
        const { data: product } = await admin
          .from("insurance_products")
          .select("*")
          .eq("id", line.productId)
          .single();
        if (!product) {
          console.error(`Insurance finalize: product ${line.productId} missing`);
          continue;
        }
        const result = await issuePolicyAfterPayment({
          admin,
          userId: intent.user_id,
          localClientId: localClient.id,
          tariqifyClientId: tariqifyClient.id,
          nationalId: app.nationalId,
          fullName: app.fullName,
          product,
          productId: line.productId,
          dependants: line.dependants,
          headCount: line.headCount,
          basePremium: line.basePremium,
          markupAmount: line.markupAmount,
          totalPremium: line.totalPremium,
          currency: line.currency,
          transactionId: tx.id,
        });
        if (result.policy) issued++;
        if (result.pendingVerification) pendingVerification = true;
      } catch (lineError) {
        console.error(`Insurance finalize failed for ${line.productId}:`, lineError);
      }
    }

    await admin.rpc("set_fulfillment_result", {
      p_transaction_id: tx.id,
      p_status: issued > 0 ? "fulfilled" : "failed",
      p_receipt: {
        provider: "insurance",
        message: issued > 0 ? `${issued}/${app.lines.length} policies issued${pendingVerification ? " (pending verification)" : ""}` : "policy issuance failed",
      },
    });

    void logTransactionEvent(admin, {
      transactionId: tx.id,
      reference: tx.reference,
      eventType: issued > 0 ? "fulfillment_success" : "fulfillment_failed",
      message: `Insurance checkout via ${intent.provider} — ${issued}/${app.lines.length} policies issued.`,
      meta: { reference, provider: intent.provider, lines: app.lines.length, issued },
    });
    if (issued === 0) {
      void alertTransaction(admin, {
        outcome: "failed",
        reference: tx.reference,
        service: "Insurance cover",
        amount: tx.amount,
        fee: tx.fee,
        recipient: app.nationalId,
        method: intent.provider,
        customer: app.email ?? intent.user_id,
        detail: `Paid via ${intent.provider} but no policies were issued.`,
      });
    }

    revalidatePath("/account");
    revalidatePath("/history");
    return { success: true, issued, pendingVerification: pendingVerification || undefined };
  } catch (error) {
    console.error("finalizeInsuranceCheckout error:", error);
    await admin.rpc("set_fulfillment_result", { p_transaction_id: tx.id, p_status: "failed", p_receipt: { message: "fulfillment error" } });
    void alertTransaction(admin, {
      outcome: "failed",
      reference: tx.reference,
      service: "Insurance cover",
      amount: tx.amount,
      fee: tx.fee,
      recipient: app.nationalId,
      method: intent.provider,
      customer: app.email ?? intent.user_id,
      detail: `Paid but policy issuance threw — ${error instanceof Error ? error.message : "unknown error"}`,
    });
    return { error: "Payment received but policy issuance failed — support has been notified." };
  }
}

/**
 * Mark an insurance intent failed + alert ops. Centralised so every rail
 * (initiation errors, EcoCash decline, Paynow cancel) reports the same way.
 */
export async function failInsuranceCheckout(reference: string, detail?: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("fail_insurance_checkout", { p_reference: reference });
  void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: detail ?? "Insurance payment did not go through." });
  const { data: intent } = await admin
    .from("insurance_checkout_intents")
    .select("provider, amount, fee, application")
    .eq("reference", reference)
    .maybeSingle();
  const row = intent as { provider?: string; amount?: number; fee?: number; application?: { nationalId?: string; email?: string } } | null;
  void alertTransaction(admin, {
    outcome: "failed",
    reference,
    service: "Insurance cover",
    amount: row?.amount ?? 0,
    fee: row?.fee ?? null,
    recipient: row?.application?.nationalId ?? null,
    method: row?.provider ?? "gateway",
    customer: row?.application?.email ?? null,
    detail: detail ?? "Payment declined or cancelled at the gateway.",
  });
}

/**
 * Poll the rail for an insurance intent's real status — the confirm page
 * and the in-form EcoCash pending screen both call this. Paynow polls its
 * pollUrl (applyPaynowResult routes insurance references back here);
 * EcoCash checks the push status directly; Stripe is webhook-only so
 * there's nothing to poll.
 */
export async function checkInsurancePaymentNow(reference: string) {
  const admin = createAdminClient();
  const { data: intent } = await admin
    .from("insurance_checkout_intents")
    .select("*")
    .eq("reference", reference)
    .single();
  if (!intent || intent.status !== "pending") {
    return { checked: true };
  }

  if (intent.provider === "paynow") {
    const pollUrl = (intent.meta as { pollUrl?: string })?.pollUrl;
    if (!pollUrl) return { checked: false };
    const result = await checkPaynowStatus(pollUrl);
    if (result.ok && result.status) {
      await applyPaynowResult(reference, result.status, result.fields);
    }
    return { checked: true };
  }

  if (intent.provider === "ecocash") {
    const endUserId = (intent.meta as { endUserId?: string })?.endUserId;
    if (!endUserId) return { checked: false };
    const status = await getEcocashStatus(endUserId, reference);
    if (status === "completed") {
      await finalizeInsuranceCheckout(reference);
    } else if (status === "failed" || status === "cancelled") {
      await failInsuranceCheckout(reference, `EcoCash reported ${status}.`);
    }
    return { checked: true };
  }

  return { checked: false };
}

/** Reference-gated status for the payer's own browser (confirm page). */
export async function getInsuranceCheckoutStatus(reference: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_insurance_checkout", { p_reference: reference });
  if (error) {
    console.error("get_insurance_checkout failed:", error);
    return { status: "not_found" };
  }
  return data as { status: string; transaction?: Record<string, unknown> };
}

/**
 * Get insurance products for display
 */
export async function getInsuranceProducts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insurance_products")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    console.error("Failed to fetch insurance products:", error);
    return [];
  }

  // Lazy sync: the cron route isn't always registered (and may never have
  // run), so if the table is completely empty pull straight from Tariqify
  // and populate it here — otherwise the storefront shows nothing until
  // someone hits the admin sync button. The check is "zero rows at all",
  // not "zero active rows", so it can never resurrect products an admin
  // deliberately switched off.
  if (data.length === 0) {
    const { count } = await supabase
      .from("insurance_products")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) === 0) {
      try {
        const tariqifyProducts = await getTariqifyProducts();
        if (tariqifyProducts.length > 0) {
          const admin = createAdminClient();
          // Only upsert base columns — the premium/cover_amount/features etc.
          // columns may not exist yet (migrations not applied). Everything
          // is preserved in `raw` and enriched on read via enrichInsuranceProduct.
          await admin.from("insurance_products").upsert(
            tariqifyProducts.map((product) => ({
              id: product.id,
              name: product.name,
              description: product.description,
              category: product.category,
              currency: product.currency,
              image_url: product.image_url,
              signup_fields: product.signup_fields,
              is_active: product.is_active,
              raw: product.raw,
              synced_at: new Date().toISOString(),
            })),
            { onConflict: "id", ignoreDuplicates: false }
          );

          const { data: refreshed } = await supabase
            .from("insurance_products")
            .select("*")
            .eq("is_active", true)
            .order("sort_order");
          return (refreshed ?? []).map((row) => enrichInsuranceProduct(row as Record<string, unknown>)).filter((p) => !isExcludedProduct(p));
        }
      } catch (syncError) {
        console.error("Lazy insurance product sync failed:", syncError);
      }
    }
  }

  return data.map((row) => enrichInsuranceProduct(row as Record<string, unknown>)).filter((p) => !isExcludedProduct(p));
}

/**
 * Get user's insurance policies
 */
export async function getUserInsurancePolicies() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("insurance_policies")
    .select(`
      *,
      insurance_products (*),
      insurance_clients (*)
    `)
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch policies:", error);
    return [];
  }

  return data;
}
