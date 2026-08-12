"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { lookupRecipient, sendMoney } from "@/lib/actions/payments";
import type { P2pTransfer, ProfileLookup } from "@/types/database";

type Kind = "transfer" | "red_packet";
type Step = "details" | "looking-up" | "amount" | "review" | "processing" | "success" | "error";

const THEME: Record<Kind, { accent: string; accentSoft: string; gradient: string; title: string; icon: string; sentLabel: string }> = {
  transfer: {
    accent: "var(--green)",
    accentSoft: "var(--green-50)",
    gradient: "linear-gradient(135deg, var(--navy), #16324f)",
    title: "Send Money",
    icon: "arrowUpR",
    sentLabel: "sent",
  },
  red_packet: {
    accent: "#EF4444",
    accentSoft: "var(--error-bg)",
    gradient: "linear-gradient(135deg, #B91C1C, #EF4444 65%, #F59E0B 130%)",
    title: "Send a Red Packet",
    icon: "packet",
    sentLabel: "sent as a red packet",
  },
};

export function SendMoneyFlow({
  walletBalance,
  initialPhone = "",
  initialKind = "transfer",
}: {
  walletBalance: number;
  initialPhone?: string;
  initialKind?: Kind;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [step, setStep] = useState<Step>("details");
  const [phone, setPhone] = useState(initialPhone);
  const [recipient, setRecipient] = useState<ProfileLookup | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<P2pTransfer | null>(null);

  const theme = THEME[kind];
  const amountNum = parseFloat(amount) || 0;
  const insufficient = amountNum > walletBalance;

  async function submitDetails() {
    setStep("looking-up");
    setErrorMsg(null);
    const found = await lookupRecipient(phone);
    if (!found) {
      setErrorMsg("No TopMe account found with that phone number.");
      setStep("error");
      return;
    }
    setRecipient(found);
    setStep("amount");
  }

  async function submitTransfer() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const transfer = await sendMoney(phone, amountNum, note || undefined, kind);
      setResult(transfer);
      setStep("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Transfer failed.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  const showTop = step !== "processing" && step !== "success";
  const stepIndex = ["details", "amount", "review"].indexOf(step === "looking-up" ? "details" : step);

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
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{theme.title}</div>
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
          <>
            <div className="ibadge mt-2" style={{ background: theme.accentSoft, color: theme.accent, width: 56, height: 56, borderRadius: 18 }}>
              <Icon name={theme.icon} size={26} stroke={1.7} />
            </div>
            <h2 style={{ fontSize: 20, marginTop: 14 }}>{theme.title}</h2>
            <div className="muted mb-3">Instant, straight into their TopMe wallet</div>

            <div className="row gap-2 mb-3">
              {(
                [
                  { id: "transfer" as Kind, label: "Send Money" },
                  { id: "red_packet" as Kind, label: "Red Packet" },
                ]
              ).map((k) => (
                <div key={k.id} className={`chip tap ${kind === k.id ? "selected" : ""}`} style={{ flex: 1, textAlign: "center" }} onClick={() => setKind(k.id)}>
                  {k.label}
                </div>
              ))}
            </div>

            <label className="field-label">Recipient&apos;s Phone Number</label>
            <input className="field" placeholder="077 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />

            <div className="mt-2 muted" style={{ lineHeight: 1.5 }}>
              They need an existing TopMe account. We&apos;ll look them up before anything is sent.
            </div>

            <button className="btn btn-primary btn-block mt-4" disabled={phone.trim().length < 3} onClick={submitDetails}>
              Continue
            </button>
          </>
        )}

        {step === "looking-up" && (
          <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40 }}>
            <div className="skel" style={{ width: 64, height: 64, borderRadius: 20 }} />
            <div style={{ fontWeight: 700, marginTop: 20, fontSize: 15 }}>Looking up account…</div>
            <div className="muted mt-1">Checking that number</div>
          </div>
        )}

        {step === "error" && (
          <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, textAlign: "center" }}>
            <div style={{ width: 84, height: 84, borderRadius: 26, background: "var(--error-bg)", color: "var(--error)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="alert" size={38} stroke={1.6} />
            </div>
            <h2 style={{ fontSize: 18, marginTop: 18 }}>We couldn&apos;t send that</h2>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>
              {errorMsg || "Something went wrong. Please try again."}
            </div>
            <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("details")}>
              Try again
            </button>
          </div>
        )}

        {step === "amount" && recipient && (
          <>
            <div className="card card-pad row gap-2" style={{ marginBottom: 18 }}>
              <div className="ibadge round" style={{ background: theme.accentSoft, color: theme.accent }}>
                <Icon name="check" size={20} stroke={2.2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{recipient.full_name || "TopMe user"}</div>
                <div className="muted">{recipient.phone}</div>
              </div>
              <div style={{ background: "var(--green-50)", color: "var(--success)", fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 8 }}>
                Verified
              </div>
            </div>

            <label className="field-label">Amount</label>
            <input
              className="field"
              placeholder="$0.00"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />

            <label className="field-label mt-2">Message (optional)</label>
            <input
              className="field"
              placeholder={kind === "red_packet" ? "Happy birthday!" : "What's this for?"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <button className="btn btn-primary btn-block mt-4" disabled={!(amountNum > 0)} onClick={() => setStep("review")}>
              Continue{amountNum > 0 ? ` · $${amountNum.toFixed(2)}` : ""}
            </button>
          </>
        )}

        {step === "review" && recipient && (
          <>
            <h2 style={{ fontSize: 19, marginTop: 6 }}>Review transfer</h2>
            <div className="muted mb-3">Take a moment to check the details</div>
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="card-pad" style={{ textAlign: "center", borderBottom: "1px dashed var(--border)", background: theme.gradient }}>
                <div className="muted" style={{ color: "rgba(255,255,255,0.7)" }}>
                  You&apos;re sending
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4, color: "#fff" }}>${amountNum.toFixed(2)}</div>
              </div>
              <div style={{ padding: "6px 18px" }}>
                <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="muted">Recipient</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{recipient.full_name || recipient.phone}</span>
                </div>
                {note && (
                  <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="muted">Message</span>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{note}</span>
                  </div>
                )}
                <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="muted">Payment method</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>TopMe Wallet</span>
                </div>
                <div className="row between" style={{ padding: "12px 0" }}>
                  <span className="muted">Wallet balance</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>${walletBalance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {insufficient && (
              <div className="muted mt-2" style={{ color: "var(--error)" }}>
                Your wallet balance is too low for this transfer.{" "}
                <Link href="/wallet" style={{ color: "var(--error)", fontWeight: 700 }}>
                  Top up now
                </Link>
              </div>
            )}

            <button
              className="btn btn-primary btn-block mt-4"
              disabled={busy || insufficient}
              onClick={() => {
                setStep("processing");
                submitTransfer();
              }}
            >
              {busy ? "Sending…" : `Send $${amountNum.toFixed(2)}`}
            </button>
          </>
        )}

        {step === "processing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 520 }}>
            <div className="spinner-ring" />
            <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Sending…</div>
            <div className="muted mt-1">This only takes a moment</div>
          </div>
        )}

        {step === "success" && result && recipient && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 70, textAlign: "center" }}>
            <div
              className="success-pop"
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: theme.accentSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.accent,
              }}
            >
              <Icon name="check" size={42} stroke={3} />
            </div>
            <h2 style={{ fontSize: 21, marginTop: 20 }}>{kind === "red_packet" ? "Red packet sent!" : "Money sent"}</h2>
            <div className="muted mt-1">
              ${result.amount.toFixed(2)} {theme.sentLabel} to {recipient.full_name || recipient.phone}
            </div>
            <Link href="/wallet" className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
              Back to Wallet
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
