import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/**
 * VitalPay (by Tayari / KMG Vital Links) — primary biller aggregator.
 * Base URL: https://kmgvitallinks.co.uk/api/v1. Auth: `Authorization: Bearer
 * <secret key>`, confirmed against the real API reference (2026-07-25).
 *
 * Coverage confirmed by calling the sandbox catalog endpoints directly
 * (GET /airtime/operators, /bills/billers, /gift-cards/products for
 * country_iso=ZW) — see the "not covered" list in vitalpayCoverageNotes()
 * below for what's NOT mapped here and needs a different provider.
 *
 * Airtime/data and bills are async: VitalPay returns status=processing
 * immediately, then delivers the final state via a `service.completed` /
 * `service.failed` webhook — see src/app/api/vitalpay/webhook/route.ts.
 * That's why handlers below can return a "pending" FulfillmentResult.
 */

function config() {
  const baseUrl = process.env.VITALPAY_BASE_URL;
  const secretKey = process.env.VITALPAY_SECRET_KEY;
  if (!baseUrl || !secretKey) {
    throw new Error("VitalPay is not configured — set VITALPAY_BASE_URL and VITALPAY_SECRET_KEY.");
  }
  return { baseUrl, secretKey };
}

interface VitalPayEnvelope<T> {
  success: boolean;
  message?: string;
  error?: string;
  data: T;
}

async function vitalpayRequest<T>(path: string, init: { method: "GET" | "POST"; body?: Record<string, unknown> } = { method: "GET" }): Promise<T> {
  const { baseUrl, secretKey } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretKey}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: VitalPayEnvelope<T>;
  try {
    parsed = text ? JSON.parse(text) : { success: false, data: undefined as T };
  } catch {
    throw new Error(`VitalPay returned a non-JSON response from ${path} (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || !parsed.success) {
    throw new Error(`VitalPay ${path} failed (${res.status}): ${parsed.error || parsed.message || text.slice(0, 300)}`);
  }
  return parsed.data;
}

// Operator ids confirmed live via GET /airtime/operators?country_iso=ZW.
// Telecel is NOT in VitalPay's catalog yet — that network falls through to
// the simulated provider until VitalPay (or another provider) adds it.
const AIRTIME_OPERATORS: Record<string, string> = {
  econet: "econet_zw",
  netone: "netone_zw",
};

// Biller ids confirmed live via GET /bills/billers?country=ZW.
const BILLERS: Record<string, { billerCode: string; billType: string }> = {
  dstv: { billerCode: "dstv_zw", billType: "tv" },
  zol: { billerCode: "zol_zw", billType: "internet" },
  telone: { billerCode: "telone_zw", billType: "telecom" },
  // Bulawayo is the only one of the 26 councils in our catalog VitalPay
  // actually carries a biller for (confirmed 2026-08-01) — the rest stay on
  // the simulated provider until VitalPay (or another aggregator) adds them.
  bulawayo_city_council: { billerCode: "bulawayo_city_zw", billType: "municipal" },
};

function toPendingOrFulfilled(status: string, reference: string): FulfillmentResult {
  if (status === "completed" || status === "successful") return { status: "fulfilled", providerRef: reference };
  if (status === "failed") return { status: "failed", providerRef: reference };
  return { status: "pending", providerRef: reference, message: "Processing with VitalPay — final status arrives via webhook." };
}

type ServiceHandler = (input: FulfillmentInput) => Promise<FulfillmentResult>;

const SERVICE_HANDLERS: Record<string, ServiceHandler> = {
  airtime: async (input) => {
    const operatorId = input.networkId ? AIRTIME_OPERATORS[input.networkId] : undefined;
    if (!operatorId) {
      throw new Error(`VitalPay doesn't carry network "${input.networkId}" yet — falling back to simulated.`);
    }
    const data = await vitalpayRequest<{ reference: string; status: string }>("/airtime/purchase", {
      method: "POST",
      body: { operator_id: operatorId, phone: input.recipient, amount: input.amount, currency: "USD", reference: input.transactionId, type: "airtime" },
    });
    return toPendingOrFulfilled(data.status, data.reference);
  },
};

for (const [serviceId, { billerCode, billType }] of Object.entries(BILLERS)) {
  SERVICE_HANDLERS[serviceId] = async (input) => {
    const data = await vitalpayRequest<{ reference: string; status: string }>("/bills/pay", {
      method: "POST",
      body: {
        biller_code: billerCode,
        account_number: input.recipient,
        amount: input.amount,
        currency: "USD",
        country: "ZW",
        reference: input.transactionId,
        bill_type: billType,
      },
    });
    return toPendingOrFulfilled(data.status, data.reference);
  };
}

// Electricity is its own category (not /bills/pay): confirmed live to cover
// ZW/ZESA (2026-08-01). Often resolves synchronously with the token in the
// response, unlike airtime/bills which are always async-via-webhook. The
// docs show a `token_pieces` array, but the real sandbox response returns a
// single `token` string (confirmed by an actual test call) — handle both
// shapes rather than trust the docs' example literally.
SERVICE_HANDLERS.zesa = async (input) => {
  const data = await vitalpayRequest<{
    reference: string;
    status: string;
    token?: string;
    token_pieces?: string[];
    units?: number;
    unit?: string;
  }>("/electricity/purchase", {
    method: "POST",
    body: { meter_number: input.recipient, amount: input.amount, currency: "USD", country: "ZW", reference: input.transactionId },
  });
  const result = toPendingOrFulfilled(data.status, data.reference);
  const tokenPieces = data.token_pieces?.length ? data.token_pieces : data.token ? [data.token] : [];
  if (tokenPieces.length) {
    result.extra = { token_pieces: tokenPieces, units: data.units, unit: data.unit };
    result.message = `Token: ${tokenPieces.join(" ")}${data.units ? ` · ${data.units} ${data.unit ?? "kWh"}` : ""}`;
  }
  return result;
};

async function notMapped(serviceId: string): Promise<FulfillmentResult> {
  throw new Error(`No VitalPay endpoint mapped for service "${serviceId}" — see vitalpayCoverageNotes().`);
}

export class VitalPayProvider implements FulfillmentProvider {
  readonly name = "vitalpay";
  // Airtime (Econet/NetOne), the 4 confirmed billers, and ZESA electricity.
  // Everything else in the catalog is routed elsewhere — see VITALPAY_GAPS below.
  readonly coverage = Object.keys(SERVICE_HANDLERS);

  async fulfil(input: FulfillmentInput): Promise<FulfillmentResult> {
    config(); // throws early with a clear message if env vars are missing
    const handler = SERVICE_HANDLERS[input.serviceId];
    if (!handler) return notMapped(input.serviceId);
    return handler(input);
  }
}

/**
 * Confirmed by calling the live sandbox catalog (2026-08-01, re-checked
 * against VitalPay's full API docs) — not guessed. Services in our catalog
 * that VitalPay does NOT currently cover, and why. Kept here (rather than
 * only in chat/memory) so it stays visible in the codebase for whoever wires
 * up the next provider.
 */
export const VITALPAY_GAPS = {
  data: "GET /data/operators?country_iso=ZW returned zero operators — no Zimbabwean data bundle catalog yet, despite the endpoint existing generally.",
  telecel: "Not in GET /airtime/operators?country_iso=ZW (only econet_zw, netone_zw) — Telecel airtime unmapped.",
  council: "Of the 26 councils/municipalities/town councils in our catalog, only bulawayo_city_zw exists in GET /bills/billers (wired up as bulawayo_city_council) — the other 25 stay simulated until VitalPay adds more.",
  schoolfees: "No education-type billers appear in GET /bills/billers despite the bills category description mentioning education generally — none of our 5 university services (msu/uz/nust/cut/hit) map to a real biller.",
  netflix_spotify_vouchers: "GET /gift-cards/products?country=ZW only returns 3 generic 'Sandbox ...' placeholder SKUs, not real branded cards (no Netflix/Spotify) — needs VitalPay to confirm real ZW gift card SKUs, or another provider.",
  govfees: "No ZIMRA/national government biller in the catalog — outside VitalPay's bills/VAS scope.",
  fuel: "No fuel voucher product in airtime, bills, or gift-card catalogs.",
  insurance: "vehicleinsurance/legalinsurance/agriinsurance/hospitalcash/funeralcash — VitalPay is a payments/VAS aggregator, not an insurance underwriter API; needs a dedicated insurer integration.",
  connectivity_isp: "starlink/utande/africom/esim — not in GET /bills/billers (only zol_zw, telone_zw exist for connectivity).",
  physical_goods: "solarpanels/lithiumbattery/fix32-62kva/routers/ethernetcables/laptops/phones/accessories/screens — physical goods & installs, outside a payments aggregator's scope; needs an e-commerce/logistics/installer workflow instead.",
} as const;
