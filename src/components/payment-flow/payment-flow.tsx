"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Icon } from "@/components/icons";
import { hexA } from "@/lib/data/catalog-helpers";
import { calculatePlatformFee } from "@/lib/fees";
import { payService, sendGiftVoucher } from "@/lib/actions/payments";
import { startGuestCheckout, type GuestGateway } from "@/lib/actions/guest-payments";
import { addGuestActivity } from "@/lib/guest-activity";
import type { DataBundle, Network, Service, Transaction, TvPackage } from "@/types/database";

type Step = "details" | "amount" | "review" | "processing" | "guest-ecocash" | "success" | "receipt" | "error";

export function PaymentFlow({
  service,
  bundles,
  packages,
  networks,
  walletBalance,
  isGuest = false,
  guestEmail: initialGuestEmail = "",
  guestPhone: initialGuestPhone = "",
}: {
  service: Service;
  bundles: DataBundle[];
  packages: TvPackage[];
  networks: Network[];
  walletBalance: number;
  isGuest?: boolean;
  guestEmail?: string;
  guestPhone?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [extra, setExtra] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveBeneficiary, setSaveBeneficiary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Transaction | null>(null);
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [guestPhone, setGuestPhone] = useState(initialGuestPhone);
  const [gateway, setGateway] = useState<GuestGateway>("paynow");
  const qrRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentAmount = (): number => {
    if (service.amount_mode === "chips") return amount ?? (parseFloat(customAmount) || 0);
    if (service.amount_mode === "bundles") return bundles.find((b) => b.id === bundleId)?.price ?? 0;
    if (service.amount_mode === "packages") return packages.find((p) => p.id === pkgId)?.price ?? 0;
    if (service.amount_mode === "outstanding") return service.outstanding ?? 0;
    return 0;
  };

  useEffect(() => {
    if (step === "receipt" && result && qrRef.current) {
      QRCode.toCanvas(qrRef.current, `TOPME:${result.reference}`, { width: 132, margin: 1 }, () => {});
    }
  }, [step, result]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function submitGuestPayment() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await startGuestCheckout({
        serviceId: service.id,
        serviceName: service.name,
        amount: currentAmount(),
        recipient: identifier,
        networkId,
        extraValue: extra || null,
        guestEmail,
        guestPhone: guestPhone || undefined,
        gateway,
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

  async function submitPayment() {
    if (isGuest) return submitGuestPayment();
    setBusy(true);
    setErrorMsg(null);
    try {
      if (service.is_gift) {
        const voucher = await sendGiftVoucher(identifier, currentAmount(), extra || undefined);
        setVoucherCode(voucher.code);
        setResult({
          id: voucher.id,
          user_id: "",
          service_id: service.id,
          network_id: null,
          recipient_identifier: identifier,
          extra_value: extra || null,
          amount: currentAmount(),
          fee: 0,
          status: "success",
          reference: voucher.code,
          receipt: {},
          provider_cost: 0,
          revenue: currentAmount(),
          owner_label: null,
          fulfillment_provider: "wallet",
          fulfillment_status: "fulfilled",
          created_at: voucher.created_at,
        });
      } else {
        const tx = await payService({
          serviceId: service.id,
          serviceName: service.name,
          amount: currentAmount(),
          recipient: identifier,
          networkId,
          extraValue: extra || null,
          saveBeneficiary,
          beneficiaryLabel: extra || identifier,
        });
        setResult(tx);
      }
      setStep("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Payment failed.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  const showTop = step !== "processing" && step !== "guest-ecocash" && step !== "success";
  const stepIndex = ["details", "amount", "review"].indexOf(step);

  return (
    <div>
      {showTop && (
        <div className="topbar">
          <button
            className="backbtn tap"
            onClick={() => {
              if (step === "amount") setStep("details");
              else if (step === "review") setStep("amount");
              else if (step === "error") setStep("details");
              else router.back();
            }}
          >
            <Icon name="chevronL" size={18} stroke={2.2} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{service.name}</div>
          </div>
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
        {step === "details" && (
          <DetailsStep
            service={service}
            networks={networks}
            networkId={networkId}
            setNetworkId={setNetworkId}
            identifier={identifier}
            setIdentifier={setIdentifier}
            extra={extra}
            setExtra={setExtra}
            onContinue={() => setStep("amount")}
          />
        )}

        {step === "error" && (
          <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, textAlign: "center" }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 26,
                background: "#FDECEC",
                color: "var(--error)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="alert" size={38} stroke={1.6} />
            </div>
            <h2 style={{ fontSize: 18, marginTop: 18 }}>We couldn&apos;t process that</h2>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>
              {errorMsg || "Something went wrong. Please try again."}
            </div>
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("details")}>
              Try again
            </button>
            <Link href="/account" className="btn btn-secondary btn-block mt-2" style={{ textDecoration: "none" }}>
              Contact support
            </Link>
          </div>
        )}

        {step === "amount" && (
          <AmountStep
            service={service}
            bundles={bundles}
            packages={packages}
            identifier={identifier}
            amount={amount}
            setAmount={setAmount}
            customAmount={customAmount}
            setCustomAmount={setCustomAmount}
            bundleId={bundleId}
            setBundleId={setBundleId}
            pkgId={pkgId}
            setPkgId={setPkgId}
            currentAmount={currentAmount}
            onContinue={() => setStep("review")}
          />
        )}

        {step === "review" && (
          <ReviewStep
            service={service}
            bundles={bundles}
            packages={packages}
            bundleId={bundleId}
            pkgId={pkgId}
            identifier={identifier}
            extra={extra}
            amount={currentAmount()}
            walletBalance={walletBalance}
            saveBeneficiary={saveBeneficiary}
            setSaveBeneficiary={setSaveBeneficiary}
            busy={busy}
            isGuest={isGuest}
            guestEmail={guestEmail}
            setGuestEmail={setGuestEmail}
            guestPhone={guestPhone}
            setGuestPhone={setGuestPhone}
            gateway={gateway}
            setGateway={setGateway}
            onPay={() => {
              if (!isGuest) setStep("processing");
              submitPayment();
            }}
          />
        )}

        {step === "processing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520 }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Processing payment…</div>
            <div className="muted mt-1">Hang tight, this takes a few seconds</div>
          </div>
        )}

        {step === "guest-ecocash" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520, textAlign: "center" }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Approve on your phone</div>
            <div className="muted mt-1" style={{ maxWidth: 280 }}>
              We sent a USSD prompt to {guestPhone}. Enter your EcoCash PIN to approve the ${currentAmount().toFixed(2)} payment.
            </div>
          </div>
        )}

        {step === "success" && result && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 70, textAlign: "center" }}>
            <div
              className="success-pop"
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: "var(--green-50)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--success)",
              }}
            >
              <Icon name="check" size={42} stroke={3} />
            </div>
            <h2 style={{ fontSize: 21, marginTop: 20 }}>{service.is_gift ? "Voucher sent" : "Payment successful"}</h2>
            <div className="muted mt-1">
              ${currentAmount().toFixed(2)} {service.is_gift ? "sent for" : "paid for"} {service.name}
            </div>
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("receipt")}>
              View receipt
            </button>
            <Link href="/home" className="btn btn-ghost btn-block" style={{ textDecoration: "none" }}>
              Done
            </Link>
          </div>
        )}

        {step === "receipt" && result && (
          <ReceiptStep service={service} result={result} identifier={identifier} extra={extra} voucherCode={voucherCode} qrRef={qrRef} />
        )}
      </div>
    </div>
  );
}

function DetailsStep({
  service,
  networks,
  networkId,
  setNetworkId,
  identifier,
  setIdentifier,
  extra,
  setExtra,
  onContinue,
}: {
  service: Service;
  networks: Network[];
  networkId: string | null;
  setNetworkId: (v: string) => void;
  identifier: string;
  setIdentifier: (v: string) => void;
  extra: string;
  setExtra: (v: string) => void;
  onContinue: () => void;
}) {
  const canContinue = identifier.trim().length > 0 && (!service.needs_network || networkId);
  return (
    <>
      <div
        className="ibadge mt-2"
        style={{ background: hexA(service.color, 0.12), color: service.color, width: 56, height: 56, borderRadius: 18 }}
      >
        <Icon name={service.icon} size={26} stroke={1.7} />
      </div>
      <h2 style={{ fontSize: 20, marginTop: 14 }}>{service.name}</h2>
      <div className="muted mb-3">Enter the details below to continue</div>

      {service.needs_network && (
        <>
          <label className="field-label">Network</label>
          <div className="row gap-2 mb-3">
            {networks.map((n) => (
              <div
                key={n.id}
                className={`chip tap ${networkId === n.id ? "selected" : ""}`}
                style={{ flex: 1, textAlign: "center" }}
                onClick={() => setNetworkId(n.id)}
              >
                {n.name}
              </div>
            ))}
          </div>
        </>
      )}

      <label className="field-label">{service.id_label}</label>
      <input
        className="field"
        placeholder={service.id_placeholder ?? ""}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />

      {service.extra_field_label && (
        <>
          <label className="field-label mt-2">{service.extra_field_label}</label>
          <input
            className="field"
            placeholder={service.extra_field_placeholder ?? ""}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </>
      )}

      <div className="mt-2 muted" style={{ lineHeight: 1.5 }}>
        We&apos;ll verify these details before you pay. Nothing is charged until you confirm the amount.
      </div>

      <button className="btn btn-primary btn-block mt-4" disabled={!canContinue} onClick={onContinue}>
        Continue
      </button>
    </>
  );
}

function AmountStep({
  service,
  bundles,
  packages,
  identifier,
  amount,
  setAmount,
  customAmount,
  setCustomAmount,
  bundleId,
  setBundleId,
  pkgId,
  setPkgId,
  currentAmount,
  onContinue,
}: {
  service: Service;
  bundles: DataBundle[];
  packages: TvPackage[];
  identifier: string;
  amount: number | null;
  setAmount: (v: number | null) => void;
  customAmount: string;
  setCustomAmount: (v: string) => void;
  bundleId: string | null;
  setBundleId: (v: string) => void;
  pkgId: string | null;
  setPkgId: (v: string) => void;
  currentAmount: () => number;
  onContinue: () => void;
}) {
  const amt = currentAmount();
  return (
    <>
      <div className="card card-pad row gap-2" style={{ marginBottom: 18 }}>
        <div className="ibadge round" style={{ background: hexA(service.color, 0.12), color: service.color }}>
          <Icon name={service.icon} size={20} stroke={1.8} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{identifier}</div>
          <div className="muted">{service.name}</div>
        </div>
      </div>

      {service.amount_mode === "chips" && (
        <>
          <label className="field-label">Choose amount</label>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {(service.chips ?? []).map((c) => (
              <div
                key={c}
                className={`chip tap ${amount === c ? "selected" : ""}`}
                onClick={() => {
                  setAmount(c);
                  setCustomAmount("");
                }}
              >
                ${c}
              </div>
            ))}
          </div>
          <label className="field-label mt-2">Or enter custom amount</label>
          <input
            className="field"
            placeholder="$0.00"
            inputMode="decimal"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value.replace(/[^0-9.]/g, ""));
              setAmount(null);
            }}
          />
        </>
      )}

      {service.amount_mode === "bundles" && (
        <>
          <label className="field-label">Available bundles</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bundles.map((b) => (
              <div
                key={b.id}
                className="card tap row gap-2"
                onClick={() => setBundleId(b.id)}
                style={{
                  padding: 14,
                  borderColor: bundleId === b.id ? "var(--green)" : "var(--border)",
                  boxShadow: bundleId === b.id ? "0 0 0 3px rgba(0,200,83,0.14)" : "none",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {b.size} · <span style={{ color: "var(--text-soft)", fontWeight: 600 }}>{b.label}</span>
                  </div>
                  <div className="muted">{b.sub}</div>
                </div>
                <div style={{ fontWeight: 800 }}>${b.price}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {service.amount_mode === "packages" && (
        <>
          <label className="field-label">Recommended packages</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {packages.map((p) => (
              <div
                key={p.id}
                className="card tap row gap-2"
                onClick={() => setPkgId(p.id)}
                style={{
                  padding: 14,
                  borderColor: pkgId === p.id ? "var(--green)" : "var(--border)",
                  boxShadow: pkgId === p.id ? "0 0 0 3px rgba(0,200,83,0.14)" : "none",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <div className="muted">Monthly subscription</div>
                </div>
                <div style={{ fontWeight: 800 }}>${p.price}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {service.amount_mode === "outstanding" && (
        <div className="card card-pad" style={{ background: "var(--navy)", border: "none" }}>
          <div className="muted" style={{ color: "rgba(255,255,255,0.55)" }}>
            Outstanding balance
          </div>
          <div style={{ color: "#fff", fontSize: 30, fontWeight: 800, marginTop: 4 }}>${(service.outstanding ?? 0).toFixed(2)}</div>
          <div className="muted" style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            Due now · full settlement
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-block mt-4" disabled={!(amt > 0)} onClick={onContinue}>
        Continue{amt > 0 ? ` · $${amt.toFixed(2)}` : ""}
      </button>
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{value}</span>
    </div>
  );
}

function ReviewStep({
  service,
  bundles,
  packages,
  bundleId,
  pkgId,
  identifier,
  extra,
  amount,
  walletBalance,
  saveBeneficiary,
  setSaveBeneficiary,
  busy,
  isGuest,
  guestEmail,
  setGuestEmail,
  guestPhone,
  setGuestPhone,
  gateway,
  setGateway,
  onPay,
}: {
  service: Service;
  bundles: DataBundle[];
  packages: TvPackage[];
  bundleId: string | null;
  pkgId: string | null;
  identifier: string;
  extra: string;
  amount: number;
  walletBalance: number;
  saveBeneficiary: boolean;
  setSaveBeneficiary: (v: boolean) => void;
  busy: boolean;
  isGuest: boolean;
  guestEmail: string;
  setGuestEmail: (v: string) => void;
  guestPhone: string;
  setGuestPhone: (v: string) => void;
  gateway: GuestGateway;
  setGateway: (v: GuestGateway) => void;
  onPay: () => void;
}) {
  let detailLabel = service.name;
  if (service.amount_mode === "bundles") {
    const b = bundles.find((x) => x.id === bundleId);
    if (b) detailLabel = `${b.size} ${b.label} Bundle`;
  } else if (service.amount_mode === "packages") {
    const p = packages.find((x) => x.id === pkgId);
    if (p) detailLabel = `${p.name} Package`;
  }
  const fee = service.is_gift ? 0 : calculatePlatformFee(service.id, amount);
  const total = amount + fee;
  const insufficient = !isGuest && total > walletBalance;
  const guestMissingInfo = isGuest && (!guestEmail.trim() || (gateway === "ecocash" && !guestPhone.trim()));

  return (
    <>
      <h2 style={{ fontSize: 19, marginTop: 6 }}>Review payment</h2>
      <div className="muted mb-3">Take a moment to check the details</div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card-pad" style={{ textAlign: "center", borderBottom: "1px dashed var(--border)" }}>
          <div className="muted">You&apos;re paying</div>
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>${total.toFixed(2)}</div>
        </div>
        <div style={{ padding: "6px 18px" }}>
          <ReviewRow label="Service" value={detailLabel} />
          <ReviewRow label={service.id_label} value={identifier || "—"} />
          {service.is_gift && extra && <ReviewRow label="Sender Number" value={extra} />}
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

      {!service.is_gift && !isGuest && (
        <label className="row gap-2 mt-3" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={saveBeneficiary} onChange={(e) => setSaveBeneficiary(e.target.checked)} />
          <span className="muted">Save this recipient for next time</span>
        </label>
      )}

      {isGuest && (
        <div className="mt-3">
          <div className="muted mb-2" style={{ fontSize: 13 }}>
            No account needed. Pay directly and we&apos;ll email your receipt.
          </div>
          <label className="field-label">Email for receipt</label>
          <input
            className="field"
            type="email"
            placeholder="you@example.com"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />

          <label className="field-label mt-2">Pay with</label>
          <div className="row gap-2">
            {(
              [
                { id: "paynow", label: "Paynow" },
                { id: "stripe", label: "Card" },
                { id: "ecocash", label: "EcoCash" },
              ] as { id: GuestGateway; label: string }[]
            ).map((g) => (
              <div
                key={g.id}
                className={`chip tap ${gateway === g.id ? "selected" : ""}`}
                style={{ flex: 1, textAlign: "center" }}
                onClick={() => setGateway(g.id)}
              >
                {g.label}
              </div>
            ))}
          </div>

          {gateway === "ecocash" && (
            <>
              <label className="field-label mt-2">EcoCash Number</label>
              <input
                className="field"
                placeholder="077 123 4567"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </>
          )}

          <div className="muted mt-2" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="lock" size={13} stroke={2} /> Secured by{" "}
            {gateway === "paynow" ? "Paynow Zimbabwe" : gateway === "stripe" ? "Stripe" : "EcoCash"}
          </div>
        </div>
      )}

      {insufficient && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          Your wallet balance is too low for this payment.{" "}
          <Link href="/wallet" style={{ color: "var(--error)", fontWeight: 700 }}>
            Top up now
          </Link>
        </div>
      )}

      <button className="btn btn-primary btn-block mt-4" disabled={busy || insufficient || guestMissingInfo} onClick={onPay}>
        {busy ? "Processing…" : `Pay $${total.toFixed(2)}`}
      </button>
    </>
  );
}

function ReceiptStep({
  service,
  result,
  identifier,
  extra,
  voucherCode,
  qrRef,
}: {
  service: Service;
  result: Transaction;
  identifier: string;
  extra: string;
  voucherCode: string | null;
  qrRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const now = new Date(result.created_at);
  return (
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
          <span style={{ background: "var(--green-50)", color: "var(--success)", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>
            ✓ Successful
          </span>
          {result.fulfillment_status === "simulated" && (
            <span
              style={{
                marginLeft: 6,
                background: "#FEF6E7",
                color: "var(--warning)",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 8,
              }}
            >
              Simulated fulfillment
            </span>
          )}
          {result.fulfillment_status === "pending" && (
            <span
              style={{
                marginLeft: 6,
                background: "var(--blue-50)",
                color: "var(--blue)",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 8,
              }}
            >
              Delivering…
            </span>
          )}
        </div>
        <div className="dashed" />
        <ReviewRow label="Reference" value={result.reference} />
        {service.shows_token && Array.isArray(result.receipt?.token_pieces) && result.receipt.token_pieces.length > 0 && (
          <>
            <ReviewRow label="Token" value={(result.receipt.token_pieces as string[]).join(" ")} />
            {typeof result.receipt.units === "number" && (
              <ReviewRow label="Units" value={`${result.receipt.units} ${(result.receipt.unit as string) ?? "kWh"}`} />
            )}
          </>
        )}
        <ReviewRow label="Service" value={service.name} />
        <ReviewRow label={service.id_label} value={identifier || "—"} />
        <ReviewRow label="Amount" value={`$${result.amount.toFixed(2)}`} />
        {result.fee > 0 && <ReviewRow label="Processing fee" value={`$${result.fee.toFixed(2)}`} />}
        <ReviewRow
          label="Date"
          value={
            now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
            " · " +
            now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          }
        />
        <ReviewRow label="Paid via" value={result.user_id ? "TopMe Wallet" : "Guest checkout"} />
        {voucherCode && <ReviewRow label="Voucher Code" value={voucherCode} />}
        {service.is_gift && extra && <ReviewRow label="Sender Number" value={extra} />}
      </div>
      <div className="row gap-2 mt-3" style={{ width: "100%" }}>
        <button
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: "TopMe receipt", text: `TopMe payment ${result.reference}: $${(result.amount + result.fee).toFixed(2)}` }).catch(() => {});
            } else {
              navigator.clipboard.writeText(`TopMe payment ${result.reference}: $${(result.amount + result.fee).toFixed(2)}`);
            }
          }}
        >
          <Icon name="share" size={17} stroke={2} /> Share
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => window.print()}>
          <Icon name="printer" size={17} stroke={2} /> Print
        </button>
      </div>
      <Link href="/home" className="btn btn-primary btn-block mt-2" style={{ textDecoration: "none" }}>
        Done
      </Link>
    </div>
  );
}
