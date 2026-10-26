// Platform processing fee: charged on top of the service amount, absorbed by
// the customer. Flat 2% of the amount on every service — owner directive
// 2026-09-17 ("we agreed long ago to charge a percentage, like 2% as platform
// (TopMe) processing fee"), extended to all services 2026-09-19. A pure
// percentage scales fairly from a $1 top-up to a $200 bill where a flat
// component would be disproportionate on the small end.
//
// This is the display-side source of truth used by every payment flow to
// show the customer what they'll actually be charged before they pay. The
// authoritative charge for wallet payments is computed server-side inside
// the wallet_pay RPC (see supabase/migrations) using the same formula, so a
// client can never under-report the fee by calling the RPC directly.
export function calculatePlatformFee(serviceId: string, amount: number): number {
  if (!(amount > 0)) return 0;
  return Math.round(amount * 0.02 * 100) / 100;
}

export type TopupGateway = "paynow" | "stripe" | "ecocash" | "vitalpay";

// Wallet top-up processing fee: the customer pays amount + fee, the wallet
// is credited exactly `amount` (what they asked to top up) — same shape as
// the platform fee above. One uniform rate across all rails, owner
// directive 2026-10-26: "$0.50 + 2.5%" — and editable at runtime from
// Super Admin → Settings (app_settings key `topup_fee`, shape
// {"flat": <dollars>, "pct": <decimal>}), so this constant is only the
// fallback until/unless that row is changed. Server-side callers (where
// money actually moves) always fetch the live value via getTopupFeeConfig
// in src/lib/data/fee-config.ts and pass it in — never trust a
// client-computed fee.
export interface TopupFeeConfig {
  flat: number;
  pct: number;
}

export const DEFAULT_TOPUP_FEE: TopupFeeConfig = { flat: 0.5, pct: 0.025 };

export function calculateTopupFee(gateway: TopupGateway, amount: number, config: TopupFeeConfig = DEFAULT_TOPUP_FEE): number {
  void gateway; // uniform rate — gateway kept in the signature so every call site stays typed
  if (!(amount > 0)) return 0;
  return Math.round((amount * config.pct + config.flat) * 100) / 100;
}

// A wallet payment never pays this — the customer already covered
// Paynow/EcoCash/Stripe's cut back when they funded the wallet via
// calculateTopupFee. A guest (or logged-in customer) paying a specific
// purchase directly by gateway instead has no such funding step for that
// cost to have been recovered at (see startGuestCheckout in
// src/lib/actions/guest-payments.ts — real gap found and fixed
// 2026-09-12, TopMe was absorbing this on every direct-gateway sale) — so
// it's charged here instead, on top of the service's own platform fee.
// Every payment-flow component uses this so the review screen shows the
// real total before the customer picks how they're paying, not a number
// that changes underneath them once a non-wallet method is picked.
export function calculateGatewaySurcharge(
  method: "wallet" | TopupGateway | null,
  amount: number,
  config: TopupFeeConfig = DEFAULT_TOPUP_FEE
): number {
  if (!method || method === "wallet") return 0;
  return calculateTopupFee(method, amount, config);
}
