import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST() {
  const admin = createAdminClient();
  
  // Insert schoolfees mapping with VitalPay
  const { error } = await admin.from("service_provider_map").upsert({
    service_id: "schoolfees",
    provider: "vitalpay",
    provider_product_id: "edu_msu_zw",
    provider_sku: "education_university",
    network_id: "",
    cost_amount: null,
    cost_currency: "USD",
    enabled: true,
    priority: 10,
    meta: {
      default_institution: "edu_msu_zw",
      available_institutions: ["edu_cut_zw", "edu_cuz_zw", "edu_zou_zw", "edu_rcu_zw", "edu_msu_zw", "edu_solusi_zw", "edu_lsu_zw", "edu_sis_zw", "edu_ajs_zw", "edu_cuza_zw"],
      fx_enabled: true,
      fx_default_from: "USD",
      fx_default_to: "GBP"
    }
  }, {
    onConflict: "service_id,provider,provider_product_id,provider_sku,network_id"
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Schoolfees mapping inserted" });
}
