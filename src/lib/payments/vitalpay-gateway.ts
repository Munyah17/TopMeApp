// VitalPay Payments Gateway — the payment-collection aggregator (EcoCash,
// InnBucks, O'mari, ZIPIT, card via Stripe under the hood), separate from
// VitalPay's airtime/bills/ZESA fulfilment API in src/lib/fulfillment/
// vitalpay.ts. Same company, two different products with two different
// base URLs and two different key pairs — deliberately not sharing env var
// names with the fulfilment client so the two can never be confused or
// accidentally cross-configured.
//
// This is what the postpaid-airtime deal turns on: TopMe stops running its
// own Paynow/EcoCash/Stripe integrations for wallet top-ups and guest
// checkout, and routes that collection through VitalPay's own gateway
// instead — VitalPay earns their cut there, TopMe gets a commission on it,
// and in exchange VitalPay bills airtime/ZESA/bills postpaid instead of
// requiring a prepaid float. Nothing on the fulfilment side changes; the
// float lives entirely on VitalPay's own books either way, so switching
// prepaid -> postpaid is a billing-arrangement change on their end, not a
// code change on ours.
//
// NOT wired into any top-up or checkout flow yet — see the migration plan
// in the PR/commit this ships with. This file is the client only, built
// ahead of having real keys so wiring it in is a small, well-tested change
// once VITALPAY_GATEWAY_SECRET_KEY exists.

function config() {
  const baseUrl = process.env.VITALPAY_GATEWAY_BASE_URL || "https://pay.kmgvitallinks.co.uk/api/v1";
  const secretKey = process.env.VITALPAY_GATEWAY_SECRET_KEY;
  if (!secretKey) {
    throw new Error("VitalPay Payments Gateway is not configured — set VITALPAY_GATEWAY_SECRET_KEY.");
  }
  return { baseUrl, secretKey };
}

async function gatewayRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> } = { method: "GET" }
): Promise<T> {
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
  let parsed: { success?: boolean; message?: string; error?: string; data?: T; meta?: unknown };
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`VitalPay Gateway returned a non-JSON response from ${path} (${res.status}): ${text.slice(0, 300)}`);
  }
  // Unlike the Tariqify client (see src/lib/insurance/tariqify.ts for that
  // fix), VitalPay's own docs show `success` on every documented response,
  // including the 422 wrong-OTP case — so it's trusted here, but res.ok is
  // still checked first since a network-level failure won't carry it.
  if (!res.ok && parsed.success !== false) {
    throw new Error(`VitalPay Gateway ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (parsed.success === false) {
    throw new Error(parsed.error || parsed.message || `VitalPay Gateway ${path} failed (${res.status}).`);
  }
  return parsed.data as T;
}

export type VitalPayPaymentMethod = "card" | "mobile_money" | "bank_transfer";
export type VitalPayPaymentStatus = "pending" | "processing" | "successful" | "failed" | "refunded" | "partially_refunded";

export interface VitalPayInitializeResult {
  reference: string;
  platform_reference: string;
  amount: number;
  currency: string;
  status: VitalPayPaymentStatus;
  mode: "test" | "live";
  payment_url: string | null;
  action?: "enter_otp" | "wait_for_confirmation";
  gateway?: string;
  sandbox?: { scenario: string };
  created_at: string;
  completed_at: string | null;
}

/**
 * POST /payments/initialize
 * Live keys return a hosted checkout URL (payment_url) to redirect the
 * customer to — same shape as Paynow's browserUrl, so this drops into the
 * existing "redirect, then poll/webhook" flow. Test keys resolve
 * immediately using metadata.test_scenario.
 */
export async function initializeVitalPayGatewayPayment(params: {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  phone?: string;
  name?: string;
  callbackUrl?: string;
  description?: string;
  paymentMethod?: VitalPayPaymentMethod;
  metadata?: Record<string, unknown>;
}): Promise<VitalPayInitializeResult> {
  return gatewayRequest<VitalPayInitializeResult>("/payments/initialize", {
    method: "POST",
    body: {
      amount: params.amount,
      currency: params.currency,
      email: params.email,
      reference: params.reference,
      phone: params.phone,
      name: params.name,
      callback_url: params.callbackUrl,
      description: params.description,
      payment_method: params.paymentMethod,
      metadata: params.metadata,
    },
  });
}

/**
 * POST /payments/mobile-money/confirm-otp
 * Only needed when initialize's response came back with action ===
 * "enter_otp" (O'mari). EcoCash/InnBucks/OneMoney confirm via USSD push
 * instead and never hit this endpoint.
 */
export async function confirmVitalPayOmariOtp(params: { reference: string; otp: string }): Promise<{ reference: string; platform_reference?: string; status: string; action?: string; gateway?: string }> {
  return gatewayRequest("/payments/mobile-money/confirm-otp", {
    method: "POST",
    body: { reference: params.reference, otp: params.otp },
  });
}

export interface VitalPayVerifyResult {
  reference: string;
  platform_reference: string;
  amount: number;
  currency: string;
  status: VitalPayPaymentStatus;
  mode: "test" | "live";
  payment_method: string;
  customer_email: string;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

/**
 * GET /payments/verify/{reference}
 * Accepts either our own reference or VitalPay's platform_reference — this
 * is what a manual "Check Payment" button calls, same role as
 * checkPaynowStatus() for Paynow.
 */
export async function verifyVitalPayGatewayPayment(reference: string): Promise<VitalPayVerifyResult> {
  return gatewayRequest<VitalPayVerifyResult>(`/payments/verify/${encodeURIComponent(reference)}`);
}

export interface VitalPayListResult {
  reference: string;
  amount: number;
  currency: string;
  status: VitalPayPaymentStatus;
}

export async function listVitalPayGatewayPayments(params?: {
  status?: VitalPayPaymentStatus;
  from?: string;
  to?: string;
  perPage?: number;
}): Promise<{ data: VitalPayListResult[]; meta: { current_page: number; per_page: number; total: number; last_page: number } }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.perPage) query.set("per_page", String(params.perPage));
  const qs = query.toString();
  // The /list envelope carries `meta` alongside `data` — gatewayRequest only
  // unwraps `data`, so this one call bypasses it to keep both.
  const { baseUrl, secretKey } = config();
  const res = await fetch(`${baseUrl}/payments/list${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const parsed = await res.json();
  if (!res.ok || parsed.success === false) {
    throw new Error(parsed.error || parsed.message || `VitalPay Gateway /payments/list failed (${res.status}).`);
  }
  return { data: parsed.data ?? [], meta: parsed.meta };
}

/**
 * POST /payments/refund
 * Omit `amount` for a full refund. Live mode routes through VitalPay's own
 * provider adapters — TopMe never touches Stripe/PayFast credentials
 * directly for a card refund initiated this way.
 */
export async function refundVitalPayGatewayPayment(params: { reference: string; amount?: number; reason?: string }): Promise<{ reference: string; refund_amount: number; status: string; refunded_at: string }> {
  return gatewayRequest("/payments/refund", {
    method: "POST",
    body: { reference: params.reference, amount: params.amount, reason: params.reason },
  });
}
