"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Icon } from "@/components/icons";
import { hexA } from "@/lib/data/catalog-helpers";
import { calculatePlatformFee } from "@/lib/fees";
import { payService } from "@/lib/actions/payments";
import { startGuestCheckout, type GuestGateway } from "@/lib/actions/guest-payments";
import { addGuestActivity } from "@/lib/guest-activity";
import { DenomTile, NetworkTile, PaymentMethodSection, ReviewRow, EditableRow, type PaymentBanners, type PaymentMethod } from "./flow-shared";
import type { AirtimeOperatorRule } from "@/lib/fulfillment/vitalpay";
import type { Network, Service, Transaction } from "@/types/database";

type Step = "operator" | "recipient" | "amount" | "review" | "processing" | "guest-ecocash" | "success" | "receipt" | "error";

const isVoucher = (service: Service) => service.id === "airtimevouchers";

const PAY_VIA_LABEL: Record<PaymentMethod, string> = {
  wallet: "TopMe Wallet",
  paynow: "Paynow",
  ecocash: "Ecocash Instant",
  stripe: "Stripe",
};

export function AirtimeFlow({
  service,
  networks,
  operatorRules = {},
  walletBalance,
  isGuest = false,
  guestEmail: initialGuestEmail = "",
  guestPhone: initialGuestPhone = "",
  banners,
}: {
  service: Service;
  networks: Network[];
  operatorRules?: Record<string, AirtimeOperatorRule>;
  walletBalance: number;
  isGuest?: boolean;
  guestEmail?: string;
  guestPhone?: string;
  banners?: PaymentBanners;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("operator");
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [denom, setDenom] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Transaction | null>(null);
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [guestPhone, setGuestPhone] = useState(initialGuestPhone);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unitPrice = denom ?? (parseFloat(customAmount) || 0);
  const amount = isVoucher(service) ? unitPrice * quantity : unitPrice;

  // Network operator amount rules (from VitalPay's live catalogue). NetOne
  // only sells fixed denominations; Econet takes any amount in a range.
  const rule = networkId ? operatorRules[networkId] : undefined;
  const fixedTiles = !isVoucher(service) ? rule?.fixedAmounts ?? null : null;
  const denomChoices = fixedTiles ?? service.chips ?? [];
  const amountError =
    !isVoucher(service) && rule && unitPrice > 0
      ? fixedTiles
        ? fixedTiles.some((a) => Math.round(a * 100) === Math.round(unitPrice * 100))
          ? null
          : `Pick one of the set amounts above.`
        : unitPrice < rule.min
          ? `Minimum is $${rule.min.toFixed(2)} for ${networks.find((n) => n.id === networkId)?.name ?? "this network"}.`
          : unitPrice > rule.max
            ? `Maximum is $${rule.max.toFixed(2)} for ${networks.find((n) => n.id === networkId)?.name ?? "this network"}.`
            : null
      : null;

  useEffect(() => {
    if (step === "receipt" && result && qrRef.current) {
      QRCode.toCanvas(qrRef.current, `TOPME:${result.reference}`, { width: 132, margin: 1 }, () => {});
    }
  }, [step, result]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function submitGateway() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await startGuestCheckout({
        serviceId: service.id,
        serviceName: service.name,
        amount,
        recipient: phone,
        networkId,
        guestEmail,
        guestPhone: guestPhone || undefined,
        gateway: method as GuestGateway,
      });
      if (res.gateway === "ecocash") {
        setStep("guest-ecocash");
        pollRef.current = setInterval(async () => {
          const r = await fetch("/api/guest/ecocash/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: res.reference }),
          });
          const data = await r.json();
          if (data.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setResult(data.transaction);
            addGuestActivity({
              reference: data.transaction.reference,
              serviceName: service.name,
              amount: data.transaction.amount,
              recipient: data.transaction.recipient_identifier,
              createdAt: data.transaction.created_at,
            });
            setStep("success");
          } else if (data.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setErrorMsg("EcoCash payment was not approved.");
            setStep("error");
          }
        }, 3000);
        return;
      }
      window.location.assign(res.redirectUrl);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Payment failed.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!method) return;
    if (method !== "wallet") return submitGateway();
    setBusy(true);
    setErrorMsg(null);
    try {
      const tx = await payService({
        serviceId: service.id,
        serviceName: service.name,
        amount,
        recipient: phone,
        networkId,
        beneficiaryLabel: phone,
      });
      setResult(tx);
      setStep("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Payment failed.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  const network = networks.find((n) => n.id === networkId);
  const stepIndex = ["operator", "recipient", "amount", "review"].indexOf(step);
  const showTop = !["processing", "guest-ecocash", "success"].includes(step);
  const fee = calculatePlatformFee(service.id, amount);
  const total = amount + fee;
  const insufficient = method === "wallet" && total > walletBalance;
  const noMethodChosen = method === null;
  const guestMissingInfo = method !== null && method !== "wallet" && (!guestEmail.trim() || (method === "ecocash" && !guestPhone.trim()));

  return (
    <div>
      {showTop && (
        <div className="topbar">
          <button
            className="backbtn tap"
            onClick={() => {
              if (step === "recipient") setStep("operator");
              else if (step === "amount") setStep("recipient");
              else if (step === "review") setStep("amount");
              else if (step === "error") setStep("operator");
              else router.back();
            }}
          >
            <Icon name="chevronL" size={18} stroke={2.2} />
          </button>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>{service.name}</div>
          {stepIndex >= 0 && (
            <div className="stepdots">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={stepIndex >= i ? "on" : ""} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px content-narrow" style={{ paddingTop: showTop ? 4 : 0 }}>
        {step === "operator" && (
          <>
            <div className="ibadge mt-2" style={{ background: hexA(service.color, 0.12), color: service.color, width: 56, height: 56, borderRadius: 18 }}>
              <Icon name={service.icon} size={26} stroke={1.7} />
            </div>
            <h2 style={{ fontSize: 20, marginTop: 14 }}>Choose network</h2>
            <div className="muted mb-3">Which network is this for?</div>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {networks.map((n) => (
                <NetworkTile key={n.id} network={n} selected={networkId === n.id} onClick={() => setNetworkId(n.id)} />
              ))}
            </div>
            <button className="btn btn-primary btn-block mt-4" disabled={!networkId} onClick={() => setStep("recipient")}>
              Continue
            </button>
          </>
        )}

        {step === "recipient" && (
          <>
            <h2 style={{ fontSize: 20, marginTop: 6 }}>Who&apos;s this for?</h2>
            <div className="muted mb-3">Enter the phone number to top up</div>
            <label className="field-label">Phone Number</label>
            <input className="field" placeholder="077 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="btn btn-primary btn-block mt-4" disabled={phone.trim().length < 3} onClick={() => setStep("amount")}>
              Continue
            </button>
          </>
        )}

        {step === "error" && (
          <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, textAlign: "center" }}>
            <div style={{ width: 84, height: 84, borderRadius: 26, background: "var(--error-bg)", color: "var(--error)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="alert" size={38} stroke={1.6} />
            </div>
            <h2 style={{ fontSize: 18, marginTop: 18 }}>We couldn&apos;t process that</h2>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>{errorMsg || "Something went wrong. Please try again."}</div>
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("operator")}>
              Try again
            </button>
          </div>
        )}

        {step === "amount" && (
          <>
            <div className="card card-pad row gap-2" style={{ marginBottom: 18 }}>
              <div className="ibadge round" style={{ background: hexA(service.color, 0.12), color: service.color }}>
                <Icon name={service.icon} size={20} stroke={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{phone}</div>
                <div className="muted">{network?.name ?? "Network"} · {isVoucher(service) ? "Airtime voucher" : "Direct recharge"}</div>
              </div>
            </div>

            <label className="field-label">{isVoucher(service) ? "Voucher denomination" : "Amount"}</label>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {denomChoices.map((c) => (
                <DenomTile key={c} amount={c} selected={denom === c} onClick={() => { setDenom(c); setCustomAmount(""); }} />
              ))}
            </div>

            {!isVoucher(service) && (
              <>
                <label className="field-label mt-2">
                  {fixedTiles ? "Custom amount" : "Or enter custom amount"}
                </label>
                <input
                  className="field"
                  placeholder={fixedTiles ? "Currently Not Available" : rule ? `$${rule.min.toFixed(2)} – $${rule.max.toFixed(2)}` : "$0.00"}
                  inputMode="decimal"
                  disabled={!!fixedTiles}
                  style={fixedTiles ? { opacity: 0.5, cursor: "not-allowed", background: "var(--muted)" } : undefined}
                  value={fixedTiles ? "" : customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value.replace(/[^0-9.]/g, "")); setDenom(null); }}
                />
                {fixedTiles && (
                  <div className="muted mt-1" style={{ fontSize: 12 }}>
                    {networks.find((n) => n.id === networkId)?.name ?? "This network"} only sells the set amounts above.
                  </div>
                )}
                {amountError && (
                  <div className="mt-1" style={{ color: "var(--error)", fontSize: 12 }}>{amountError}</div>
                )}
              </>
            )}

            {isVoucher(service) && denom && (
              <div className="row between mt-3" style={{ alignItems: "center" }}>
                <span className="field-label" style={{ marginBottom: 0 }}>Quantity</span>
                <div className="row gap-2" style={{ alignItems: "center" }}>
                  <button className="backbtn tap" style={{ width: 38, height: 38 }} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                    <Icon name="minus" size={16} stroke={2.4} />
                  </button>
                  <span style={{ fontWeight: 800, fontSize: 16, width: 24, textAlign: "center" }}>{quantity}</span>
                  <button className="backbtn tap" style={{ width: 38, height: 38 }} onClick={() => setQuantity((q) => Math.min(10, q + 1))}>
                    <Icon name="plus" size={16} stroke={2.4} />
                  </button>
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-block mt-4" disabled={!(amount > 0) || !!amountError} onClick={() => setStep("review")}>
              Continue{amount > 0 ? ` · $${amount.toFixed(2)}` : ""}
            </button>
          </>
        )}

        {step === "review" && (
          <>
            <h2 style={{ fontSize: 19, marginTop: 6 }}>Review purchase</h2>
            <div className="muted mb-3">Tap the pencil to fix anything</div>
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="card-pad" style={{ textAlign: "center", borderBottom: "1px dashed var(--border)", background: `linear-gradient(135deg, ${network?.color ?? service.color}, ${service.color})` }}>
                <div className="muted" style={{ color: "rgba(255,255,255,0.75)" }}>You&apos;re sending</div>
                <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4, color: "#fff" }}>${total.toFixed(2)}</div>
                {isVoucher(service) && quantity > 1 && (
                  <div className="muted" style={{ color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{quantity} × ${unitPrice.toFixed(2)} vouchers</div>
                )}
              </div>
              <div style={{ padding: "6px 18px" }}>
                <ReviewRow label="Network" value={network?.name ?? "—"} />
                <EditableRow label="Phone Number" value={phone} onSave={setPhone} placeholder="077 123 4567" />
                <ReviewRow label="Amount" value={`$${amount.toFixed(2)}`} />
                <ReviewRow label="Processing fee" value={`$${fee.toFixed(2)}`} />
                {method === "wallet" && <ReviewRow label="Wallet balance" value={`$${walletBalance.toFixed(2)}`} />}
              </div>
            </div>

            <PaymentMethodSection
              showWallet={!isGuest}
              walletBalance={walletBalance}
              banners={banners}
              method={method}
              setMethod={setMethod}
              guestEmail={guestEmail}
              setGuestEmail={setGuestEmail}
              guestPhone={guestPhone}
              setGuestPhone={setGuestPhone}
            />

            {noMethodChosen && (
              <div className="muted mt-2" style={{ color: "var(--warning)" }}>
                Choose a payment method above to continue.
              </div>
            )}
            {insufficient && (
              <div className="muted mt-2" style={{ color: "var(--error)" }}>
                Your wallet balance is too low for this.{" "}
                <Link href="/wallet" style={{ color: "var(--error)", fontWeight: 700 }}>Top up now</Link>
              </div>
            )}
            {guestMissingInfo && (
              <div className="muted mt-2" style={{ color: "var(--warning)" }}>
                {!guestEmail.trim() ? "Enter your email above to continue." : "Enter your EcoCash number above to continue."}
              </div>
            )}

            <button
              className="btn btn-primary btn-block mt-4"
              disabled={busy || insufficient || guestMissingInfo || noMethodChosen}
              onClick={() => { if (method === "wallet") setStep("processing"); submit(); }}
            >
              {busy ? "Processing…" : method ? `Pay With ${PAY_VIA_LABEL[method]} ($${total.toFixed(2)})` : `Pay $${total.toFixed(2)}`}
            </button>
          </>
        )}

        {step === "processing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520 }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Processing…</div>
            <div className="muted mt-1">Hang tight, this takes a few seconds</div>
          </div>
        )}

        {step === "guest-ecocash" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520, textAlign: "center" }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Approve on your phone</div>
            <div className="muted mt-1" style={{ maxWidth: 280 }}>
              We sent a USSD prompt to {guestPhone}. Enter your EcoCash PIN to approve the ${total.toFixed(2)} payment.
            </div>
          </div>
        )}

        {step === "success" && result && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 70, textAlign: "center" }}>
            <div className="success-pop" style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--green-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)" }}>
              <Icon name="check" size={42} stroke={3} />
            </div>
            <h2 style={{ fontSize: 21, marginTop: 20 }}>{isVoucher(service) ? "Vouchers ready" : "Top up successful"}</h2>
            <div className="muted mt-1">${result.amount.toFixed(2)} sent to {phone}</div>
            {result.fee > 0 && <div className="muted">+ ${result.fee.toFixed(2)} processing fee</div>}
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("receipt")}>View receipt</button>
            <Link href="/home" className="btn btn-ghost btn-block" style={{ textDecoration: "none" }}>Done</Link>
          </div>
        )}

        {step === "receipt" && result && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 6 }}>
            <div className="receipt-card">
              <div style={{ textAlign: "center", paddingBottom: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>TopMe Receipt</div>
                <div className="muted">Digital payments, done right</div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 14px" }}>
                <canvas ref={qrRef} width={132} height={132} />
              </div>
              <div style={{ textAlign: "center", fontWeight: 800, fontSize: 26 }}>${(result.amount + result.fee).toFixed(2)}</div>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <span style={{ background: "var(--green-50)", color: "var(--success)", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>✓ Successful</span>
                {result.fulfillment_status === "simulated" && (
                  <span style={{ marginLeft: 6, background: "var(--warning-bg)", color: "var(--warning)", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>Simulated fulfillment</span>
                )}
                {result.fulfillment_status === "pending" && (
                  <span style={{ marginLeft: 6, background: "var(--blue-50)", color: "var(--blue)", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>Delivering…</span>
                )}
              </div>
              <div className="dashed" />
              <ReviewRow label="Reference" value={result.reference} />
              <ReviewRow label="Network" value={network?.name ?? "—"} />
              <ReviewRow label="Phone Number" value={phone} />
              <ReviewRow label="Amount" value={`$${result.amount.toFixed(2)}`} />
              {result.fee > 0 && <ReviewRow label="Processing fee" value={`$${result.fee.toFixed(2)}`} />}
              <ReviewRow label="Paid via" value={method ? PAY_VIA_LABEL[method] : "—"} />
            </div>
            <Link href="/home" className="btn btn-primary btn-block mt-3" style={{ textDecoration: "none" }}>Done</Link>
          </div>
        )}
      </div>
    </div>
  );
}
