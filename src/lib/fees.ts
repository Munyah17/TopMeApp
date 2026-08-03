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
