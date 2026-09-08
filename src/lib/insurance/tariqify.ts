import type { InsuranceSignupField } from "./types";

/**
 * TariqifyIMS (Motions Microinsurance) API client.
 * Base URL: https://portal.motions.co.zw/api/v1
 * Auth: Authorization: Bearer <api_key>
 * Rate limit: 60 req/min per key
 */

function config() {
  const baseUrl = process.env.TARIQIFY_BASE_URL;
  const apiKey = process.env.TARIQIFY_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("TariqifyIMS is not configured — set TARIQIFY_BASE_URL and TARIQIFY_API_KEY.");
  }
  return { baseUrl, apiKey };
}

interface TariqifyEnvelope<T> {
  success: boolean;
  message?: string;
  error?: string;
  data: T;
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
  let parsed: TariqifyEnvelope<T>;
  try {
    parsed = text ? JSON.parse(text) : { success: false, data: undefined as T };
  } catch {
    throw new Error(`TariqifyIMS returned a non-JSON response from ${path} (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || !parsed.success) {
    throw new Error(`TariqifyIMS ${path} failed (${res.status}): ${parsed.error || parsed.message || text.slice(0, 300)}`);
  }
  return parsed.data;
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
  description: string;
  category: string;
  currency: string;
  image_url?: string;
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
    currency: item.currency ? String(item.currency) : "USD",
    image_url: item.image_url ? String(item.image_url) : null,
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
    is_active: item.is_active === true,
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
}): Promise<TariqifyClient> {
  const data = await tariqifyRequest<Record<string, unknown>>("/clients", {
    method: "POST",
    body: params,
  });
  return {
    id: String(data.id),
    national_id: String(data.national_id),
    full_name: String(data.full_name),
    phone: data.phone ? String(data.phone) : undefined,
    raw: data,
  };
}

/**
 * POST /api/v1/quotes
 * Get a premium quote and eligibility check for a product.
 */
export async function getQuote(params: {
  product_id: string;
  national_id: string;
  field_values?: Record<string, unknown>;
}): Promise<TariqifyQuote> {
  const data = await tariqifyRequest<Record<string, unknown>>("/quotes", {
    method: "POST",
    body: params,
  });
  return {
    base_premium: Number(data.base_premium),
    currency: String(data.currency || "USD"),
    eligible: data.eligible === true,
    message: data.message ? String(data.message) : undefined,
    raw: data,
  };
}

/**
 * POST /api/v1/policies
 * Create a policy for a client. Attributed to the developer as agent.
 */
export async function createPolicy(params: {
  product_id: string;
  client_id: string;
  premium: number;
  currency: string;
}): Promise<TariqifyPolicy> {
  const data = await tariqifyRequest<Record<string, unknown>>("/policies", {
    method: "POST",
    body: params,
  });
  return {
    policy_number: String(data.policy_number),
    product_id: String(data.product_id),
    client_id: String(data.client_id),
    status: String(data.status),
    premium: Number(data.premium),
    currency: String(data.currency),
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
    policy_number: String(data.policy_number),
    product_id: String(data.product_id),
    client_id: String(data.client_id),
    status: String(data.status),
    premium: Number(data.premium),
    currency: String(data.currency),
    raw: data,
  };
}

/**
 * POST /api/v1/payments
 * Record a premium payment against a policy.
 */
export async function recordPayment(params: {
  policy_number: string;
  amount: number;
  currency: string;
}): Promise<TariqifyPayment> {
  const data = await tariqifyRequest<Record<string, unknown>>("/payments", {
    method: "POST",
    body: params,
  });
  return {
    id: String(data.id),
    policy_number: String(data.policy_number),
    amount: Number(data.amount),
    currency: String(data.currency),
    status: String(data.status),
    raw: data,
  };
}

/**
 * POST /api/v1/tickets
 * File a support ticket for one of your clients.
 */
export async function createTicket(params: {
  policy_number?: string;
  client_id?: string;
  subject: string;
  message: string;
}): Promise<Record<string, unknown>> {
  return tariqifyRequest<Record<string, unknown>>("/tickets", {
    method: "POST",
    body: params,
  });
}
