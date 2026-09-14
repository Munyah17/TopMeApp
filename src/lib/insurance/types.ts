// Shared shape for a single product's dynamic signup/eligibility field, as
// stored in insurance_products.signup_fields (see the migration's comment
// on that column for why this shape is a considered *placeholder*: it
// hasn't been validated against Tariqify's real per-product response yet,
// because none of their documented endpoints resolve against the
// confirmed live host (portal.motions.co.zw — the API key authenticates
// there, so host/key are right, but every documented path 404s as
// "Unknown endpoint"). What changes once that's fixed is the sync job
// that MAPS Tariqify's real field-schema into this shape — not this type,
// not the renderer that reads it — provided their real schema is
// reasonably close to "a list of typed, labelled fields." If it's
// structurally different (e.g. nested/conditional fields), this type
// grows to match; it isn't a foundation anything upstream depends on yet.
export type InsuranceFieldType = "text" | "number" | "date" | "select" | "phone" | "email";

export interface InsuranceSignupField {
  /** Key sent back to Tariqify — must match whatever field name their API expects. */
  key: string;
  label: string;
  type: InsuranceFieldType;
  required?: boolean;
  placeholder?: string;
  /** For type "select". */
  options?: string[];
  /** Client-side sanity check only — never the source of truth for what Tariqify will actually accept. */
  helpText?: string;
}

export interface InsuranceProduct {
  id: string;
  name: string;
  description: string | null;
  display_name: string | null;
  display_description: string | null;
  category: string | null;
  currency: string;
  image_url: string | null;
  display_image_url: string | null;
  markup_percent: number;
  // Which underwriter API this product is fulfilled through — 'tariqify'
  // (Motions Microinsurance: medical, funeral, farming, legal, travel) or
  // 'enpassent' (vehicle insurance — no key configured yet, see
  // is_purchasable below). Lets the sync job and the purchase actions tell
  // which products they're even allowed to touch, now that the catalog
  // isn't single-provider any more.
  provider: string;
  // A product can be listed (is_active) before its provider is actually
  // wired up — e.g. vehicle insurance is shown today as a USP preview
  // while EnpassentIMS isn't connected yet. is_purchasable is what the
  // buy flow actually gates on; is_active only controls whether it shows
  // in the catalog at all.
  is_purchasable: boolean;
  premium: number;
  cover_amount: number | null;
  waiting_period_days: number | null;
  min_age: number | null;
  max_age: number | null;
  features: string[];
  signup_fields: InsuranceSignupField[];
  is_active: boolean;
  sort_order: number;
}

/** What the UI should actually show — the admin override if set, else Tariqify's own copy. */
export function displayName(p: Pick<InsuranceProduct, "name" | "display_name">) {
  return p.display_name?.trim() || p.name;
}
export function displayDescription(p: Pick<InsuranceProduct, "description" | "display_description">) {
  return p.display_description?.trim() || p.description || "";
}
export function displayImage(p: Pick<InsuranceProduct, "image_url" | "display_image_url">) {
  return p.display_image_url?.trim() || p.image_url?.trim() || null;
}

/** What TopMe actually charges: Tariqify's premium plus this product's markup — always computed here, never stored. */
export function displayPremium(p: Pick<InsuranceProduct, "premium" | "markup_percent">) {
  return p.premium * (1 + p.markup_percent / 100);
}

/**
 * Enrich a DB row with fields from `raw` when the corresponding columns
 * don't exist yet (migrations 2026-09-12 and 2026-09-12b may not have been
 * applied). Falls back gracefully so the UI always has the full shape.
 */
export function enrichInsuranceProduct(row: Record<string, unknown>): InsuranceProduct {
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    display_description: (row.display_description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    currency: String(row.currency ?? "USD"),
    image_url: (row.image_url as string | null) ?? null,
    display_image_url: (row.display_image_url as string | null) ?? null,
    markup_percent: Number(row.markup_percent ?? 10),
    provider: String(row.provider ?? "tariqify"),
    is_purchasable: row.is_purchasable != null ? Boolean(row.is_purchasable) : true,
    premium: Number(row.premium ?? raw.premium ?? 0),
    cover_amount: row.cover_amount != null ? Number(row.cover_amount) : (raw.coverAmount != null ? Number(raw.coverAmount) : null),
    waiting_period_days: row.waiting_period_days != null ? Number(row.waiting_period_days) : (raw.waitingPeriodDays != null ? Number(raw.waitingPeriodDays) : null),
    min_age: row.min_age != null ? Number(row.min_age) : (raw.minAge != null ? Number(raw.minAge) : null),
    max_age: row.max_age != null ? Number(row.max_age) : (raw.maxAge != null ? Number(raw.maxAge) : null),
    features: Array.isArray(row.features) ? (row.features as string[]) : (Array.isArray(raw.features) ? (raw.features as string[]).map(String) : []),
    signup_fields: Array.isArray(row.signup_fields) ? (row.signup_fields as InsuranceSignupField[]) : [],
    is_active: row.is_active != null ? Boolean(row.is_active) : true,
    sort_order: Number(row.sort_order ?? 0),
  };
}
