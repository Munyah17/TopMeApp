// Platform processing fee: charged on top of the service amount, absorbed by
// the customer. Airtime Direct Recharge uses a competitive percentage-only
// rate (3%, no flat component) — a flat $0.10 under-charged larger recharges
// and the standard $0.50+1.5% formula would be disproportionate on a $1 top-up.
// Everything else is $0.50 flat + 1.5% of the amount.
//
// This is the display-side source of truth used by every payment flow to
// show the customer what they'll actually be charged before they pay. The
// authoritative charge for wallet payments is computed server-side inside
// the wallet_pay RPC (see supabase/migrations) using the same formula, so a
// client can never under-report the fee by calling the RPC directly.
export function calculatePlatformFee(serviceId: string, amount: number): number {
  if (!(amount > 0)) return 0;
  if (serviceId === "airtime") return Math.round(amount * 0.03 * 100) / 100;
  return Math.round((0.5 + amount * 0.015) * 100) / 100;
}

export type TopupGateway = "paynow" | "stripe" | "ecocash" | "vitalpay";

// Wallet top-up processing fee: the customer pays amount + fee, the wallet
// is credited exactly `amount` (what they asked to top up) — same shape as
// the platform fee above. Priced per rail rather than one blended number,
// so an EcoCash top-up doesn't subsidise a pricier Stripe one: roughly
// gateway cost + a thin margin, not maximum extraction.
//
// Re-verified 2026-09-13 against each provider's own published rates
// (not a guess — see paynow.co.zw/Home/Fees directly):
//   - EcoCash direct (initiateEcocashPush, not through Paynow): their own
//     merchant fee is ~1.4%, plus Zimbabwe's 2% IMTT tax applies to
//     electronic transactions over $5 — 2.0% was under both combined.
//     Bumped to 2.5%, which is also exactly what Paynow itself charges
//     for reselling the same EcoCash rail — a safe, published ceiling.
//   - Paynow (their own hosted checkout — customer can pick EcoCash/
//     OneMoney/Telecash at 2.5% flat, OR card at 3.5% + $0.50; TopMe
//     can't know which until the customer is on Paynow's page, so this
//     has to be one blended number). 3.3% flat covered the mobile-money
//     path fine but left the card path's fixed $0.50 completely
//     unrecovered. Added a small flat component for that, without
//     jumping all the way to card's full $0.50.
//   - Stripe: left unverified against a public source (their real cost
//     depends on card-issuing country / currency-conversion surcharges,
//     which aren't published per-corridor) — check actual Stripe payout
//     statements for Zimbabwean cards specifically before trusting this
//     one blind.
// The authoritative charge is recomputed server-side wherever money
// actually moves (startPaynowTopup / startStripeTopup / startEcocashTopup)
// using this same function — never trust a client-supplied fee.
//   - VitalPay Payments Gateway: their own rate card was never given to
//     us (see [[vitalpay-postpaid-gateway-deal]] memory) — 0% is a real
//     placeholder, not a guess dressed up as a real number. Update this
//     the moment VitalPay states their actual fee; until then this rail
//     runs at a loss if their cut is anything but zero, which is a known,
//     deliberate, temporary state — not an oversight.
const TOPUP_FEE: Record<TopupGateway, { pct: number; flat: number }> = {
  ecocash: { pct: 0.025, flat: 0 },
  paynow: { pct: 0.033, flat: 0.3 },
  stripe: { pct: 0.032, flat: 0.3 },
  vitalpay: { pct: 0, flat: 0 },
};

export function calculateTopupFee(gateway: TopupGateway, amount: number): number {
  if (!(amount > 0)) return 0;
  const { pct, flat } = TOPUP_FEE[gateway];
  return Math.round((amount * pct + flat) * 100) / 100;
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
export function calculateGatewaySurcharge(method: "wallet" | TopupGateway | null, amount: number): number {
  if (!method || method === "wallet") return 0;
  return calculateTopupFee(method, amount);
}
