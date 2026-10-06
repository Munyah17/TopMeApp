import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { getAllServices, getCurrentProfile } from "@/lib/data/queries";
import { createClient } from "@/lib/supabase/server";
import type { Transaction } from "@/types/database";

/**
 * Transaction receipt detail — one row of history expanded: reference,
 * status, recipient, and everything the provider handed back (BillPay
 * vouchers + receipt HTML entries each rendered individually per their
 * UAT rules, member/account details, provider refs).
 */
export const dynamic = "force-dynamic";

interface ReceiptExtras {
  provider?: string;
  providerRef?: string;
  biller?: string;
  product?: string;
  member_number?: string;
  member_name?: string;
  message?: string;
  refunded?: boolean;
  vouchers?: { SerialNumber?: string; Pin?: string; VoucherCode?: string; ExpiryDate?: string | null; ValidDays?: number | null }[];
  receipt_html?: string[];
  display_data?: Record<string, string>;
  account_details?: Record<string, string>;
  billpay_status?: string;
  biller_payment_ref?: string;
  wallet_balance_after_debit?: number | null;
  [k: string]: unknown;
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "7px 0", gap: 12 }}>
      <span className="muted" style={{ flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [{ data: tx }, services] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).single(),
    getAllServices(),
  ]);
  if (!tx) notFound();
  const t = tx as Transaction;
  const svc = services.find((s) => s.id === t.service_id);
  const receipt = (t.receipt ?? {}) as ReceiptExtras;

  const title = svc?.name
    ?? (receipt.biller ? `${receipt.biller}${receipt.product ? ` — ${receipt.product}` : ""}` : null)
    ?? t.service_id;

  const refunded = receipt.refunded === true;
  const statusLabel = refunded ? "Refunded"
    : t.fulfillment_status === "pending" ? "Processing"
    : t.status === "success" ? "Success" : "Failed";
  const tone = refunded ? "info" : t.status === "success" ? (t.fulfillment_status === "pending" ? "warning" : "success") : t.status === "pending" ? "warning" : "error";

  const vouchers = receipt.vouchers ?? [];
  const receiptHtml = receipt.receipt_html ?? [];
  const displayData = receipt.display_data ?? {};
  const accountDetails = receipt.account_details ?? {};

  return (
    <div className="px content-narrow" style={{ paddingTop: 6 }}>
      <Link href="/history" className="muted" style={{ textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="chevronL" size={14} /> History
      </Link>

      <div className="row between mt-2" style={{ alignItems: "center" }}>
        <h2 style={{ fontSize: 20 }}>{title}</h2>
        <span className={`status-badge ${tone}`}>{statusLabel}</span>
      </div>

      <div className="card card-pad mt-3">
        <Row label="Amount" value={`-${fmt(t.amount)}`} bold />
        {t.fee != null && t.fee > 0 && <Row label="Fee" value={fmt(t.fee)} />}
        <Row label="To" value={t.recipient_identifier} />
        {receipt.member_name && <Row label="Account name" value={String(receipt.member_name)} />}
        <Row label="Reference" value={t.reference} />
        <Row label="Date" value={new Date(t.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
        {receipt.provider && <Row label="Provider" value={receipt.provider === "billpay" ? "Paynow BillPay" : receipt.provider} />}
        {receipt.providerRef && <Row label="Provider ref" value={String(receipt.providerRef)} />}
        {receipt.biller_payment_ref && <Row label="Biller ref" value={String(receipt.biller_payment_ref)} />}
        {receipt.message && <Row label="Note" value={String(receipt.message)} />}
      </div>

      {vouchers.map((v, i) => (
        <div key={i} className="card card-pad mt-3" style={{ textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 12 }}>Voucher{vouchers.length > 1 ? ` ${i + 1}` : ""}</div>
          {v.VoucherCode && <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: 1, marginTop: 6 }}>{v.VoucherCode}</div>}
          {v.Pin && <div style={{ fontWeight: 700, fontSize: 17, marginTop: 4 }}>PIN: {v.Pin}</div>}
          {v.SerialNumber && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Serial {v.SerialNumber}</div>}
          {v.ExpiryDate && <div className="muted" style={{ fontSize: 12 }}>Expires {new Date(v.ExpiryDate).toLocaleDateString("en-GB")}</div>}
          {v.ValidDays != null && <div className="muted" style={{ fontSize: 12 }}>Valid {v.ValidDays} days</div>}
        </div>
      ))}

      {receiptHtml.map((html, i) => (
        <div key={i} className="card mt-3" style={{ overflow: "hidden" }}>
          <div className="card-pad" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ))}

      {Object.keys(displayData).length > 0 && (
        <div className="card card-pad mt-3">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Details</div>
          {Object.entries(displayData).map(([k, v]) => <Row key={k} label={k} value={v} />)}
        </div>
      )}

      {Object.keys(accountDetails).length > 0 && (
        <div className="card card-pad mt-3">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Account details</div>
          {Object.entries(accountDetails).map(([k, v]) => <Row key={k} label={k} value={v} />)}
        </div>
      )}
    </div>
  );
}
