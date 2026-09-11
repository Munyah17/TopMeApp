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
