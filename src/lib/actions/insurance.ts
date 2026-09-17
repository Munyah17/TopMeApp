"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createOrGetClient, getQuote, createPolicy, recordPayment as recordTariqifyPayment, getProducts as getTariqifyProducts } from "@/lib/insurance/tariqify";
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

/**
 * Purchase one or more insurance policies from a single Apply-for-Cover
 * submission. The client is registered with TariqifyIMS once, then each
 * selected product runs the full flow — quote → wallet charge → policy
 * creation → payment recording — so every cover lands in TariqifyIMS as a
 * valid policy (their platform applies its own activation rules, e.g. a
 * funeral plan's waiting period vs. instant cover). Returns per-product
 * results so a partial failure still reports which covers went through.
 */
export async function purchaseInsurancePolicy(params: {
  productIds: string[];
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

  const productIds = [...new Set(params.productIds)].filter(Boolean);
  if (productIds.length === 0) {
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

    for (const productId of productIds) {
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

        // 2. Get quote
        const quote = await getQuote({
          product_id: productId,
          national_id: params.nationalId,
          field_values: params.fieldValues,
        });

        if (!quote.eligible) {
          failures.push({ productId, error: quote.message || `Not eligible for ${product.name}` });
          continue;
        }

        // 3. Calculate total with markup (shown to the customer as a
        // "Processing fee" — the sticker price stays Tariqify's premium).
        const markupPercent = Number(product.markup_percent);
        const markupAmount = quote.base_premium * (markupPercent / 100);
        const totalPremium = quote.base_premium + markupAmount;

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
          p_extra_value: JSON.stringify({ product_id: productId, client_id: localClient.id }),
          p_fulfillment_provider: "insurance",
          p_owner_label: "Motions Microinsurance",
          p_provider_cost: quote.base_premium,
        });

        if (paymentError) {
          console.error("Wallet payment error:", paymentError);
          failures.push({ productId, error: paymentError.message || "Payment failed" });
          continue;
        }

        // 5. Create policy in TariqifyIMS
        const tariqifyPolicy = await createPolicy({
          product_id: productId,
          client_id: tariqifyClient.id,
          premium: quote.base_premium,
          currency: quote.currency,
        });

        // 6. Create local policy record
        const { data: localPolicy, error: policyError } = await admin
          .from("insurance_policies")
          .insert({
            policy_number: tariqifyPolicy.policy_number,
            product_id: productId,
            profile_id: user.id,
            insurance_client_id: localClient.id,
            base_premium: quote.base_premium,
            markup_amount: markupAmount,
            total_premium: totalPremium,
            currency: quote.currency,
            status: "active",
            transaction_id: transaction.id,
            raw: tariqifyPolicy.raw,
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
          amount: quote.base_premium,
          currency: quote.currency,
        });

        // 8. Create local payment record
        const { error: paymentRecordError } = await admin
          .from("insurance_premium_payments")
          .insert({
            policy_id: localPolicy.id,
            amount: quote.base_premium,
            transaction_id: transaction.id,
            tariqify_payment_id: tariqifyPayment.id,
            status: "recorded_with_provider",
            raw: tariqifyPayment.raw,
          });

        if (paymentRecordError) {
          console.error("Failed to record payment:", paymentRecordError);
          // Non-fatal - policy is created, payment record can be reconciled later
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
