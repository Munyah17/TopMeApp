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
// Telecel is NOT in VitalPay's catalog yet — that network is deactivated
// (networks.is_active = false) so a customer can't select it.
const AIRTIME_OPERATORS: Record<string, string> = {
  econet: "econet_zw",
  netone: "netone_zw",
};

/**
 * Per-network amount constraints, pulled live from VitalPay's own catalog
 * (GET /airtime/operators). Different operators are wired very differently:
 * Econet takes any amount in a range; NetOne only sells a fixed set of
 * denominations (like physical recharge cards). We must honour this
 * BEFORE debiting the wallet — sending an unsupported amount got a 422
 * back from VitalPay after the customer had already been charged.
 */
export interface AirtimeOperatorRule {
  /** our network id (econet / netone) */
  networkId: string;
  min: number;
  max: number;
  /** Exact amounts the operator accepts, or null when any amount in [min,max] is fine. */
  fixedAmounts: number[] | null;
}

const cents = (n: number) => Math.round(n * 100);

export async function fetchAirtimeOperatorRules(): Promise<Record<string, AirtimeOperatorRule>> {
  const { baseUrl, secretKey } = config();
  const res = await fetch(`${baseUrl}/airtime/operators?country=ZW`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`VitalPay /airtime/operators failed (${res.status})`);
  const json = (await res.json()) as { data?: { operators?: Array<Record<string, unknown>> } };
  const byVpId = new Map((json.data?.operators ?? []).map((o) => [String(o.id), o]));

  const rules: Record<string, AirtimeOperatorRule> = {};
  for (const [networkId, vpId] of Object.entries(AIRTIME_OPERATORS)) {
    const op = byVpId.get(vpId);
    if (!op) continue;
    const rawFixed = Array.isArray(op.fixed_amounts)
      ? (op.fixed_amounts as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    rules[networkId] = {
      networkId,
      min: Number(op.min) || 0.5,
      max: Number(op.max) || 100,
      fixedAmounts: rawFixed.length ? [...rawFixed].sort((a, b) => a - b) : null,
    };
  }
  return rules;
}

/** Server-side gate: is `amount` valid for this operator? */
export function checkAirtimeAmount(
  rule: AirtimeOperatorRule | undefined,
  amount: number
): { ok: true } | { ok: false; message: string } {
  if (!rule) return { ok: true }; // unknown operator — the fulfil handler is the backstop
  if (rule.fixedAmounts) {
    const allowed = rule.fixedAmounts.map(cents);
    if (!allowed.includes(cents(amount))) {
      return {
        ok: false,
        message: `This network only sells set amounts — pick one of ${rule.fixedAmounts.map((a) => `$${a}`).join(", ")}.`,
      };
    }
    return { ok: true };
  }
  if (amount < rule.min) return { ok: false, message: `The minimum top-up for this network is $${rule.min.toFixed(2)}.` };
  if (amount > rule.max) return { ok: false, message: `The maximum top-up for this network is $${rule.max.toFixed(2)}.` };
  return { ok: true };
}

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

// True when VitalPay carries a biller for this service — i.e. the
// /bills/validate account-holder lookup can run. Flows gate their
// owner-name check on this so phone-number services (bundles, gifts)
// don't waste a round trip on a lookup that can't exist.
export function supportsBillAccountValidation(serviceId: string): boolean {
  return serviceId in BILLERS;
}

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

/**
 * Prepaid ZESA meter validation — GET /electricity/validate?meter_number=..&country=ZW
 * (confirmed live 2026-09-09: the route is GET-only and takes meter_number +
 * country as query params). VitalPay proxies ZETDC's own lookup, so a
 * successful response carries the registered customer name / address for
 * that meter and an unknown meter comes back as a 422 with a
 * `meter_number` field error. We surface the name in checkout so the buyer
 * can confirm they're topping up the right meter before paying.
 *
 * The exact success-envelope field names weren't in any doc we have and a
 * real meter wasn't on hand to capture one, so `pick()` below tries every
 * plausible key (and one level of nesting) rather than trusting a single
 * shape — worst case the name is null and checkout still works.
 */
export type ElectricityMeterCheck =
  | {
      valid: true;
      meterNumber: string;
      customerName: string | null;
      address: string | null;
      raw: Record<string, unknown>;
    }
  | { valid: false; reason: "invalid_meter" | "unavailable"; message: string };

export async function validateElectricityMeter(meterNumber: string): Promise<ElectricityMeterCheck> {
  const { baseUrl, secretKey } = config();
  const meter = meterNumber.trim();

  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/electricity/validate?meter_number=${encodeURIComponent(meter)}&country=ZW`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${secretKey}` } }
    );
  } catch {
    return { valid: false, reason: "unavailable", message: "Meter check is temporarily unavailable." };
  }

  const text = await res.text();
  let parsed:
    | (VitalPayEnvelope<Record<string, unknown>> & { errors?: Record<string, string[]> })
    | null = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return { valid: false, reason: "unavailable", message: "Meter check is temporarily unavailable." };
  }

  if (res.ok && parsed?.success && parsed.data && typeof parsed.data === "object") {
    const flat: Record<string, unknown> = { ...parsed.data };
    for (const nestKey of ["customer", "meter", "details", "data"]) {
      const nested = (parsed.data as Record<string, unknown>)[nestKey];
      if (nested && typeof nested === "object") Object.assign(flat, nested);
    }
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = flat[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return null;
    };
    return {
      valid: true,
      meterNumber: pick("meter_number", "meterNumber", "meter") ?? meter,
      customerName: pick(
        "customer_name",
        "customerName",
        "name",
        "account_name",
        "accountName",
        "customer",
        "holder",
        "owner",
        "full_name"
      ),
      address: pick(
        "customer_address",
        "customerAddress",
        "address",
        "physical_address",
        "physicalAddress",
        "customer_addr"
      ),
      raw: parsed.data as Record<string, unknown>,
    };
  }

  const fieldError =
    parsed?.errors?.meter_number?.[0] ?? parsed?.errors?.meterNumber?.[0] ?? null;
  if (res.status === 422 && fieldError) {
    return {
      valid: false,
      reason: "invalid_meter",
      message: "We couldn't find that meter number. Please double-check it and try again.",
    };
  }

  return { valid: false, reason: "unavailable", message: "Meter check is temporarily unavailable." };
}

/**
 * Biller account validation — GET /bills/validate?biller_code=..&account_number=..&country=ZW.
 * Same idea as the ZESA meter check above: VitalPay proxies the biller's own
 * lookup (ZOL, DStv, TelOne, Bulawayo City Council — the BILLERS map), so a
 * good account returns the registered customer name for the buyer to confirm
 * before paying, and an unknown account comes back as a 422 field error.
 *
 * The endpoint's exact success-envelope shape isn't in any doc we have, so
 * `pick()` tries every plausible key (and one level of nesting) — worst case
 * the name is null and checkout still works. If the route itself doesn't
 * exist for a biller, the non-OK status lands in "unavailable" and the
 * caller treats the check as skipped rather than blocking the payment.
 */
export type BillAccountCheck =
  | {
      valid: true;
      accountNumber: string;
      customerName: string | null;
      raw: Record<string, unknown>;
    }
  | { valid: false; reason: "invalid_account" | "unavailable"; message: string };

export async function validateBillAccount(serviceId: string, accountNumber: string): Promise<BillAccountCheck> {
  const biller = BILLERS[serviceId];
  if (!biller) {
    return { valid: false, reason: "unavailable", message: "No biller mapping for this service." };
  }
  const { baseUrl, secretKey } = config();
  const account = accountNumber.trim();

  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/bills/validate?biller_code=${encodeURIComponent(biller.billerCode)}&account_number=${encodeURIComponent(account)}&country=ZW`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${secretKey}` } }
    );
  } catch {
    return { valid: false, reason: "unavailable", message: "Account check is temporarily unavailable." };
  }

  const text = await res.text();
  let parsed:
    | (VitalPayEnvelope<Record<string, unknown>> & { errors?: Record<string, string[]> })
    | null = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return { valid: false, reason: "unavailable", message: "Account check is temporarily unavailable." };
  }

  if (res.ok && parsed?.success && parsed.data && typeof parsed.data === "object") {
    const flat: Record<string, unknown> = { ...parsed.data };
    for (const nestKey of ["customer", "account", "details", "data", "biller"]) {
      const nested = (parsed.data as Record<string, unknown>)[nestKey];
      if (nested && typeof nested === "object") Object.assign(flat, nested);
    }
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = flat[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return null;
    };
    return {
      valid: true,
      accountNumber: pick("account_number", "accountNumber", "account") ?? account,
      customerName: pick(
        "customer_name",
        "customerName",
        "name",
        "account_name",
        "accountName",
        "account_holder",
        "accountHolder",
        "customer",
        "holder",
        "owner",
        "full_name",
        "subscriber",
        "subscriber_name"
      ),
      raw: parsed.data as Record<string, unknown>,
    };
  }

  const fieldError =
    parsed?.errors?.account_number?.[0] ?? parsed?.errors?.accountNumber?.[0] ?? null;
  if ((res.status === 422 || res.status === 404) && (fieldError || res.status === 422)) {
    return {
      valid: false,
      reason: "invalid_account",
      message: "We couldn't find that account number. Please double-check it and try again.",
    };
  }

  return { valid: false, reason: "unavailable", message: "Account check is temporarily unavailable." };
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
