// TelOne is the only broadband provider with a real named-package catalogue
// (per the reference flow) — VitalPay's bills API has no plan/package concept
// of its own, it only takes an amount, so picking a package here just locks
// in that package's price as the amount we submit. There's no `tv_packages`
// (or any other) DB row backing these — this fixed array IS the catalog, so
// both the client (for display) and the server (for price verification, see
// resolveVerifiedAmount in src/lib/pricing.ts) import the exact same list.
export const TELONE_PACKAGES = [
  { name: "Voice Bundle US$4", price: 4 },
  { name: "Voice On Net US$5", price: 5 },
  { name: "Voice Bundle US$7", price: 7 },
  { name: "Voice Bundle US$13", price: 13 },
  { name: "Home 75", price: 15 },
  { name: "Voice Bundle US$20", price: 20 },
  { name: "Blaze 75", price: 20 },
  { name: "Voice Bundle US$25", price: 25 },
  { name: "Blaze 150", price: 25 },
  { name: "Home Unlimited", price: 30 },
  { name: "Speed 50", price: 40 },
  { name: "Blaze 500", price: 50 },
  { name: "Speed 80", price: 60 },
  { name: "Blaze Unlimited", price: 75 },
  { name: "Speed 100", price: 90 },
];
