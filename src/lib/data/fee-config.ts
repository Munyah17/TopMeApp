import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { DEFAULT_TOPUP_FEE, type TopupFeeConfig } from "@/lib/fees";

// Live top-up fee config from app_settings key `topup_fee` — editable in
// Super Admin → Settings ("Processing fee"). Cached briefly so checkout
// pages and payment actions share one read; the updateTopupFee admin action
// calls updateTag("settings") so an edit takes effect immediately, not
// at the 5-minute revalidate horizon.
// Falls back to DEFAULT_TOPUP_FEE ($0.50 + 2.5%) when the row is missing or
// malformed — a fee that silently vanishes under-collects on every top-up.
export const getTopupFeeConfig = unstable_cache(
  async (): Promise<TopupFeeConfig> => {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("value").eq("key", "topup_fee").maybeSingle();
    const v = data?.value as { flat?: unknown; pct?: unknown } | null;
    if (v && typeof v.flat === "number" && typeof v.pct === "number" && v.flat >= 0 && v.pct >= 0) {
      return { flat: v.flat, pct: v.pct };
    }
    return DEFAULT_TOPUP_FEE;
  },
  ["topup-fee-config"],
  { tags: ["settings"], revalidate: 300 }
);
