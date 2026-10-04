import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/**
 * Paynow BillPay — Vendor API client (reseller side).
 * Base URL: https://billpay.paynow.co.zw. Auth: HTTP Basic (API user
 * credentials issued by Paynow support).
 *
 * Docs contract (implemented 2026-10-04, ahead of credential issuance):
 * - HTTP 200 does NOT mean success — the `Status` field decides
 *   (Authorized / BeingProcessed / Paid / Reversed / Failed / Flagged).
 * - Payments are two-stage on the same payload: Action=AUTH validates the
 *   member + product + wallet funding first; Action=PAY then debits the
 *   vendor wallet and provisions the service. AUTH and PAY must be
 *   identical except where AUTH returns a balance amount (then TotalAmount
 *   / Price are left blank on PAY).
 * - Dual currency: ZWG wallet for local products, USD wallet for products
 *   where RequiresForexPayment is true.
 * - Recommended timeout: 60s. Timeouts on PAY MUST be followed by a Status
 *   inquiry (120s, then 180s intervals) — never blind-retry a debit.
 * - Vouchers arrive in PAY response Products[].Vouchers; ReceiptHtml /
 *   ReceiptSmses / DisplayData ride in PaymentData and MUST each be shared
 *   with the customer individually.
 */

function config() {
  const baseUrl = (process.env.BILLPAY_BASE_URL || "https://billpay.paynow.co.zw").replace(/\/$/, "");
  const username = process.env.BILLPAY_USERNAME;
  const password = process.env.BILLPAY_PASSWORD;
  if (!username || !password) {
    throw new Error("Paynow BillPay is not configured — set BILLPAY_USERNAME and BILLPAY_PASSWORD.");
  }
  return { baseUrl, authHeader: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` };
}

/** Credentials present? Selector/health checks use this so an unconfigured
 *  BillPay is never routed traffic — it simply isn't a candidate. */
export function billpayConfigured(): boolean {
  return Boolean(process.env.BILLPAY_USERNAME && process.env.BILLPAY_PASSWORD);
}

export class BillPayApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "BillPayApiError";
  }
}

const REQUEST_TIMEOUT_MS = 60_000; // Paynow's recommended web service timeout

async function billpayRequest<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: Record<string, unknown>; timeoutMs?: number } = {}
): Promise<T> {
  const { baseUrl, authHeader } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // A timeout mid-PAY is the dangerous case: the debit may have landed
      // upstream. The caller must Status-inquire before retrying — surface
      // it distinctly so no code path treats it as a clean failure.
      throw new BillPayApiError(`BillPay ${path} timed out after ${init.timeoutMs ?? REQUEST_TIMEOUT_MS}ms`, 0, null);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new BillPayApiError(`BillPay returned non-JSON from ${path} (${res.status}): ${text.slice(0, 300)}`, res.status, text);
  }
  if (!res.ok) {
    // 400s carry {Message, ModelState{field:[errors]}} — flatten for logs.
    const model = (parsed as { ModelState?: Record<string, string[]> })?.ModelState;
    const detail = model
      ? Object.entries(model).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ")
      : (parsed as { Message?: string })?.Message || text.slice(0, 300);
    throw new BillPayApiError(`BillPay ${path} failed (${res.status}): ${detail}`, res.status, parsed);
  }
  return parsed as T;
}

// ─── Catalog types (ListBillers response) ────────────────────────────────

export interface BillPayProductMeta {
  Name: string;
  Required: boolean;
  Description?: string;
}

export interface BillPayProduct {
  Code: string;
  Name: string;
  Description?: string;
  /** null = priced at AUTH (bill-style) or free-priced (customer chooses) */
  Price: number | null;
  Department?: string | null;
  /** true = USD wallet required; null = AUTH decides */
  RequiresForex: boolean | null;
  ReturnsVouchers: boolean;
  IconUrl?: string;
  LogoUrl?: string;
  PrePurchaseInstructions?: string;
  PostPurchaseInstructions?: string;
  AmountFieldLabel?: string;
  AmountFieldDesc?: string;
  MinAmount?: number | null;
  MaxAmount?: number | null;
  NewProduct?: boolean;
  InvoiceTitle?: string;
  Enabled: boolean;
  ReminderDays?: number | null;
  /** null = vendor supplies price; false = AUTH returns price, part-payment
   *  allowed; true = AUTH returns price, full payment required */
  AuthAmountMandated?: boolean | null;
  AllowSpecifyQuantity?: boolean;
  QuantityFieldLabel?: string;
  QuantityFieldDesc?: string;
  MetadataFields?: BillPayProductMeta[];
}

export interface BillPayBiller {
  Code: string;
  Name: string;
  Description?: string;
  IconUrl?: string;
  LogoUrl?: string;
  ReferencePrefix?: string;
  Enabled: boolean;
  MemberNumberFieldDesc?: string;
  MemberNumberFieldLabel?: string;
  MemberNumberFieldRegex?: string;
  AllowMultipleProductsPerPayment?: boolean;
  MetaTitle?: string;
  MetaDescription?: string;
  Products: BillPayProduct[];
  VendorMustInvoicePayments?: boolean;
}

export interface BillPayWallet {
  Currency: string;
  Balance: number;
  LowBalance: number;
  MinimumBalance: number;
  Status: string; // "Open" | "Suspended" | "Closed"
}

// ─── Payment types ───────────────────────────────────────────────────────

export type BillPayAction = "AUTH" | "PAY" | "RETRY" | "STATUS";

export type BillPayStatus =
  | "Authorized"
  | "BeingProcessed"
  | "Paid"
  | "Reversed"
  | "Failed"
  | "Flagged";

export interface BillPayPaymentProduct {
  Code: string;
  Quantity?: number;
  Department?: string;
  /** Leave blank when AUTH returned the amount (AuthAmountMandated). */
  Price?: number;
  /** Required acknowledgement when the product needs the USD wallet. */
  RequiresForexPayment?: boolean;
  Metadata?: Record<string, unknown>[] | Record<string, unknown>;
}

export interface BillPayPayerDetails {
  BankAccountName?: string;
  BankAccountNumber?: string;
  BankName?: string;
  BankBranch?: string;
  BankReference?: string;
  ContactNumber?: string;
  NationalId?: string;
}

export interface BillPayVoucher {
  SerialNumber?: string;
  Pin?: string;
  ValidDays?: number | null;
  Batch?: string;
  VoucherCode?: string;
  ExpiryDate?: string | null;
}

export interface BillPayProductResponse {
  Name?: string;
  Code: string;
  Quantity?: number;
  Department?: string;
  Price?: number;
  AccountBalance?: number | null;
  RequiresForexPayment?: boolean;
  Vouchers?: BillPayVoucher[];
  Metadata?: Record<string, unknown>[];
  VendorCommission?: number | null;
}

export interface BillPayAuthData {
  MemberName?: string;
  MemberAddress?: string;
  AccountDetails?: Record<string, string>;
  AccountBalances?: Record<string, string>;
  AccountBalance?: number | null;
}

export interface BillPayPaymentData {
  ReceiptHtml?: string[];
  DisplayData?: Record<string, string>;
  ReceiptSmses?: string[];
}

export interface BillPayPaymentResponse {
  Action: string;
  BillerCode?: string;
  Reference: string;
  MemberNumber?: string;
  Products?: BillPayProductResponse[];
  TotalAmount?: number;
  Status: BillPayStatus;
  /** Customer-safe — show this. */
  Narration?: string;
  /** Vendor logs only — never surface to a customer. */
  TechnicalNarration?: string;
  MemberName?: string;
  BillPayReference?: string;
  AuthData?: BillPayAuthData;
  PaymentData?: BillPayPaymentData;
  BillerPaymentReference?: string;
  VendorServiceFeeCurrency?: string;
  VendorServiceFee?: number | null;
  Currency?: string;
  WalletDebitReference?: string;
  WalletBalanceAfterDebit?: number | null;
  WalletDebitReversed?: string | null;
  WalletBalanceAfterReversal?: number | null;
  VendorInvoiceReference?: string;
  VendorFiscalSignature?: string;
  VendorFiscalMetadata?: string;
  VendorReversalReference?: string;
}

export interface BillPayReverseResponse {
  OriginalReference?: string;
  Reference?: string;
  /** 0 = success; 1 not found, 2 duplicate ref, 3 biller failed,
   *  4 not supported, 5 already refunded, 99 general */
  ErrorCode: number;
  Narration?: string;
  TechnicalNarration?: string;
  BillpayReference?: string;
  BillerReference?: string;
}

export interface BillPayMemberResponse {
  AuthData?: BillPayAuthData;
  /** 0 = member not found (permanent), 1 = found, 2 = biller offline */
  ResultCode: 0 | 1 | 2;
  Narration?: string;
  TechnicalNarration?: string;
}

// ─── Endpoints ───────────────────────────────────────────────────────────

/** GET /api/payment/ListBillers — full catalog is heavy; always prefer
 *  passing billerCodes (the webhook tells us exactly which changed). */
export async function listBillers(billerCodes?: string[]): Promise<BillPayBiller[]> {
  const query = billerCodes?.length ? `?billerCodes=${billerCodes.map(encodeURIComponent).join(",")}` : "";
  const data = await billpayRequest<BillPayBiller[] | { Billers?: BillPayBiller[] }>(`/api/payment/ListBillers${query}`);
  if (Array.isArray(data)) return data;
  return (data as { Billers?: BillPayBiller[] }).Billers ?? [];
}

/** GET /api/wallets — vendor float balances per currency. */
export async function listWallets(): Promise<BillPayWallet[]> {
  return billpayRequest<BillPayWallet[]>("/api/wallets");
}

interface PaymentProcessParams {
  action: BillPayAction;
  reference: string;
  billerCode?: string;
  memberNumber?: string;
  products?: BillPayPaymentProduct[];
  /** Blank/undefined when AUTH returned the amount. */
  totalAmount?: number;
  payerDetails?: BillPayPayerDetails;
}

/** POST /api/payment/process — the one endpoint behind AUTH/PAY/RETRY/STATUS. */
export async function paymentProcess(params: PaymentProcessParams): Promise<BillPayPaymentResponse> {
  const body: Record<string, unknown> = {
    Action: params.action,
    Reference: params.reference,
  };
  if (params.billerCode) body.BillerCode = params.billerCode;
  if (params.memberNumber !== undefined) body.MemberNumber = params.memberNumber;
  if (params.products?.length) body.Products = params.products;
  if (params.totalAmount !== undefined) body.TotalAmount = params.totalAmount;
  if (params.payerDetails) body.PayerDetails = params.payerDetails;
  return billpayRequest<BillPayPaymentResponse>("/api/payment/process", { method: "POST", body });
}

/** Status inquiry for a reference that timed out or came back
 *  BeingProcessed/Flagged. Interval rules live in the caller (120s first,
 *  then 180s) — this just performs the call. */
export async function paymentStatus(reference: string): Promise<BillPayPaymentResponse> {
  return paymentProcess({ action: "STATUS", reference });
}

/** POST /api/payment/reverse — only a limited set of billers support it. */
export async function reversePayment(originalReference: string, reversalReference: string): Promise<BillPayReverseResponse> {
  return billpayRequest<BillPayReverseResponse>("/api/payment/reverse", {
    method: "POST",
    body: { OriginalReference: originalReference, Reference: reversalReference },
  });
}

/** GET /api/payment/member — pre-flight member/account lookup (e.g. Liquid
 *  Home service logins, name confirmation before payment). */
export async function getMember(billerCode: string, memberNumber: string): Promise<BillPayMemberResponse> {
  return billpayRequest<BillPayMemberResponse>(
    `/api/payment/member?billerCode=${encodeURIComponent(billerCode)}&memberNumber=${encodeURIComponent(memberNumber)}`
  );
}

/** GET /api/payment/list — vendor payment history, last 90 days. */
export async function listPayments(filters: {
  from?: string;
  to?: string;
  billerCode?: string;
  status?: string;
  vendorReference?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<{ Page: number; TotalPages: number; TotalListings: number; Listings: Record<string, unknown>[] }> {
  const q = new URLSearchParams();
  if (filters.from) q.set("From", filters.from);
  if (filters.to) q.set("To", filters.to);
  if (filters.billerCode) q.set("BillerCode", filters.billerCode);
  if (filters.status) q.set("Status", filters.status);
  if (filters.vendorReference) q.set("VendorReference", filters.vendorReference);
  if (filters.page) q.set("Page", String(filters.page));
  if (filters.perPage) q.set("PerPage", String(filters.perPage));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return billpayRequest(`/api/payment/list${suffix}`);
}

// ─── Status helpers ──────────────────────────────────────────────────────

export const BILLPAY_FINAL_STATUSES: ReadonlySet<BillPayStatus> = new Set(["Paid", "Reversed", "Failed"]);
export const BILLPAY_IN_FLIGHT_STATUSES: ReadonlySet<BillPayStatus> = new Set(["BeingProcessed", "Flagged"]);

/** Cheap liveness probe for the dynamic selector: wallets is a light
 *  authenticated GET — a 200 means credentials work AND the API is up. */
export async function probeHealth(): Promise<{ ok: boolean; detail?: string; wallets?: BillPayWallet[] }> {
  if (!billpayConfigured()) return { ok: false, detail: "BILLPAY_USERNAME/BILLPAY_PASSWORD not set" };
  try {
    const wallets = await listWallets();
    const open = wallets.filter((w) => w.Status === "Open");
    if (!open.length) return { ok: false, detail: "No open vendor wallets", wallets };
    return { ok: true, wallets };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "BillPay unreachable" };
  }
}

// ─── Fulfillment provider ────────────────────────────────────────────────

/** Routing info the dynamic selector resolves from service_provider_map /
 *  billpay_products and hands in via FulfillmentInput.extra fields. */
export interface BillPayRouting {
  billerCode: string;
  productCode: string;
  /** Fixed product price, or null when the customer amount rules. */
  productPrice: number | null;
  requiresForex: boolean | null;
  department?: string | null;
  quantity?: number;
  metadata?: Record<string, unknown>[];
  payerDetails?: BillPayPayerDetails;
}

/**
 * Runs one full AUTH → PAY sequence for a BillPay product.
 * Extracted so both the provider class and the checkout "validate before
 * charging" path can run the AUTH half on its own.
 */
export async function authPayment(routing: BillPayRouting, memberNumber: string, reference: string, amount?: number): Promise<BillPayPaymentResponse> {
  const product: BillPayPaymentProduct = {
    Code: routing.productCode,
    Quantity: routing.quantity ?? 1,
    ...(routing.department ? { Department: routing.department } : {}),
    // Free-priced (Price null) → send the customer's amount; AUTH-priced
    // products (AuthAmountMandated non-null) → Price omitted so AUTH returns it.
    ...(routing.productPrice != null
      ? { Price: routing.productPrice }
      : amount != null
        ? { Price: amount }
        : {}),
    ...(routing.requiresForex != null ? { RequiresForexPayment: routing.requiresForex } : {}),
    ...(routing.metadata ? { Metadata: routing.metadata } : {}),
  };
  return paymentProcess({
    action: "AUTH",
    billerCode: routing.billerCode,
    memberNumber,
    reference,
    products: [product],
    totalAmount: routing.productPrice ?? amount,
  });
}

export async function payPayment(
  routing: BillPayRouting,
  memberNumber: string,
  reference: string,
  auth: BillPayPaymentResponse,
  amount?: number
): Promise<BillPayPaymentResponse> {
  // AUTH and PAY are identical — except that when AUTH returned the amount
  // (bill-style products), TotalAmount/Price are left blank so BillPay uses
  // the balance it already quoted.
  const authReturnedAmount = auth.Products?.some((p) => p.Price != null || p.AccountBalance != null) ?? false;
  const product: BillPayPaymentProduct = {
    Code: routing.productCode,
    Quantity: routing.quantity ?? 1,
    ...(routing.department ? { Department: routing.department } : {}),
    ...(!authReturnedAmount && routing.productPrice != null
      ? { Price: routing.productPrice }
      : !authReturnedAmount && amount != null
        ? { Price: amount }
        : {}),
    ...(routing.requiresForex != null ? { RequiresForexPayment: routing.requiresForex } : {}),
    ...(routing.metadata ? { Metadata: routing.metadata } : {}),
  };
  const resp = await paymentProcess({
    action: "PAY",
    billerCode: routing.billerCode,
    memberNumber,
    reference,
    products: [product],
    totalAmount: authReturnedAmount ? undefined : routing.productPrice ?? amount,
    payerDetails: routing.payerDetails,
  });
  // PAY that times out upstream surfaces as an HTTP-level throw inside
  // billpayRequest — BeingProcessed/Flagged statuses here are normal and
  // expected; the caller maps them to "pending" + status inquiries.
  return resp;
}

function statusToResult(res: BillPayPaymentResponse): FulfillmentResult {
  const ref = res.BillPayReference ?? res.BillerPaymentReference;
  const narration = res.Narration || res.TechnicalNarration;
  switch (res.Status) {
    case "Paid": {
      // Flatten everything the customer must see: vouchers, receipts,
      // display data — the receipt UI renders each piece individually
      // (BillPay UAT requirement, not optional).
      const vouchers = (res.Products ?? []).flatMap((p) => p.Vouchers ?? []);
      const commission = (res.Products ?? []).reduce((sum, p) => sum + (p.VendorCommission ?? 0), 0);
      return {
        status: "fulfilled",
        providerRef: ref,
        message: narration || "Payment completed.",
        extra: {
          billpay_status: res.Status,
          biller_payment_ref: res.BillerPaymentReference ?? null,
          member_name: res.MemberName ?? res.AuthData?.MemberName ?? null,
          vouchers: vouchers.length ? vouchers : undefined,
          receipt_html: res.PaymentData?.ReceiptHtml,
          receipt_smses: res.PaymentData?.ReceiptSmses,
          display_data: res.PaymentData?.DisplayData,
          account_details: res.AuthData?.AccountDetails,
          currency: res.Currency ?? null,
          vendor_service_fee: res.VendorServiceFee ?? null,
          vendor_commission: commission || undefined,
          wallet_balance_after_debit: res.WalletBalanceAfterDebit ?? null,
          invoice_ref: res.VendorInvoiceReference ?? null,
        },
      };
    }
    case "BeingProcessed":
    case "Flagged":
      return {
        status: "pending",
        providerRef: ref,
        message: narration || `BillPay is still processing (${res.Status}) — status inquiry will follow up.`,
        extra: { billpay_status: res.Status },
      };
    case "Reversed":
    case "Failed":
      return {
        status: "failed",
        providerRef: ref,
        message: narration || `BillPay ${res.Status.toLowerCase()} this payment.`,
        extra: {
          billpay_status: res.Status,
          technical_narration: res.TechnicalNarration ?? undefined,
          wallet_debit_reversed: res.WalletDebitReversed ?? null,
        },
      };
    default:
      // "Authorized" persisting post-PAY is unexpected — treat as pending so
      // a status inquiry resolves it rather than failing a paid customer.
      return {
        status: "pending",
        providerRef: ref,
        message: `BillPay returned ${res.Status} — status inquiry will confirm.`,
        extra: { billpay_status: res.Status },
      };
  }
}

export class BillPayProvider implements FulfillmentProvider {
  readonly name = "billpay";
  // Coverage is data-driven (service_provider_map) — deliberately empty
  // here so the legacy sync router never picks it. The dynamic selector in
  // src/lib/fulfillment/select.ts routes to this provider explicitly.
  readonly coverage = [] as const;

  async fulfil(input: FulfillmentInput): Promise<FulfillmentResult> {
    const routing = (input as FulfillmentInput & { billpay?: BillPayRouting }).billpay;
    if (!routing) {
      throw new Error("BillPay fulfil called without routing info — the selector must attach billerCode/productCode.");
    }
    const reference = input.transactionId;

    // AUTH first: validates the member + product + float before the vendor
    // wallet is debited. An AUTH failure is a clean pre-debit failure.
    const auth = await authPayment(routing, input.recipient, reference, input.amount);
    if (auth.Status !== "Authorized") {
      return statusToResult(auth); // Failed / biller offline / flagged
    }

    const pay = await payPayment(routing, input.recipient, reference, auth, input.amount);
    return statusToResult(pay);
  }
}
