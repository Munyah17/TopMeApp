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
import { EditableRow, PaymentMethodSection, ReviewRow, type PaymentBanners, type PaymentMethod } from "./flow-shared";
import type { Service, Transaction } from "@/types/database";

type Step = "account" | "amount" | "review" | "processing" | "guest-ecocash" | "success" | "receipt" | "error";

const PAY_VIA_LABEL: Record<PaymentMethod, string> = {
  wallet: "TopMe Wallet",
  paynow: "Paynow",
  ecocash: "Ecocash Instant",
  stripe: "Stripe",
};

// TelOne is the only one of these with a real named-package catalogue (per
// the reference flow) — VitalPay's bills API has no plan/package concept of
// its own, it only takes an amount, so picking a package here just locks in
// that package's price as the amount we submit.
const TELONE_PACKAGES = [
  { name: "Voice Bundle US$4", price: 4 },
  { name: "Voice On Net US$5", price: 5 },
  { name: "Voice Bundle US$7", price: 7 },
  { name: "Voice Bundle US$13", price: 13 },
  { name: "Home 75", price: 15 },
  { name: "Voice Bundle US$20", price: 20 },
  { name: "Blaze 75", price: 20 },
  { name: "Voice Bundle US$25", price: 25 },
  { name: "Blaze 150", price: 25 },
  { name: "Home Unlimited", price: 30 },
  { name: "Speed 50", price: 40 },
  { name: "Blaze 500", price: 50 },
  { name: "Speed 80", price: 60 },
  { name: "Blaze Unlimited", price: 75 },
  { name: "Speed 100", price: 90 },
];

export function BroadbandFlow({
  service,
  walletBalance,
  isGuest = false,
  guestEmail: initialGuestEmail = "",
  guestPhone: initialGuestPhone = "",
  banners,
}: {
  service: Service;
  walletBalance: number;
  isGuest?: boolean;
  guestEmail?: string;
  guestPhone?: string;
  banners?: PaymentBanners;
}) {
  const router = useRouter();
  const usesPackages = service.id === "telone";
  const fullBalance = service.outstanding ?? 0;

  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState("");
  const [packageIdx, setPackageIdx] = useState<number | null>(null);
  const [payFullBalance, setPayFullBalance] = useState(true);
  const [customAmount, setCustomAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Transaction | null>(null);
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [guestPhone, setGuestPhone] = useState(initialGuestPhone);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const amount = usesPackages
    ? packageIdx !== null
      ? TELONE_PACKAGES[packageIdx].price
      : 0
    : payFullBalance
      ? fullBalance
      : parseFloat(customAmount) || 0;

  useEffect(() => {
    if (step === "receipt" && result && qrRef.current) {
      QRCode.toCanvas(qrRef.current, `TOPME:${result.reference}`, { width: 132, margin: 1 }, () => {});
    }
  }, [step, result]);

  async function submitGateway() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await startGuestCheckout({
        serviceId: service.id,
        serviceName: service.name,
        amount,
        recipient: account,
        guestEmail,
        guestPhone: guestPhone || undefined,
        gateway: method as GuestGateway,
      });
      if (res.gateway === "ecocash") {
        setStep("guest-ecocash");
        const poll = setInterval(async () => {
          const r = await fetch("/api/guest/ecocash/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: res.reference }),
          });
          const data = await r.json();
          if (data.status === "completed") {
            clearInterval(poll);
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
            clearInterval(poll);
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
        recipient: account,
        beneficiaryLabel: account,
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

  const stepIndex = ["account", "amount", "review"].indexOf(step);
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
              if (step === "amount") setStep("account");
              else if (step === "review") setStep("amount");
              else if (step === "error") setStep("account");
              else router.back();
            }}
          >
            <Icon name="chevronL" size={18} stroke={2.2} />
          </button>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>{service.name}</div>
          {stepIndex >= 0 && (
            <div className="stepdots">
              {[0, 1, 2].map((i) => (
                <span key={i} className={stepIndex >= i ? "on" : ""} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px content-narrow" style={{ paddingTop: showTop ? 4 : 0 }}>
        {step === "account" && (
          <>
            <div className="ibadge mt-2" style={{ background: hexA(service.color, 0.12), color: service.color, width: 56, height: 56, borderRadius: 18 }}>
              <Icon name={service.icon} size={26} stroke={1.7} />
            </div>
            <h2 style={{ fontSize: 20, marginTop: 14 }}>{service.name}</h2>
            <div className="muted mb-3">Enter your account number to make a payment</div>
            <label className="field-label">{service.id_label}</label>
            <input className="field" placeholder={service.id_placeholder ?? ""} value={account} onChange={(e) => setAccount(e.target.value)} />
            <div className="mt-2 muted" style={{ lineHeight: 1.5 }}>
              Double-check your account number — nothing is charged until you confirm.
            </div>
            <button className="btn btn-primary btn-block mt-4" disabled={account.trim().length < 3} onClick={() => setStep("amount")}>
              Continue
            </button>
          </>
        )}

        {step === "error" && (
          <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, textAlign: "center" }}>
            <div style={{ width: 84, height: 84, borderRadius: 26, background: "#FDECEC", color: "var(--error)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="alert" size={38} stroke={1.6} />
            </div>
            <h2 style={{ fontSize: 18, marginTop: 18 }}>We couldn&apos;t process that</h2>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>{errorMsg || "Something went wrong. Please try again."}</div>
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("account")}>
              Try again
            </button>
          </div>
        )}

        {step === "amount" && (
          <>
            <div className="card card-pad" style={{ marginBottom: 18 }}>
              <div className="row between">
                <span className="muted">{service.id_label}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{account}</span>
              </div>
              {!usesPackages && (
                <div className="row between mt-1">
                  <span className="muted">Balance owed</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>${fullBalance.toFixed(2)}</span>
                </div>
              )}
            </div>

            {usesPackages ? (
              <>
                <label className="field-label">Choose a package</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {TELONE_PACKAGES.map((p, i) => (
                    <div
                      key={p.name}
                      className="card tap row between"
                      onClick={() => setPackageIdx(i)}
                      style={{
                        padding: "12px 14px",
                        borderColor: packageIdx === i ? "var(--green)" : "var(--border)",
                        boxShadow: packageIdx === i ? "0 0 0 3px rgba(0,200,83,0.14)" : "none",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</span>
                      <span style={{ fontWeight: 800 }}>${p.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="field-label">Payment</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    className="card tap row gap-2"
                    style={{ padding: "12px 14px", cursor: "pointer", borderColor: payFullBalance ? "var(--green)" : "var(--border)" }}
                  >
                    <input type="radio" checked={payFullBalance} onChange={() => setPayFullBalance(true)} />
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Full Balance</span>
                    <span style={{ fontWeight: 800 }}>${fullBalance.toFixed(2)}</span>
                  </label>
                  <label
                    className="card tap row gap-2"
                    style={{ padding: "12px 14px", cursor: "pointer", borderColor: !payFullBalance ? "var(--green)" : "var(--border)" }}
                  >
                    <input type="radio" checked={!payFullBalance} onChange={() => setPayFullBalance(false)} />
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>Other Amount</span>
                  </label>
                </div>
                {!payFullBalance && (
                  <input
                    className="field mt-2"
                    placeholder="$0.00"
                    inputMode="decimal"
                    autoFocus
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                )}
              </>
            )}

            <button className="btn btn-primary btn-block mt-4" disabled={!(amount > 0)} onClick={() => setStep("review")}>
              Continue{amount > 0 ? ` · $${amount.toFixed(2)}` : ""}
            </button>
          </>
        )}

        {step === "review" && (
          <>
            <h2 style={{ fontSize: 19, marginTop: 6 }}>Review payment</h2>
            <div className="muted mb-3">Tap the pencil to fix anything</div>
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="card-pad" style={{ textAlign: "center", borderBottom: "1px dashed var(--border)", background: `linear-gradient(135deg, var(--navy), ${service.color})` }}>
                <div className="muted" style={{ color: "rgba(255,255,255,0.75)" }}>You&apos;re paying</div>
                <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4, color: "#fff" }}>${total.toFixed(2)}</div>
                {usesPackages && packageIdx !== null && (
                  <div className="muted" style={{ color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{TELONE_PACKAGES[packageIdx].name}</div>
                )}
              </div>
              <div style={{ padding: "6px 18px" }}>
                <EditableRow label={service.id_label} value={account} onSave={setAccount} placeholder={service.id_placeholder ?? ""} />
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
            <h2 style={{ fontSize: 21, marginTop: 20 }}>Payment successful</h2>
            <div className="muted mt-1">${result.amount.toFixed(2)} paid to {service.name}</div>
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
                  <span style={{ marginLeft: 6, background: "#FEF6E7", color: "var(--warning)", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>Simulated fulfillment</span>
                )}
                {result.fulfillment_status === "pending" && (
                  <span style={{ marginLeft: 6, background: "var(--blue-50)", color: "var(--blue)", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>Delivering…</span>
                )}
              </div>
              <div className="dashed" />
              <ReviewRow label="Reference" value={result.reference} />
              <ReviewRow label={service.id_label} value={account} />
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
