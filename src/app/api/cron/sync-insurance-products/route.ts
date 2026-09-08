import { NextResponse } from "next/server";
import { getProducts as getTariqifyProducts } from "@/lib/insurance/tariqify";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Cron job to sync insurance products from TariqifyIMS.
 * Call this endpoint periodically (e.g., every 5-10 minutes) to keep the
 * local catalog in sync with Tariqify's offerings.
 * 
 * This job:
 * 1. Fetches all active products from TariqifyIMS
 * 2. Upserts them into insurance_products table
 * 3. Preserves admin overrides (display_name, display_description, display_image_url, markup_percent)
 * 4. Updates the raw field with the full Tariqify response
 * 
 * Rate limit: 60 req/min per key, so syncing every 5 minutes is safe.
 */
export async function GET(request: Request) {
  // Verify this is called from cron (check for a secret header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    
    // Fetch products from TariqifyIMS
    const tariqifyProducts = await getTariqifyProducts();
    
    // Upsert each product into insurance_products
    for (const product of tariqifyProducts) {
      const { error } = await admin
        .from("insurance_products")
        .upsert(
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
          {
            onConflict: "id",
            ignoreDuplicates: false,
          }
        );
      
      if (error) {
        console.error(`Failed to upsert insurance product ${product.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      synced: tariqifyProducts.length,
      message: `Synced ${tariqifyProducts.length} insurance products from TariqifyIMS`,
    });
  } catch (error) {
    console.error("Insurance product sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
