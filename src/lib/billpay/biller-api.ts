import { createHmac, createHash, timingSafeEqual } from "crypto";

/**
 * Paynow BillPay — Biller API client (service-provider side).
 * Base URL: https://billpay.paynow.co.zw. Auth: HTTP Basic, same scheme as
 * the Vendor API but a DIFFERENT credential pair — a user with the "Biller
 * Admin" or "Biller User" role, issued by Paynow support.
 *
 * What this half of BillPay does for us (TopMe receiving payments through
 * BillPay as a biller):
 *   - member CRUD (create/update/delete/undelete, list, single)
 *   - bulk member upload / delete via CSV
 *   - download member payments as CSV
 *   - signed payment-notification webhooks (see /api/billpay/payments)
 *
 * Separate env vars from the vendor API — BILLPAY_BILLER_USERNAME /
 * BILLPAY_BILLER_PASSWORD — because the roles and accounts are distinct.
 */

function config() {
  const baseUrl = (process.env.BILLPAY_BASE_URL || "https://billpay.paynow.co.zw").replace(/\/$/, "");
  const username = process.env.BILLPAY_BILLER_USERNAME;
  const password = process.env.BILLPAY_BILLER_PASSWORD;
  if (!username || !password) {
    throw new Error("BillPay Biller API is not configured — set BILLPAY_BILLER_USERNAME and BILLPAY_BILLER_PASSWORD.");
  }
  return { baseUrl, authHeader: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` };
}

export function billerApiConfigured(): boolean {
  return Boolean(process.env.BILLPAY_BILLER_USERNAME && process.env.BILLPAY_BILLER_PASSWORD);
}

export class BillPayBillerApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "BillPayBillerApiError";
  }
}

async function billerRequest<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: BodyInit | Record<string, unknown>; rawText?: boolean } = {}
): Promise<T> {
  const { baseUrl, authHeader } = config();
  const isObjectBody = init.body != null && typeof init.body === "object" && !(init.body instanceof FormData);
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: authHeader,
      // FormData sets its own multipart boundary — don't touch Content-Type.
      ...(isObjectBody ? { "Content-Type": "application/json" } : {}),
    },
    body: isObjectBody ? JSON.stringify(init.body) : (init.body as BodyInit | undefined),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BillPayBillerApiError(`BillPay Biller API ${path} failed (${res.status}): ${text.slice(0, 300)}`, res.status, text);
  }
  if (init.rawText) return text as T;
  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    // Several biller endpoints answer 200 with a bare "OK"-style body.
    return text as T;
  }
}

// ─── Members ─────────────────────────────────────────────────────────────

export interface BillerMember {
  MemberNumber: string;
  FullName: string;
  EmailAddress?: string;
  MobileNo?: string;
  PostalAddress?: string;
  /** JSON-encoded key/value pairs, e.g. {"National Id": "63-…", "Policy": "…"}. */
  AccountDetails?: string;
}

/** POST /api/member/create — register a member BillPay can take payments for. */
export async function createMember(member: BillerMember): Promise<void> {
  await billerRequest("/api/member/create", { method: "POST", body: member as unknown as Record<string, unknown> });
}

/** POST /api/member/update — WARNING: every optional field not sent is
 *  overwritten with an empty value, so always send the full record. */
export async function updateMember(member: BillerMember): Promise<void> {
  await billerRequest("/api/member/update", { method: "POST", body: member as unknown as Record<string, unknown> });
}

/** POST /api/member/delete — member numbers are tombstoned, not reusable. */
export async function deleteMember(memberNumber: string): Promise<void> {
  await billerRequest("/api/member/delete", { method: "POST", body: { MemberNumber: memberNumber } });
}

export async function undeleteMember(memberNumber: string): Promise<void> {
  await billerRequest("/api/member/undelete", { method: "POST", body: { MemberNumber: memberNumber } });
}

export async function listMembers(page = 1, perPage = 200, filters?: string): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ Page: String(page), PerPage: String(perPage) });
  if (filters) q.set("Filters", filters);
  return billerRequest(`/api/member/list?${q.toString()}`);
}

export async function getMember(memberNumber: string): Promise<Record<string, unknown>> {
  return billerRequest(`/api/member/single/${encodeURIComponent(memberNumber)}`);
}

// ─── Bulk CSV upload ─────────────────────────────────────────────────────

export interface BulkUploadResult {
  ResponseCode: number; // 0 = unspecified, 1 = success
  Narrative?: string;
  Warnings?: string[];
  Errors?: string[];
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Build the upload CSV: mandatory columns in order, then any extras. */
export function buildMembersCsv(
  members: { memberNumber: string; fullName: string; email?: string; mobile?: string; postalAddress?: string; extra?: Record<string, string> }[]
): string {
  const extraCols = [...new Set(members.flatMap((m) => Object.keys(m.extra ?? {})))];
  const header = ["Member Number", "Full Name", "Email", "Mobile", "Postal Address", ...extraCols];
  const rows = members.map((m) =>
    [m.memberNumber, m.fullName, m.email ?? "", m.mobile ?? "", m.postalAddress ?? "", ...extraCols.map((c) => m.extra?.[c] ?? "")]
      .map(csvEscape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\r\n");
}

/** POST /api/member/uploadmembers — existing member numbers are UPDATED. */
export async function uploadMembers(csv: string): Promise<BulkUploadResult> {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "members.csv");
  return billerRequest("/api/member/uploadmembers", { method: "POST", body: form });
}

/** POST /api/member/uploadmembersdelete — single-column Member Number CSV. */
export async function uploadMembersDelete(memberNumbers: string[]): Promise<BulkUploadResult> {
  const csv = ["Member Number", ...memberNumbers.map(csvEscape)].join("\r\n");
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "members-delete.csv");
  return billerRequest("/api/member/uploadmembersdelete", { method: "POST", body: form });
}

// ─── Payments report ─────────────────────────────────────────────────────

/** GET /api/member/downloadpayments — returns raw CSV text.
 *  Dates are dd-MMM-yyyy HH:mm:ss (e.g. "04-Oct-2026 13:45:00"). */
export async function downloadPayments(from: string, to: string, memberNumber?: string): Promise<string> {
  const q = new URLSearchParams({ From: from, To: to });
  if (memberNumber) q.set("MemberNumber", memberNumber);
  return billerRequest(`/api/member/downloadpayments?${q.toString()}`, { rawText: true });
}

// ─── Webhook signature verification ──────────────────────────────────────

export interface BillPayWebhookPayment {
  PaymentId: number;
  BillPayReference: string;
  BankReference?: string;
  PaidDate: string;
  MemberNumber: string;
  MemberName?: string;
  ProductCode: string;
  ProductPrice: number;
  ProductDepartment?: string;
}

export interface BillPayWebhookPayload {
  Payments?: BillPayWebhookPayment[];
  Hash?: string;
}

/** Preferred check: X-Signature is Base64 HMAC-SHA256 of the RAW request
 *  body under our secret key. Constant-time compare. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Legacy fallback: SHA256 hex of every payment's fields concatenated in
 *  order + the secret key. Field order is load-bearing per the docs:
 *  PaymentId, BillPayReference, BankReference, PaidDate, MemberNumber,
 *  MemberName, ProductCode, ProductPrice (2dp), ProductDepartment. */
export function verifyLegacyHash(payload: BillPayWebhookPayload, secret: string): boolean {
  if (!payload.Hash || !secret) return false;
  const plain = (payload.Payments ?? [])
    .map(
      (p) =>
        `${p.PaymentId}${p.BillPayReference}${p.BankReference ?? ""}${p.PaidDate}${p.MemberNumber}${p.MemberName ?? ""}${p.ProductCode}${(p.ProductPrice ?? 0).toFixed(2)}${p.ProductDepartment ?? ""}`
    )
    .join("");
  const expected = createHash("sha256").update(plain + secret, "utf8").digest("hex").toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(payload.Hash.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
