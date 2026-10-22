import { createAdminClient } from "@/lib/supabase/server";
import { isAgricultureInsuranceProduct } from "@/lib/insurance/availability";
import { getProducts as getTariqifyProducts } from "@/lib/insurance/tariqify";

/** Pull Tariqify's catalog into insurance_products. Agriculture stays inactive. */
export async function syncInsuranceCatalog(): Promise<{ success: true; synced: number; excluded: number } | { success: false; error: string }> {
  try {
    const admin = createAdminClient();
    const tariqifyProducts = await getTariqifyProducts();
    let excluded = 0;

    for (const product of tariqifyProducts) {
      if (isAgricultureInsuranceProduct(product)) {
        excluded++;
        await admin.from("insurance_products").update({ is_active: false, is_purchasable: false }).eq("id", product.id);
        continue;
      }
      const { error } = await admin.from("insurance_products").upsert(
        {
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
        },
        { onConflict: "id", ignoreDuplicates: false }
      );
      if (error) console.error(`Failed to upsert insurance product ${product.id}:`, error.message);
    }

    return { success: true, synced: tariqifyProducts.length - excluded, excluded };
  } catch (error) {
    console.error("Insurance product sync failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
