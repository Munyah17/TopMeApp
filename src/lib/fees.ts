// Platform processing fee: charged on top of the service amount, absorbed by
// the customer. Airtime Direct Recharge gets a flat $0.10 (it's a small,
// high-frequency purchase — the standard formula would be disproportionate).
// Everything else is $0.50 flat + 1.5% of the amount.
//
// This is the display-side source of truth used by every payment flow to
// show the customer what they'll actually be charged before they pay. The
// authoritative charge for wallet payments is computed server-side inside
// the wallet_pay RPC (see supabase/migrations) using the same formula, so a
// client can never under-report the fee by calling the RPC directly.
export function calculatePlatformFee(serviceId: string, amount: number): number {
  if (!(amount > 0)) return 0;
  if (serviceId === "airtime") return 0.1;
  return Math.round((0.5 + amount * 0.015) * 100) / 100;
}

export type TopupGateway = "paynow" | "stripe" | "ecocash";

// Wallet top-up processing fee: the customer pays amount + fee, the wallet
// is credited exactly `amount` (what they asked to top up) — same shape as
// the platform fee above. Priced per rail rather than one blended number,
// so an EcoCash top-up doesn't subsidise a pricier Stripe one: roughly
// gateway cost + a thin margin, not maximum extraction. Rates confirmed
// against EcoCash's ~1.7% and Paynow's ~3% merchant fees; revisit if either
// changes. The authoritative charge is recomputed server-side wherever
// money actually moves (startPaynowTopup / startStripeTopup /
// startEcocashTopup) using this same function.
const TOPUP_FEE: Record<TopupGateway, { pct: number; flat: number }> = {
  ecocash: { pct: 0.02, flat: 0 },
  paynow: { pct: 0.033, flat: 0 },
  stripe: { pct: 0.032, flat: 0.3 },
};

export function calculateTopupFee(gateway: TopupGateway, amount: number): number {
  if (!(amount > 0)) return 0;
  const { pct, flat } = TOPUP_FEE[gateway];
  return Math.round((amount * pct + flat) * 100) / 100;
}
