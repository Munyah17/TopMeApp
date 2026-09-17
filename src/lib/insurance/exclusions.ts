// Agricultural / farming covers are excluded from the storefront — the
// catalog should only show personal lines (medical, funeral, legal, travel,
// vehicle). Matched on category or name so it works whether Tariqify tags
// them by category or only in the product name (e.g. "Field To Floor").
//
// Lives in a plain (non-"use server") module because it's a synchronous pure
// helper — exporting it from src/lib/actions/insurance.ts would violate the
// "every export must be async" rule for server-action files.
const EXCLUDED_PRODUCT_PATTERN = /agric|farm|field|crop|livestock/i;

export function isExcludedProduct(p: { name?: string | null; category?: string | null }) {
  return EXCLUDED_PRODUCT_PATTERN.test(p.name ?? "") || EXCLUDED_PRODUCT_PATTERN.test(p.category ?? "");
}
