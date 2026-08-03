"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { hexA } from "@/lib/data/catalog-helpers";
import { calculatePlatformFee } from "@/lib/fees";
import { payService } from "@/lib/actions/payments";
import { startGuestCheckout, type GuestGateway } from "@/lib/actions/guest-payments";
import { addGuestActivity } from "@/lib/guest-activity";
import { DenomTile, EditableRow, GuestPaySection, ReviewRow } from "./flow-shared";
import type { Service, Transaction } from "@/types/database";

type Step = "meter" | "amount" | "review" | "processing" | "guest-ecocash" | "success" | "error";

export function ZesaFlow({
  service,
  walletBalance,
  isGuest = false,
  guestEmail: initialGuestEmail = "",
  guestPhone: initialGuestPhone = "",
}: {
  service: Service;
  walletBalance: number;
  isGuest?: boolean;
  guestEmail?: string;
  guestPhone?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("meter");
  const [meter, setMeter] = useState("");
  const [denom, setDenom] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Transaction | null>(null);
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [guestPhone, setGuestPhone] = useState(initialGuestPhone);
  const [gateway, setGateway] = useState<GuestGateway>("paynow");

  const amount = denom ?? (parseFloat(customAmount) || 0);

  async function submitGuest() {
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
        gateway,
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
    if (isGuest) return submitGuest();
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
  const fee = calculatePlatformFee(service.id, amount);
  const total = amount + fee;
  const insufficient = !isGuest && total > walletBalance;
  const guestMissingInfo = isGuest && (!guestEmail.trim() || (gateway === "ecocash" && !guestPhone.trim()));
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
            <input className="field" placeholder={service.id_placeholder ?? ""} value={meter} onChange={(e) => setMeter(e.target.value)} />
            <div className="mt-2 muted" style={{ lineHeight: 1.5 }}>
              Double-check your meter number — nothing is charged until you confirm.
            </div>
            <button className="btn btn-primary btn-block mt-4" disabled={meter.trim().length < 3} onClick={() => setStep("amount")}>
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
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{meter}</div>
                <div className="muted">Meter Number</div>
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
              <div className="card-pad" style={{ textAlign: "center", borderBottom: "1px dashed var(--border)", background: `linear-gradient(135deg, var(--navy), ${service.color})` }}>
                <div className="muted" style={{ color: "rgba(255,255,255,0.75)" }}>You&apos;re buying</div>
                <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4, color: "#fff" }}>${total.toFixed(2)}</div>
              </div>
              <div style={{ padding: "6px 18px" }}>
                <EditableRow label="Meter Number" value={meter} onSave={setMeter} placeholder={service.id_placeholder ?? ""} />
                <ReviewRow label="Amount" value={`$${amount.toFixed(2)}`} />
                <ReviewRow label="Processing fee" value={`$${fee.toFixed(2)}`} />
                {!isGuest && (
                  <>
                    <ReviewRow label="Payment method" value="TopMe Wallet" />
                    <ReviewRow label="Wallet balance" value={`$${walletBalance.toFixed(2)}`} />
                  </>
                )}
              </div>
            </div>

            {isGuest && (
              <GuestPaySection guestEmail={guestEmail} setGuestEmail={setGuestEmail} guestPhone={guestPhone} setGuestPhone={setGuestPhone} gateway={gateway} setGateway={setGateway} />
            )}

            {insufficient && (
              <div className="muted mt-2" style={{ color: "var(--error)" }}>
                Your wallet balance is too low for this.{" "}
                <Link href="/wallet" style={{ color: "var(--error)", fontWeight: 700 }}>Top up now</Link>
              </div>
            )}

            <button
              className="btn btn-primary btn-block mt-4"
              disabled={busy || insufficient || guestMissingInfo}
              onClick={() => { if (!isGuest) setStep("processing"); submit(); }}
            >
              {busy ? "Processing…" : `Pay $${total.toFixed(2)}`}
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
            <Link href="/home" className="btn btn-primary btn-block mt-3" style={{ textDecoration: "none" }}>Done</Link>
          </div>
        )}
      </div>
    </div>
  );
}
