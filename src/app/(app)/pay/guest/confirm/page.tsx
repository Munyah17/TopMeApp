"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { getGuestCheckoutStatus } from "@/lib/actions/guest-payments";
import { addGuestActivity } from "@/lib/guest-activity";

type GuestReceipt = {
  reference: string;
  amount: number;
  service_name: string;
  recipient: string;
  fulfillment_status: string;
  created_at: string;
};

function ConfirmContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference");
  const cancelled = searchParams.get("status") === "cancelled";

  const [status, setStatus] = useState<"checking" | "pending" | "completed" | "failed" | "not_found">(
    cancelled ? "failed" : "checking"
  );
  const [receipt, setReceipt] = useState<GuestReceipt | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!reference || cancelled) return;

    let stopped = false;
    async function check() {
      const res = await getGuestCheckoutStatus(reference!);
      if (stopped) return;
      if (res.status === "completed") {
        setReceipt(res.transaction);
        setStatus("completed");
        addGuestActivity({
          reference: res.transaction.reference,
          serviceName: res.transaction.service_name,
          amount: res.transaction.amount,
          recipient: res.transaction.recipient,
          createdAt: res.transaction.created_at,
        });
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (res.status === "failed" || res.status === "not_found") {
        setStatus(res.status);
        if (pollRef.current) clearInterval(pollRef.current);
      } else {
        setStatus("pending");
      }
    }
    check();
    pollRef.current = setInterval(check, 3000);
    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [reference, cancelled]);

  if (!reference) {
    return (
      <div className="mt-4" style={{ textAlign: "center", paddingTop: 60 }}>
        <div className="muted">Missing payment reference.</div>
        <Link href="/home" className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
          Back to Home
        </Link>
      </div>
    );
  }

  if (status === "checking" || status === "pending") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 480, textAlign: "center" }}>
        <div className="spinner-ring" />
        <div style={{ fontWeight: 700, marginTop: 24, fontSize: 15.5 }}>Confirming your payment…</div>
        <div className="muted mt-1">This usually takes a few seconds</div>
      </div>
    );
  }

  if (status === "completed" && receipt) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40, textAlign: "center" }}>
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
        <h2 style={{ fontSize: 21, marginTop: 20 }}>Payment successful</h2>
        <div className="muted mt-1">
          ${receipt.amount.toFixed(2)} paid for {receipt.service_name}
        </div>
        <div className="card" style={{ overflow: "hidden", width: "100%", marginTop: 24, textAlign: "left" }}>
          <div style={{ padding: "6px 18px" }}>
            <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="muted">Reference</span>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{receipt.reference}</span>
            </div>
            <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="muted">Recipient</span>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{receipt.recipient}</span>
            </div>
            <div className="row between" style={{ padding: "12px 0" }}>
              <span className="muted">Status</span>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                {receipt.fulfillment_status === "fulfilled" ? "Delivered" : "Processing"}
              </span>
            </div>
          </div>
        </div>
        <Link href="/home" className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
          Done
        </Link>
      </div>
    );
  }

  return (
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
      <h2 style={{ fontSize: 18, marginTop: 18 }}>
        {cancelled ? "Payment cancelled" : status === "not_found" ? "We couldn't find that payment" : "Payment didn't go through"}
      </h2>
      <div className="muted mt-1" style={{ maxWidth: 280 }}>
        {cancelled
          ? "You cancelled before completing payment. No charge was made."
          : "Nothing was charged. You can try again from the service page."}
      </div>
      <Link href="/services" className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
        Back to Services
      </Link>
    </div>
  );
}

export default function GuestConfirmPage() {
  return (
    <div className="px content-narrow" style={{ paddingTop: 6 }}>
      <Suspense>
        <ConfirmContent />
      </Suspense>
    </div>
  );
}
