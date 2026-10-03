import type { InsuranceSignupField } from "./types";

/**
 * TariqifyIMS (Motions Microinsurance) API client.
 * Base URL: https://portal.motions.co.zw/api/v1
 * Auth: Authorization: Bearer <api_key>
 * Rate limit: 60 req/min per key
 *
 * The API is strictly camelCase on the wire — requests it can't map to its
 * expected field names (clientId/productId/nationalId/policyNumber, NOT the
 * snake_case TopMe uses internally) fail validation, which was the real
 * cause of "clientId and productId must be valid UUIDs": Tariqify read
 * clientId as undefined. Every function here takes snake_case params
 * (TopMe's convention) and translates at the request boundary.
 *
 * Confirmed against the live API 2026-10-04 — POST /clients requires
 * name+phone+nationalId; POST /policies accepts a UUID, a national ID
 * directly in clientId, or a separate clientNationalId field; POST /quotes
 * needs only productId; POST /payments needs policyNumber+amount.
 */

/** Tariqify rejects a duplicate POST /clients with 409 — the id is
 *  national-ID-keyed upstream, so callers can still reference the client by
 *  that national ID at policy time. */
export class TariqifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "TariqifyApiError";
  }
}

/** Tariqify stores national IDs in canonical form (no separators, upper
 *  case) — send it that way so our records match what it echoes back. */
function canonicalNationalId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function config() {
  const baseUrl = process.env.TARIQIFY_BASE_URL;
  const apiKey = process.env.TARIQIFY_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("TariqifyIMS is not configured — set TARIQIFY_BASE_URL and TARIQIFY_API_KEY.");
  }
  return { baseUrl, apiKey };
}

// Confirmed against the real live API (2026-09-12): responses are NOT the
// {success, message, error, data} envelope originally assumed here — that
// assumption was written before real credentials existed to check it
// against, and it was wrong. A real 200 from GET /products comes back as
// bare `{"data": [...]}` with no `success` key at all, so the old check
// `!parsed.success` was truthy on every single successful call and this
// client threw "failed" on 100% of requests — the actual root cause of
// "no insurance product has ever been fetched successfully", not a wrong
// endpoint or a bad key. Success is now judged by HTTP status alone, which
// is the only thing every documented endpoint is guaranteed to set
// consistently; `data` is unwrapped if present, else the raw body is used
// as-is so an endpoint that returns its payload unwrapped still works.
interface TariqifyEnvelope<T> {
  message?: string;
  error?: string;
  data?: T;
}

async function tariqifyRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> } = { method: "GET" }
): Promise<T> {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: TariqifyEnvelope<T> | T;
  try {
    parsed = text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new Error(`TariqifyIMS returned a non-JSON response from ${path} (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const envelope = parsed as TariqifyEnvelope<T>;
    throw new TariqifyApiError(
      `TariqifyIMS ${path} failed (${res.status}): ${envelope?.error || envelope?.message || text.slice(0, 300)}`,
      res.status,
      parsed
    );
  }
  const envelope = parsed as TariqifyEnvelope<T>;
  return (envelope && typeof envelope === "object" && "data" in envelope ? envelope.data : parsed) as T;
}

// Product field types from TariqifyIMS mapped to our InsuranceFieldType
const FIELD_TYPE_MAP: Record<string, InsuranceSignupField["type"]> = {
  text: "text",
  number: "number",
  date: "date",
  select: "select",
  phone: "phone",
  email: "email",
};

export interface TariqifyProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  currency: string;
  image_url: string | null;
  // Real GET /products fields (confirmed live 2026-09-12) — no signup_fields,
  // currency, image_url or is_active come back from this endpoint at all;
  // those four are filled in with sane defaults below rather than modelled
  // from a response that doesn't carry them.
  premium: number;
  cover_amount: number | null;
  waiting_period_days: number | null;
  min_age: number | null;
  max_age: number | null;
  features: string[];
  signup_fields: Array<{
    key: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  is_active: boolean;
  raw: Record<string, unknown>;
}

export interface TariqifyClient {
  id: string;
  national_id: string;
  full_name: string;
  phone?: string;
  raw: Record<string, unknown>;
}

export interface TariqifyQuote {
  base_premium: number;
  currency: string;
  eligible: boolean;
  message?: string;
  raw: Record<string, unknown>;
}

export interface TariqifyPolicy {
  policy_number: string;
  product_id: string;
  client_id: string;
  status: string;
  premium: number;
  currency: string;
  raw: Record<string, unknown>;
}

export interface TariqifyPayment {
  id: string;
  policy_number: string;
  amount: number;
  currency: string;
  status: string;
  raw: Record<string, unknown>;
}

/**
 * GET /api/v1/products
 * List active insurance products available to sell.
 */
export async function getProducts(): Promise<TariqifyProduct[]> {
  const data = await tariqifyRequest<unknown[]>("/products");
  return (data as Record<string, unknown>[]).map((item) => ({
    id: String(item.id),
    name: String(item.name),
    description: item.description ? String(item.description) : null,
    category: item.category ? String(item.category) : null,
    // Not returned by this endpoint — every product Tariqify sells is USD
    // and this listing has no image field, so these are fixed defaults
    // rather than a mapping from a response field that doesn't exist.
    currency: "USD",
    image_url: null,
    premium: Number(item.premium) || 0,
    cover_amount: item.coverAmount != null ? Number(item.coverAmount) : null,
    waiting_period_days: item.waitingPeriodDays != null ? Number(item.waitingPeriodDays) : null,
    min_age: item.minAge != null ? Number(item.minAge) : null,
    max_age: item.maxAge != null ? Number(item.maxAge) : null,
    features: Array.isArray(item.features) ? (item.features as unknown[]).map(String) : [],
    signup_fields: Array.isArray(item.signup_fields)
      ? (item.signup_fields as Record<string, unknown>[]).map((field) => ({
          key: String(field.key),
          label: String(field.label),
          type: FIELD_TYPE_MAP[String(field.type)] || "text",
          required: field.required === true,
          placeholder: field.placeholder ? String(field.placeholder) : undefined,
          options: Array.isArray(field.options) ? (field.options as string[]) : undefined,
        }))
      : [],
    // GET /products is documented as "list active insurance products" — it
    // doesn't hand back an is_active flag because everything it returns
    // already is active.
    is_active: true,
    raw: item,
  }));
}

/**
 * POST /api/v1/clients
 * Register a new client (or fetch an existing one by national ID).
 */
export async function createOrGetClient(params: {
  national_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  address?: string;
  occupation?: string;
}): Promise<TariqifyClient> {
  const nationalId = canonicalNationalId(params.national_id);
  const body: Record<string, unknown> = {
    name: params.full_name,
    nationalId,
    phone: params.phone,
    email: params.email,
    dateOfBirth: params.date_of_birth,
    address: params.address,
    occupation: params.occupation,
  };
  // Strip undefineds so optional fields don't serialise as JSON nulls.
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  try {
    const data = await tariqifyRequest<Record<string, unknown>>("/clients", {
      method: "POST",
      body,
    });
    return {
      id: String(data.id ?? nationalId),
      national_id: String(data.nationalId ?? data.national_id ?? nationalId),
      full_name: String(data.name ?? data.full_name ?? data.fullName ?? params.full_name),
      phone: data.phone ? String(data.phone) : params.phone,
      raw: data,
    };
  } catch (error) {
    // 409 = the national ID is already registered (any agent's book — the
    // client id isn't returned, but /policies resolves national IDs
    // directly, so id= national ID keeps the whole flow working).
    if (error instanceof TariqifyApiError && error.status === 409) {
      return {
        id: nationalId,
        national_id: nationalId,
        full_name: params.full_name,
        phone: params.phone,
        raw: { duplicate: true, nationalId },
      };
    }
    throw error;
  }
}

/**
 * GET /api/v1/clients?nationalId=
 * Look up a client in our own book by national ID (added by Tariqify
 * 2026-10-04, under the existing policies:read scope). Returns null when
 * the national ID isn't registered.
 */
export async function getClientByNationalId(nationalId: string): Promise<TariqifyClient | null> {
  let data: unknown;
  try {
    data = await tariqifyRequest<unknown>(`/clients?nationalId=${encodeURIComponent(canonicalNationalId(nationalId))}`);
  } catch (error) {
    // A miss may come back as a 404 rather than an empty list.
    if (error instanceof TariqifyApiError && error.status === 404) return null;
    throw error;
  }
  const rows = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  const client = rows.find((r) => r && typeof r === "object" && (r.id || r.nationalId || r.national_id));
  if (!client) return null;
  return {
    id: String(client.id),
    national_id: String(client.nationalId ?? client.national_id),
    full_name: String(client.name ?? client.fullName ?? client.full_name),
    phone: client.phone ? String(client.phone) : undefined,
    raw: client,
  };
}

/**
 * POST /api/v1/quotes
 * Get a premium quote and eligibility check for a product.
 *
 * Verified live (2026-10-04): requires `productId`; the response is
 * `{data: {productId, productName, eligible, premium, coverAmount,
 * waitingPeriodDays}}` — the premium comes back as `premium`, not
 * `base_premium`.
 */
export async function getQuote(params: {
  product_id: string;
  national_id: string;
  field_values?: Record<string, unknown>;
}): Promise<TariqifyQuote> {
  // Live quote response (2026-10-04): {productId, productName, eligible,
  // premium, coverAmount, waitingPeriodDays} — the premium arrives as
  // `premium`, not `base_premium`, and there is no currency field.
  const data = await tariqifyRequest<Record<string, unknown>>("/quotes", {
    method: "POST",
    body: {
      productId: params.product_id,
      nationalId: canonicalNationalId(params.national_id),
      fieldValues: params.field_values,
    },
  });
  return {
    base_premium: Number(data.premium ?? data.base_premium ?? data.basePremium),
    currency: String(data.currency || "USD"),
    eligible: data.eligible === true,
    message: data.message ? String(data.message) : undefined,
    raw: data,
  };
}

/**
 * POST /api/v1/policies
 * Create a policy for a client. Attributed to the developer as agent.
 *
 * Verified live (2026-10-04): requires `clientId` (the UUID from
 * POST /clients, or a national ID — Tariqify resolves it against
 * clients.national_id) or `clientNationalId`, plus `productId`. This was
 * the "clientId and productId must be valid UUIDs" failure: we sent
 * snake_case keys, so both arrived undefined.
 */
export async function createPolicy(params: {
  product_id: string;
  /** Tariqify client UUID — OR a national ID, which /policies resolves
   *  directly since their national-ID fix (2026-10-04). */
  client_id: string;
  /** Always send the customer's national ID too when known — guarantees
   *  client resolution even if the UUID isn't in our agent book. */
  client_national_id?: string;
  premium: number;
  currency: string;
  /** Dependant rows from the application — Tariqify persists fields its
   *  schema knows and ignores the rest, so sending these is safe. */
  dependants?: { name: string; relationship?: string; dob?: string; national_id?: string }[];
}): Promise<TariqifyPolicy> {
  const body: Record<string, unknown> = {
    productId: params.product_id,
    clientId: params.client_id,
    premium: params.premium,
    currency: params.currency,
    dependants: params.dependants?.map((d) => ({
      name: d.name,
      relationship: d.relationship,
      dob: d.dob,
      nationalId: d.national_id ? canonicalNationalId(d.national_id) : undefined,
    })),
  };
  if (params.client_national_id) body.clientNationalId = canonicalNationalId(params.client_national_id);
  if (!body.dependants) delete body.dependants;
  const data = await tariqifyRequest<Record<string, unknown>>("/policies", {
    method: "POST",
    body,
  });
  return {
    policy_number: String(data.policyNumber ?? data.policy_number),
    product_id: String(data.productId ?? data.product_id ?? params.product_id),
    client_id: String(data.clientId ?? data.client_id ?? params.client_id),
    status: String(data.status),
    premium: Number(data.premium ?? params.premium),
    currency: String(data.currency ?? params.currency),
    raw: data,
  };
}

/**
 * GET /api/v1/policies/:policyNumber
 * Look up a policy the developer created.
 */
export async function getPolicy(policyNumber: string): Promise<TariqifyPolicy> {
  const data = await tariqifyRequest<Record<string, unknown>>(`/policies/${policyNumber}`);
  return {
    policy_number: String(data.policyNumber ?? data.policy_number ?? policyNumber),
    product_id: String(data.productId ?? data.product_id),
    client_id: String(data.clientId ?? data.client_id),
    status: String(data.status),
    premium: Number(data.premium),
    currency: String(data.currency ?? "USD"),
    raw: data,
  };
}

/**
 * POST /api/v1/payments
 * Record a premium payment against a policy.
 *
 * Verified live (2026-10-04): requires `policyNumber` and a positive
 * `amount` — snake_case `policy_number` was rejected.
 */
export async function recordPayment(params: {
  policy_number: string;
  amount: number;
  currency: string;
}): Promise<TariqifyPayment> {
  const data = await tariqifyRequest<Record<string, unknown>>("/payments", {
    method: "POST",
    body: {
      policyNumber: params.policy_number,
      amount: params.amount,
      currency: params.currency,
    },
  });
  return {
    id: String(data.id),
    policy_number: String(data.policyNumber ?? data.policy_number ?? params.policy_number),
    amount: Number(data.amount ?? params.amount),
    currency: String(data.currency ?? params.currency),
    status: String(data.status),
    raw: data,
  };
}

/**
 * POST /api/v1/tickets
 * File a support ticket for one of your clients.
 *
 * Verified live (2026-10-04): requires `subject`, `description` and
 * `clientId` — the previous body (`message`/`client_id`) was rejected.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createTicket(params: {
  policy_number?: string;
  client_id?: string;
  subject: string;
  message: string;
}): Promise<Record<string, unknown>> {
  // /tickets is stricter than /policies: clientId must be a UUID — national
  // IDs are rejected. When our stored client ref is a national ID (the
  // duplicate-registration path), resolve it to the UUID via the pull
  // endpoint first.
  let clientId = params.client_id;
  if (clientId && !UUID_RE.test(clientId)) {
    const resolved = await getClientByNationalId(clientId);
    if (!resolved || !UUID_RE.test(resolved.id)) {
      throw new Error(
        `TariqifyIMS /tickets requires a UUID clientId — could not resolve "${clientId}" to a client UUID`
      );
    }
    clientId = resolved.id;
  }
  const body: Record<string, unknown> = {
    policyNumber: params.policy_number,
    clientId,
    subject: params.subject,
    description: params.message,
  };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return tariqifyRequest<Record<string, unknown>>("/tickets", {
    method: "POST",
    body,
  });
}

/**
 * GET /api/v1/policies
 * List our whole book with client + product names (added by Tariqify
 * 2026-10-04 under the existing policies:read scope). Rows are returned
 * as-is in `raw` — their exact shape isn't verified yet.
 */
export async function getPolicies(): Promise<Record<string, unknown>[]> {
  const data = await tariqifyRequest<unknown>("/policies");
  return (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
}
