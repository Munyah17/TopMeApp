import { NextResponse } from "next/server";
import { getProducts } from "@/lib/insurance/tariqify";

/**
 * Test endpoint to verify TariqifyIMS API connection
 * Call this to check if the API is working and products can be fetched
 */
export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json({
      success: true,
      count: products.length,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        signup_fields_count: p.signup_fields.length,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
