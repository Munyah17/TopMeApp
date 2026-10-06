"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { calculatePlatformFee, calculateGatewaySurcharge } from "@/lib/fees";
import { authBillPayProduct, payBillPayProduct, startBillPayCheckout, checkBillPayPaymentNow, getBillPayCheckoutStatus, type BillPayAuthPreview } from "@/lib/actions/billpay";
import { PaymentMethodSection, type PaymentMethod } from "./flow-shared";

/**
 * Generic BillPay purchase flow — the topup.co.zw shape driven entirely by
 * the synced catalog: the biller supplies the member-number label/regex,
 * the product supplies price/min/max/quantity/metadata requirements, and
 * AUTH runs before the wallet is touched so the customer confirms the real
 * account name (and amount owing, for bill-style products) first.
 *
 * Wallet-only for now: BillPay's AUTH must precede the debit, and the
 * gateway rails (Paynow/Stripe/EcoCash) need an intents table to hold the
 * AUTH'd reference between checkout and webhook — a follow-up, same
 * pattern as insurance_checkout_intents.
 */

type Step = "details" | "review" | "processing" | "ecocash" | "success" | "pending" | "error";

export interface BillPayFlowBiller {
  code: string;
  name: string;
  member_number_label: string | null;
  member_number_desc: string | null;
  member_number_regex: string | null;
}

export interface BillPayFlowProduct {
  code: string;
  name: string;
  description: string | null;
  price: number | null;
  requires_forex: boolean | null;
  returns_vouchers: boolean;
  pre_purchase_instructions: string | null;
  post_purchase_instructions: string | null;
  amount_field_label: string | null;
  amount_field_desc: string | null;
  min_amount: number | null;
  max_amount: number | null;
  auth_amount_mandated: boolean | null;
  allow_quantity: boolean;
  quantity_field_label: string | null;
  metadata_fields: { Name?: string; Required?: boolean; Description?: string }[];
}

interface ReceiptData {
  vouchers: { SerialNumber?: string; Pin?: string; VoucherCode?: string; Batch?: string; ExpiryDate?: string | null; ValidDays?: number | null }[];
  receiptHtml: string[];
  displayData: Record<string, string>;
  accountDetails: Record<string, string>;
  message: string | null;
  currency: string;
  postPurchaseInstructions: string | null;
}

export function BillPayFlow({
  biller,
  product,
  walletBalance,
}: {
  biller: BillPayFlowBiller;
  product: BillPayFlowProduct;
  walletBalance: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [memberNumber, setMemberNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<BillPayAuthPreview | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [reference, setReference] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Free-priced = no fixed price AND AUTH doesn't return one (airtime-style)
  const freePriced = product.price == null && product.auth_amount_mandated == null;
  const metaFields = product.metadata_fields ?? [];
  const missingRequiredMeta = metaFields.some((f) => f.Required && !(metadata[f.Name ?? ""] ?? "").trim());
  const canAuth =
    memberNumber.trim().length > 0 &&
    !missingRequiredMeta &&
    (!freePriced || parseFloat(amount) > 0) &&
    (!product.allow_quantity || parseInt(quantity, 10) >= 1);

  const fee = preview?.price != null ? calculatePlatformFee(`billpay-${biller.code.toLowerCase()}`, preview.price) : 0;
  // Gateway rails charge their own processing fee on top of the platform
  // fee — the customer sees the real total before picking a method.
  const surcharge = method && method !== "wallet" ? calculateGatewaySurcharge(method, (preview?.price ?? 0) + fee) : 0;
  const total = (preview?.price ?? 0) + fee + surcharge;
  const insufficient = method === "wallet" && preview?.price != null && walletBalance < total;
  const gatewayReady = !method || method === "wallet" || contactEmail.includes("@");

  async function runAuth() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await authBillPayProduct({
        billerCode: biller.code,
        productCode: product.code,
        memberNumber,
        amount: freePriced ? parseFloat(amount) : undefined,
        quantity: product.allow_quantity ? parseInt(quantity, 10) : undefined,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? "Couldn't verify that account.");
        return;
      }
      setPreview(res);
      setStep("review");
    } finally {
      setBusy(false);
    }
  }

  async function runPay() {
    if (!preview?.reference || !method) return;
    setBusy(true);
    setErrorMsg(null);
    setStep("processing");
    try {
      // Gateway path — intent holds the AUTH'd BillPay reference + locked
      // price; redirect to Paynow/Stripe or start the EcoCash push poll.
      if (method !== "wallet") {
        const res = await startBillPayCheckout({
          gateway: method,
          billerCode: biller.code,
          productCode: product.code,
          memberNumber,
          authReference: preview.reference,
          amount: freePriced ? parseFloat(amount) : undefined,
          quantity: product.allow_quantity ? parseInt(quantity, 10) : undefined,
          metadata: Object.keys(metadata).length ? metadata : undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
        });
        if (res.error) {
          setErrorMsg(res.error);
          setStep("error");
          return;
        }
        if (res.redirectUrl) {
          window.location.assign(res.redirectUrl);
          return;
        }
        // EcoCash — poll until the push is approved/declined.
        if (res.gateway === "ecocash" && res.reference) {
          const intentRef = res.reference;
          setStep("ecocash");
          pollRef.current = setInterval(async () => {
            try {
              await checkBillPayPaymentNow(intentRef);
              const s = await getBillPayCheckoutStatus(intentRef);
              if (s.status === "completed") {
                if (pollRef.current) clearInterval(pollRef.current);
                setStep("pending"); // delivery leg runs post-payment
              } else if (s.status === "failed") {
                if (pollRef.current) clearInterval(pollRef.current);
                setErrorMsg("EcoCash payment was not approved.");
                setStep("error");
              }
            } catch {
              // keep polling — transient errors shouldn't kill the wait screen
            }
          }, 3000);
          return;
        }
        setStep("pending");
        return;
      }

      const res = await payBillPayProduct({
        billerCode: biller.code,
        productCode: product.code,
        memberNumber,
        reference: preview.reference,
        amount: freePriced ? parseFloat(amount) : undefined,
        quantity: product.allow_quantity ? parseInt(quantity, 10) : undefined,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      });
      if (res.error) {
        setErrorMsg(res.error);
        setStep("error");
        return;
      }
      setReference(res.reference ?? "");
      setTransactionId(res.transactionId ?? "");
      if (res.status === "pending") {
        setStep("pending");
      } else {
        setReceipt(res.receipt as ReceiptData);
        setStep("success");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Payment failed.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  const showTop = step === "details" || step === "review" || step === "error";

  return (
    <div>
      {showTop && (
        <div className="topbar">
          <button className="backbtn tap" onClick={() => (step === "review" || step === "error" ? setStep("details") : router.back())}>
            <Icon name="chevronL" size={18} stroke={2.2} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{product.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{biller.name}</div>
          </div>
          <div className="stepdots">
            {[0, 1].map((i) => (
              <span key={i} className={(step === "review" ? 1 : 0) >= i ? "on" : ""} />
            ))}
          </div>
        </div>
      )}

      <div className="px content-narrow" style={{ paddingTop: showTop ? 4 : 0 }}>
        {step === "details" && (
          <>
            <h2 style={{ fontSize: 20, marginTop: 14 }}>Pay {product.name}</h2>
            <div className="muted mb-3">Enter the details below — we&apos;ll confirm the account before you pay.</div>

            {product.pre_purchase_instructions && (
              <div className="card card-pad mb-3" style={{ background: "var(--accent-soft)", fontSize: 13, lineHeight: 1.5 }}>
                {product.pre_purchase_instructions}
              </div>
            )}

            <label className="field-label">{biller.member_number_label || "Account / member number"}</label>
            <input
              className="field"
              placeholder={biller.member_number_desc ?? ""}
              value={memberNumber}
              onChange={(e) => setMemberNumber(e.target.value)}
            />

            {product.allow_quantity && (
              <>
                <label className="field-label mt-2">{product.quantity_field_label || "Quantity"}</label>
                <input
                  className="field"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </>
            )}

            {freePriced && (
              <>
                <label className="field-label mt-2">{product.amount_field_label || "Amount"}</label>
                <input
                  className="field"
                  placeholder={product.amount_field_desc ?? "$0.00"}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                {(product.min_amount != null || product.max_amount != null) && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {product.min_amount != null ? `Min $${product.min_amount}` : ""}
                    {product.min_amount != null && product.max_amount != null ? " · " : ""}
                    {product.max_amount != null ? `Max $${product.max_amount}` : ""}
                  </div>
                )}
              </>
            )}

            {metaFields.map((f) => (
              <div key={f.Name}>
                <label className="field-label mt-2">
                  {f.Name}
                  {f.Required ? "" : " (optional)"}
                </label>
                <input
                  className="field"
                  placeholder={f.Description ?? ""}
                  value={metadata[f.Name ?? ""] ?? ""}
                  onChange={(e) => setMetadata((m) => ({ ...m, [f.Name ?? ""]: e.target.value }))}
                />
              </div>
            ))}

            {errorMsg && <div className="muted mt-2" style={{ color: "var(--error)" }}>{errorMsg}</div>}

            <button className="btn btn-primary btn-block mt-4" disabled={!canAuth || busy} onClick={runAuth}>
              {busy ? "Checking with the biller…" : "Continue"}
            </button>
          </>
        )}

        {step === "review" && preview && (
          <>
            <h2 style={{ fontSize: 20, marginTop: 14 }}>Confirm payment</h2>
            <div className="card card-pad mt-3">
              {preview.memberName && (
                <div className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                  <span className="muted">Account</span>
                  <span style={{ fontWeight: 700 }}>{preview.memberName}</span>
                </div>
              )}
              <div className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                <span className="muted">{biller.member_number_label || "Number"}</span>
                <span>{memberNumber}</span>
              </div>
              {Object.entries(preview.accountDetails ?? {}).map(([k, v]) => (
                <div key={k} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                  <span className="muted">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              {Object.entries(preview.accountBalances ?? {}).map(([k, v]) => (
                <div key={k} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                  <span className="muted">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              <div className="row" style={{ justifyContent: "space-between", padding: "10px 0 6px", borderTop: "1px dashed var(--border)", marginTop: 6 }}>
                <span className="muted">{product.name}</span>
                <span style={{ fontWeight: 700 }}>{preview.price != null ? `$${preview.price.toFixed(2)}` : "—"}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                <span className="muted">Processing fee</span>
                <span>${(fee + surcharge).toFixed(2)}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between", padding: "6px 0", fontWeight: 800, fontSize: 16 }}>
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <PaymentMethodSection
              showWallet
              walletBalance={walletBalance}
              method={method}
              setMethod={setMethod}
              guestEmail={contactEmail}
              setGuestEmail={setContactEmail}
              guestPhone={contactPhone}
              setGuestPhone={setContactPhone}
            />

            {insufficient && (
              <div className="muted mt-1" style={{ color: "var(--error)", fontSize: 13 }}>
                Not enough wallet balance — <Link href="/wallet">top up</Link> or pay by Paynow/Stripe.
              </div>
            )}
            {errorMsg && <div className="muted mt-2" style={{ color: "var(--error)" }}>{errorMsg}</div>}

            <button className="btn btn-primary btn-block mt-4" disabled={busy || insufficient || !method || !gatewayReady || preview.price == null} onClick={runPay}>
              {busy ? "Paying…" : `Pay $${total.toFixed(2)}`}
            </button>
          </>
        )}

        {step === "processing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520 }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Paying {biller.name}…</div>
            <div className="muted mt-1">Hang tight, this takes a few seconds</div>
          </div>
        )}

        {step === "ecocash" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520, textAlign: "center" }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Approve on your phone</div>
            <div className="muted mt-1" style={{ maxWidth: 280 }}>
              We sent a USSD prompt{contactPhone ? ` to ${contactPhone}` : " to your phone"}. Enter your EcoCash PIN to approve the ${total.toFixed(2)} payment.
            </div>
          </div>
        )}

        {step === "pending" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520, textAlign: "center" }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Still processing</div>
            <div className="muted mt-1" style={{ maxWidth: 300 }}>
              Payment received — {biller.name} is confirming delivery. We&apos;ll update your history when it completes. Failed deliveries are refunded automatically.
            </div>
            <Link href={transactionId ? `/history/${transactionId}` : "/history"} className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
              View history
            </Link>
          </div>
        )}

        {step === "error" && (
          <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, textAlign: "center" }}>
            <div style={{ width: 84, height: 84, borderRadius: 26, background: "var(--error-bg)", color: "var(--error)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="alert" size={38} stroke={1.6} />
            </div>
            <h2 style={{ fontSize: 18, marginTop: 18 }}>We couldn&apos;t process that</h2>
            <div className="muted mt-1" style={{ maxWidth: 280 }}>{errorMsg}</div>
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("details")}>
              Try again
            </button>
          </div>
        )}

        {step === "success" && receipt && (
          <div style={{ paddingTop: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div className="success-pop" style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--green-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)" }}>
                <Icon name="check" size={42} stroke={3} />
              </div>
              <h2 style={{ fontSize: 21, marginTop: 20 }}>Payment successful</h2>
              <div className="muted mt-1">{reference}</div>
            </div>

            {/* Vouchers — each shown individually (BillPay UAT). */}
            {receipt.vouchers.map((v, i) => (
              <div key={i} className="card card-pad mt-3" style={{ textAlign: "center" }}>
                <div className="muted" style={{ fontSize: 12 }}>Voucher {receipt.vouchers.length > 1 ? i + 1 : ""}</div>
                {v.VoucherCode && <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: 1, marginTop: 6 }}>{v.VoucherCode}</div>}
                {v.Pin && <div style={{ fontWeight: 700, fontSize: 17, marginTop: 4 }}>PIN: {v.Pin}</div>}
                {v.SerialNumber && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Serial {v.SerialNumber}</div>}
                {v.ExpiryDate && <div className="muted" style={{ fontSize: 12 }}>Expires {new Date(v.ExpiryDate).toLocaleDateString("en-GB")}</div>}
                {v.ValidDays != null && <div className="muted" style={{ fontSize: 12 }}>Valid {v.ValidDays} days</div>}
              </div>
            ))}

            {/* Receipt HTML — each entry rendered on its own card (UAT:
                individually shareable, never merged into one). */}
            {receipt.receiptHtml.map((html, i) => (
              <div key={i} className="card mt-3" style={{ overflow: "hidden" }}>
                <div className="card-pad" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            ))}

            {Object.keys(receipt.displayData).length > 0 && (
              <div className="card card-pad mt-3">
                {Object.entries(receipt.displayData).map(([k, v]) => (
                  <div key={k} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                    <span className="muted">{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {receipt.postPurchaseInstructions && (
              <div className="card card-pad mt-3" style={{ background: "var(--accent-soft)", fontSize: 13, lineHeight: 1.5 }}>
                {receipt.postPurchaseInstructions}
              </div>
            )}

            <Link href={transactionId ? `/history/${transactionId}` : "/history"} className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
              View receipt in history
            </Link>
            <Link href="/home" className="btn btn-ghost btn-block" style={{ textDecoration: "none" }}>
              Done
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
