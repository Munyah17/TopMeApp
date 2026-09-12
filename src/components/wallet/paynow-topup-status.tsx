"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkTopupPaymentNow, checkTopupStatus } from "@/lib/actions/wallet";

export function PaynowTopupStatus({ reference, providerLabel = "Paynow" }: { reference: string; providerLabel?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"pending" | "timeout" | "completed" | "failed">("pending");
  const [checkingNow, setCheckingNow] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkRef = useRef<() => Promise<void>>(async () => {});

  // Give up auto-polling after ~2 minutes instead of spinning forever if the
  // transaction genuinely never resolves — "Check Payment" stays available.
  // Also actively asks Paynow directly (not just our own DB, which depends
  // on their independently-unreliable webhook) on load and periodically
  // after, so a cancelled/declined payment resolves in seconds instead of
  // only ever updating once someone manually taps Check Payment.
  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    async function check() {
      attempts += 1;
      if (attempts === 1 || attempts % 4 === 0) {
        try {
          await checkTopupPaymentNow(reference);
        } catch {
          // best-effort accelerator — fall through to the passive read below
        }
      }
      if (stopped) return;

      const s = await checkTopupStatus(reference);
      if (stopped) return;
      if (s === "completed") {
        setStatus("completed");
        if (pollRef.current) clearInterval(pollRef.current);
        router.refresh();
      } else if (s === "failed") {
        setStatus("failed");
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (attempts >= MAX_ATTEMPTS) {
        setStatus("timeout");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }
    checkRef.current = check;
    check();
    pollRef.current = setInterval(check, 3000);
    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [reference, router]);

  async function handleCheckPayment() {
    setCheckingNow(true);
    setCheckError(null);
    try {
      const result = await checkTopupPaymentNow(reference);
      if (!result.checked && result.error) setCheckError(result.error);
      await checkRef.current();
    } finally {
      setCheckingNow(false);
    }
  }

  if (status === "completed") {
    return (
      <div className="card card-pad mb-3" style={{ borderColor: "var(--success)" }}>
        <div style={{ fontWeight: 700, color: "var(--success)" }}>Top up successful — your balance is updated below.</div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="card card-pad mb-3" style={{ borderColor: "var(--error)" }}>
        <div style={{ fontWeight: 700, color: "var(--error)" }}>This {providerLabel} payment didn&apos;t go through. No funds were added.</div>
      </div>
    );
  }

  if (status === "timeout") {
    return (
      <div className="card card-pad mb-3" style={{ borderColor: "var(--warning)" }}>
        <div style={{ fontWeight: 700, color: "var(--warning)" }}>This is taking longer than expected.</div>
        <div className="muted mt-1">
          We&apos;ve stopped checking automatically. If {providerLabel} already took payment, tap below to pick it up — otherwise
          contact support with reference <strong>{reference}</strong>.
        </div>
        <button className="btn btn-secondary btn-block mt-2" disabled={checkingNow} onClick={handleCheckPayment}>
          {checkingNow ? "Checking…" : "Check Payment"}
        </button>
        {checkError && (
          <div className="muted mt-2" style={{ color: "var(--error)" }}>
            {checkError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card card-pad mb-3">
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <div className="spinner-ring" style={{ width: 22, height: 22 }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>Confirming your {providerLabel} top up…</div>
      </div>
      <div className="muted mt-1">{providerLabel} can take a moment. If it&apos;s taking too long, check directly.</div>
      <button className="btn btn-secondary btn-block mt-2" disabled={checkingNow} onClick={handleCheckPayment}>
        {checkingNow ? "Checking…" : "Check Payment"}
      </button>
      {checkError && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {checkError}
        </div>
      )}
    </div>
  );
}
