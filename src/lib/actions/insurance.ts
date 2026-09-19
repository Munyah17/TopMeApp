"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createOrGetClient, getQuote, createPolicy, getPolicy, recordPayment as recordTariqifyPayment, createTicket as createTariqifyTicket, getProducts as getTariqifyProducts } from "@/lib/insurance/tariqify";
import { enrichInsuranceProduct } from "@/lib/insurance/types";
import { isExcludedProduct } from "@/lib/insurance/exclusions";
import { revalidatePath } from "next/cache";

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

        // 4. Charge wallet (using wallet_pay RPC). owner_label/provider_cost
        // are passed explicitly — TopMe is Motions Microinsurance's
        // agent/dealer, not an insurer, selling under their licence, so the
        // audit trail must say so the same way every other service records
        // who it's "sold by TopMe, processed and paid to <owner_label>".
        // provider_cost is the real base_premium from the live quote above,
        // not a guessed percentage (there's no `services` row for insurance
        // products at all — see 2026-09-13-wallet-pay-explicit-attribution.sql
        // for why the normal cost_percentage lookup silently produced 0 here).
        const { data: transaction, error: paymentError } = await admin.rpc("wallet_pay", {
          p_service_id: `insurance-${productId}`,
          p_amount: totalPremium,
          p_recipient: params.nationalId,
          p_network_id: null,
          p_extra_value: JSON.stringify({ product_id: productId, client_id: localClient.id, members: headCount }),
          p_fulfillment_provider: "insurance",
          p_owner_label: "Motions Microinsurance",
          p_provider_cost: basePremium,
        });

        if (paymentError) {
          console.error("Wallet payment error:", paymentError);
          failures.push({ productId, error: paymentError.message || "Payment failed" });
          continue;
        }

        // 5. Create policy in TariqifyIMS — premium is the per-period total
        // for all members, dependants forwarded so the underwriter's record
        // matches the application exactly.
        const tariqifyPolicy = await createPolicy({
          product_id: productId,
          client_id: tariqifyClient.id,
          premium: basePremium,
          currency: quote.currency,
          dependants: dependants.map((d) => ({
            name: d.name.trim(),
            relationship: d.relationship?.trim() || undefined,
            dob: d.dob || undefined,
            national_id: d.nationalId?.trim() || undefined,
          })),
        });

        // 6. Create local policy record
        const { data: localPolicy, error: policyError } = await admin
          .from("insurance_policies")
          .insert({
            policy_number: tariqifyPolicy.policy_number,
            product_id: productId,
            profile_id: user.id,
            insurance_client_id: localClient.id,
            base_premium: basePremium,
            markup_amount: markupAmount,
            total_premium: totalPremium,
            currency: quote.currency,
            status: "active",
            transaction_id: transaction.id,
            raw: { ...tariqifyPolicy.raw, dependants, members: headCount },
          })
          .select()
          .single();

        if (policyError || !localPolicy) {
          failures.push({ productId, error: "Failed to create policy record" });
          continue;
        }

        // 7. Record payment with TariqifyIMS
        const tariqifyPayment = await recordTariqifyPayment({
          policy_number: tariqifyPolicy.policy_number,
          amount: basePremium,
          currency: quote.currency,
        });

        // 8. Dual confirmation — TopMe's wallet already debited, so the
        // payment must also be confirmed on Tariqify's side: the payment
        // record's own status AND the policy it was recorded against must
        // both check out. Anything else is a mismatch → pending review.
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

        // 9. Create local payment record — flagged for manual review when
        // the dual confirmation didn't come back clean.
        const { error: paymentRecordError } = await admin
          .from("insurance_premium_payments")
          .insert({
            policy_id: localPolicy.id,
            amount: basePremium,
            transaction_id: transaction.id,
            tariqify_payment_id: tariqifyPayment.id,
            status: verified ? "recorded_with_provider" : "pending_review",
            raw: { ...tariqifyPayment.raw, verification: { payment_status: tariqifyPayment.status, policy_status: policyStatus } },
          });

        if (paymentRecordError) {
          console.error("Failed to record payment:", paymentRecordError);
          // Non-fatal - policy is created, payment record can be reconciled later
        }

        if (!verified) {
          pendingVerification = true;
          await admin
            .from("insurance_policies")
            .update({ status: "pending_verification" })
            .eq("id", localPolicy.id);

          // Notify Tariqify — a ticket on their side so their team can
          // trace the payment from their end.
          try {
            await createTariqifyTicket({
              policy_number: tariqifyPolicy.policy_number,
              client_id: tariqifyClient.id,
              subject: `Payment verification needed — ${tariqifyPolicy.policy_number}`,
              message:
                `TopMe recorded a premium payment of ${quote.currency} ${basePremium.toFixed(2)} for policy ` +
                `${tariqifyPolicy.policy_number} (product ${productId}, client ${params.fullName}, ` +
                `national ID ${params.nationalId}), but the payment status came back as ` +
                `"${tariqifyPayment.status}" and the policy status as "${policyStatus}". ` +
                `Please confirm receipt on your side.`,
            });
          } catch (ticketError) {
            console.error("Failed to file Tariqify ticket:", ticketError);
          }

          // Notify TopMe superadmins — an urgent task in the admin console
          // so a human verifies before the customer is told they're covered.
          await admin.from("admin_tasks").insert({
            title: `Verify insurance payment — ${tariqifyPolicy.policy_number}`,
            description:
              `Wallet charged ${quote.currency} ${totalPremium.toFixed(2)} for ${product.name} ` +
              `(${params.fullName}, ${params.nationalId}), but Tariqify returned payment status ` +
              `"${tariqifyPayment.status}" / policy status "${policyStatus}". ` +
              `A ticket was filed with Motions. Confirm the payment landed, then set the policy ` +
              `back to active and the premium payment to recorded_with_provider.`,
            priority: "urgent",
            related_table: "insurance_policies",
            related_id: localPolicy.id,
          });
        }

        policies.push(localPolicy);
      } catch (productError) {
        console.error(`Insurance purchase failed for ${productId}:`, productError);
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
