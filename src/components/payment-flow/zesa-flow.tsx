"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { hexA } from "@/lib/data/catalog-helpers";
import { calculatePlatformFee, calculateGatewaySurcharge } from "@/lib/fees";
import { payService, validateMeter } from "@/lib/actions/payments";
import { startGuestCheckout, type GuestGateway } from "@/lib/actions/guest-payments";
import { addGuestActivity } from "@/lib/guest-activity";
import { DenomTile, EditableRow, PaymentMethodSection, ReviewRow, type PaymentBanners, type PaymentMethod } from "./flow-shared";
import type { Service, Transaction } from "@/types/database";

type Step = "meter" | "amount" | "review" | "processing" | "guest-ecocash" | "success" | "error";

const PAY_VIA_LABEL: Record<PaymentMethod, string> = {
  wallet: "TopMe Wallet",
  paynow: "Paynow",
  ecocash: "Ecocash Instant",
  stripe: "Stripe",
};

export function ZesaFlow({
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
  const [step, setStep] = useState<Step>("meter");
  const [meter, setMeter] = useState("");
  // Registered ZESA account holder for `owner.meter`, fetched from ZETDC via
  // VitalPay before payment so the buyer can confirm the meter is right.
  // `owner` null with a matching `checkedMeter` means the check ran but
  // returned no name (service down / not wired / name field absent) — we
  // don't re-nag or block in that case.
  const [owner, setOwner] = useState<{ name: string | null; address: string | null } | null>(null);
  const [checkedMeter, setCheckedMeter] = useState<string | null>(null);
  const [meterChecking, setMeterChecking] = useState(false);
  const [meterError, setMeterError] = useState<string | null>(null);
  const [denom, setDenom] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Transaction | null>(null);
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [guestPhone, setGuestPhone] = useState(initialGuestPhone);
  const [method, setMethod] = useState<PaymentMethod | null>(null);

  const amount = denom ?? (parseFloat(customAmount) || 0);
  const ownerName = checkedMeter === meter.trim() ? owner?.name ?? null : null;

  // Returns true if checkout may proceed (valid meter, or the check couldn't
  // run), false if it's a known-bad meter — in which case `meterError` is set
  // and the caller should keep the customer on the meter step.
  async function runMeterCheck(): Promise<boolean> {
    const target = meter.trim();
    if (checkedMeter === target) return true; // already checked this exact number
    setMeterChecking(true);
    setMeterError(null);
    try {
      const res = await validateMeter(target);
      if (res.state === "invalid") {
        setMeterError(res.message);
        setOwner(null);
        setCheckedMeter(null);
        return false;
      }
      setOwner(res.state === "ok" ? { name: res.customerName, address: res.address } : null);
      setCheckedMeter(target);
      return true;
    } catch {
      // Network/unexpected — don't block the purchase on our own check failing.
      setOwner(null);
      setCheckedMeter(target);
      return true;
    } finally {
      setMeterChecking(false);
    }
  }

  async function continueFromMeter() {
    if (await runMeterCheck()) setStep("amount");
  }

  async function submitGateway() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await startGuestCheckout({
        serviceId: service.id,
        serviceName: service.name,
        amount,
        recipient: meter,
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
            if (data.transaction.fulfillment_status === "failed") {
              // Gateway captured the money but delivery failed — the refund
              // path already notified the customer. Never show "successful"
              // for a transaction whose delivery leg failed.
              setErrorMsg("Payment went through but delivery failed — a refund is being processed.");
              setStep("error");
              return;
            }
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
        recipient: meter,
        beneficiaryLabel: meter,
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

  const stepIndex = ["meter", "amount", "review"].indexOf(step);
  const showTop = !["processing", "guest-ecocash", "success"].includes(step);
  const fee = calculatePlatformFee(service.id, amount) + calculateGatewaySurcharge(method, amount);
  const total = amount + fee;
  const insufficient = method === "wallet" && total > walletBalance;
  const noMethodChosen = method === null;
  const guestMissingInfo = method !== null && method !== "wallet" && (!guestEmail.trim() || (method === "ecocash" && !guestPhone.trim()));
  const tokenPieces = Array.isArray(result?.receipt?.token_pieces) ? (result.receipt.token_pieces as string[]) : [];

  return (
    <div>
      {showTop && (
        <div className="topbar">
          <button
            className="backbtn tap"
            onClick={() => {
              if (step === "amount") setStep("meter");
              else if (step === "review") setStep("amount");
              else if (step === "error") setStep("meter");
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
        {step === "meter" && (
          <>
            <div className="ibadge mt-2" style={{ background: hexA(service.color, 0.12), color: service.color, width: 56, height: 56, borderRadius: 18 }}>
              <Icon name={service.icon} size={26} stroke={1.7} />
            </div>
            <h2 style={{ fontSize: 20, marginTop: 14 }}>{service.name}</h2>
            <div className="muted mb-3">Enter your prepaid meter number</div>
            <label className="field-label">Meter Number</label>
            <input
              className="field"
              placeholder={service.id_placeholder ?? ""}
              value={meter}
              inputMode="numeric"
              onChange={(e) => {
                setMeter(e.target.value);
                setMeterError(null);
              }}
            />
            {meterError ? (
              <div className="mt-2" style={{ color: "var(--error)", fontSize: 13, lineHeight: 1.5 }}>
                {meterError}
              </div>
            ) : ownerName ? (
              <div
                className="row gap-2 mt-2"
                style={{ alignItems: "center", color: "var(--success)", fontSize: 13, fontWeight: 600 }}
              >
                <Icon name="check" size={15} stroke={2.4} />
                <span>{ownerName}</span>
              </div>
            ) : (
              <div className="mt-2 muted" style={{ lineHeight: 1.5 }}>
                Double-check your meter number — nothing is charged until you confirm.
              </div>
            )}
            <button
              className="btn btn-primary btn-block mt-4"
              disabled={meter.trim().length < 4 || meterChecking}
              onClick={continueFromMeter}
            >
              {meterChecking ? "Checking meter…" : "Continue"}
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
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("meter")}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{meter}</div>
                <div className="muted">{ownerName ?? "Meter Number"}</div>
              </div>
            </div>

            <label className="field-label">Amount (USD)</label>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {(service.chips ?? []).map((c) => (
                <DenomTile key={c} amount={c} selected={denom === c} onClick={() => { setDenom(c); setCustomAmount(""); }} />
              ))}
            </div>
            <label className="field-label mt-2">Or enter custom amount</label>
            <input
              className="field"
              placeholder="$0.00"
              inputMode="decimal"
              value={customAmount}
              onChange={(e) => { setCustomAmount(e.target.value.replace(/[^0-9.]/g, "")); setDenom(null); }}
            />
            <div className="muted mt-2" style={{ fontSize: 12 }}>
              Charged in USD — no ZiG conversion.
            </div>

            <button className="btn btn-primary btn-block mt-4" disabled={!(amount > 0)} onClick={() => setStep("review")}>
              Continue{amount > 0 ? ` · $${amount.toFixed(2)}` : ""}
            </button>
          </>
        )}

        {step === "review" && (
          <>
            <h2 style={{ fontSize: 19, marginTop: 6 }}>Review purchase</h2>
            <div className="muted mb-3">Tap the pencil to fix anything</div>
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="card-pad" style={{ textAlign: "center", borderBottom: "1px dashed var(--border)", background: service.color }}>
                <div className="muted" style={{ color: "rgba(255,255,255,0.75)" }}>You&apos;re buying</div>
                <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4, color: "#fff" }}>${total.toFixed(2)}</div>
              </div>
              <div style={{ padding: "6px 18px" }}>
                <EditableRow
                  label="Meter Number"
                  value={meter}
                  onSave={(next) => {
                    setMeter(next);
                    if (next.trim() !== checkedMeter) {
                      setOwner(null);
                      setCheckedMeter(null);
                    }
                  }}
                  placeholder={service.id_placeholder ?? ""}
                />
                {ownerName && <ReviewRow label="Account holder" value={ownerName} />}
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
              disabled={busy || meterChecking || insufficient || guestMissingInfo || noMethodChosen}
              onClick={async () => {
                // Meter may have been edited on this screen — re-confirm before charging.
                if (!(await runMeterCheck())) {
                  setStep("meter");
                  return;
                }
                if (method === "wallet") setStep("processing");
                submit();
              }}
            >
              {busy ? "Processing…" : meterChecking ? "Checking meter…" : method ? `Pay With ${PAY_VIA_LABEL[method]} ($${total.toFixed(2)})` : `Pay $${total.toFixed(2)}`}
            </button>
          </>
        )}

        {step === "processing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520 }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Fetching your token…</div>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, textAlign: "center" }}>
            <div className="success-pop" style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--green-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)" }}>
              <Icon name="zap" size={36} stroke={2} />
            </div>
            <h2 style={{ fontSize: 21, marginTop: 18 }}>Token ready</h2>
            <div className="muted mt-1">${result.amount.toFixed(2)} for meter {meter}</div>
            {result.fee > 0 && <div className="muted">+ ${result.fee.toFixed(2)} processing fee</div>}

            {tokenPieces.length > 0 ? (
              <div className="receipt-card mt-3" style={{ width: "100%" }}>
                <div className="muted" style={{ textAlign: "center" }}>Your ZESA Token</div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 800,
                    fontSize: 20,
                    letterSpacing: "0.04em",
                    textAlign: "center",
                    marginTop: 8,
                    wordBreak: "break-all",
                  }}
                >
                  {tokenPieces.join(" ")}
                </div>
                {typeof result.receipt?.units === "number" && (
                  <div className="muted mt-2" style={{ textAlign: "center" }}>
                    {result.receipt.units} {(result.receipt.unit as string) ?? "kWh"}
                  </div>
                )}
                <button
                  className="btn btn-secondary btn-block mt-3"
                  onClick={() => navigator.clipboard.writeText(tokenPieces.join(""))}
                >
                  <Icon name="copy" size={16} stroke={2} /> Copy Token
                </button>
              </div>
            ) : (
              <div className="card card-pad mt-3" style={{ width: "100%" }}>
                <div className="muted">
                  {result.fulfillment_status === "simulated"
                    ? "This was a simulated purchase — no live token was issued."
                    : "Your token is being generated and will arrive shortly."}
                </div>
              </div>
            )}

            <ReviewRow label="Reference" value={result.reference} />
            <ReviewRow label="Amount" value={`$${result.amount.toFixed(2)}`} />
            {result.fee > 0 && <ReviewRow label="Processing fee" value={`$${result.fee.toFixed(2)}`} />}
            <ReviewRow label="Paid via" value={method ? PAY_VIA_LABEL[method] : "—"} />
            <Link href="/home" className="btn btn-primary btn-block mt-3" style={{ textDecoration: "none" }}>Done</Link>
          </div>
        )}
      </div>
    </div>
  );
}
