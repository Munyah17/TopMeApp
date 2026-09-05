import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { TELONE_PACKAGES } from "@/lib/telone-packages";
import type { Service } from "@/types/database";

// Real, pre-launch-audit-found tampering hole: for fixed-price catalog
// items (data bundles, TV packages, outstanding-balance bills), the server
// used to trust whatever `amount` a Server Action's caller sent — the
// client only ever computed it for DISPLAY (`bundles.find(b => b.id ===
// bundleId)?.price` etc. in the flow components), so a direct call to
// payService/startGuestCheckout with a doctored amount would debit the
// wallet or charge a gateway for far less than the real price while still
// fulfilling the full service.
//
// Chips-mode services (airtime, ZESA, council bills, red packets, ...) are
// deliberately excluded — the customer choosing their own amount (from a
// preset or a custom field) IS the real, legitimate price there; there's
// no catalog price to check it against.
export interface VerifiedAmountInput {
  bundleId?: string | null;
  pkgId?: string | null;
  packageIndex?: number | null;
  // "outstanding" mode covers two different UIs: the generic payment flow
  // just displays and charges the fetched balance outright (no way to enter
  // a different figure, so this is left undefined/true there); a few flows
  // (broadband-flow's non-TelOne providers, council-flow) additionally let
  // the customer type a custom/partial amount instead — there's no fixed
  // catalog price to check a partial bill payment against, so that case is
  // trusted like "chips" rather than forced to match the fetched balance.
  payFullBalance?: boolean;
  clientAmount: number;
}

export async function resolveVerifiedAmount(service: Pick<Service, "id" | "amount_mode" | "outstanding">, input: VerifiedAmountInput): Promise<number> {
  // TelOne's "pick a package" UI (src/components/payment-flow/broadband-flow.tsx)
  // has no DB table behind it — TELONE_PACKAGES *is* the catalog, so both the
  // client (for display) and here (for verification) import the same fixed
  // list. This is checked before amount_mode below because telone's real
  // `amount_mode` is "outstanding" (its actual bill balance) — that's a
  // different, currently-unexposed "pay full bill" case, not this one, so
  // falling through to the outstanding-balance check would silently charge
  // the wrong amount for every TelOne package purchase.
  if (service.id === "telone") {
    if (input.packageIndex == null || !TELONE_PACKAGES[input.packageIndex]) throw new Error("invalid_amount");
    return TELONE_PACKAGES[input.packageIndex].price;
  }

  const admin = createAdminClient();

  if (service.amount_mode === "bundles") {
    if (!input.bundleId) throw new Error("invalid_amount");
    const { data } = await admin.from("data_bundles").select("price").eq("id", input.bundleId).eq("service_id", service.id).single();
    if (!data) throw new Error("invalid_amount");
    return data.price as number;
  }

  if (service.amount_mode === "packages") {
    if (!input.pkgId) throw new Error("invalid_amount");
    const { data } = await admin.from("tv_packages").select("price").eq("id", input.pkgId).eq("service_id", service.id).single();
    if (!data) throw new Error("invalid_amount");
    return data.price as number;
  }

  if (service.amount_mode === "outstanding") {
    if (input.payFullBalance === false) {
      if (!(input.clientAmount > 0)) throw new Error("invalid_amount");
      return input.clientAmount;
    }
    if (!service.outstanding || service.outstanding <= 0) throw new Error("invalid_amount");
    return service.outstanding;
  }

  // "chips" — customer-chosen amount (preset chip or custom field) is the
  // real price by design; only the positivity check applies.
  if (!(input.clientAmount > 0)) throw new Error("invalid_amount");
  return input.clientAmount;
}
