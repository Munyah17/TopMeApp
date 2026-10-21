"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { payService } from "@/lib/actions/payments";
import type { Service, Network } from "@/types/database";

type Step = "network" | "phone" | "amount" | "processing" | "success" | "error";

export function SimpleAirtimeFlow({
  service,
  networks,
}: {
  service: Service;
  networks: Network[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("network");
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchWalletBalance = async () => {
    try {
      const res = await fetch("/api/wallet/balance");
      const data = await res.json();
      setWalletBalance(data.balance ?? 0);
    } catch {
      setWalletBalance(0);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await payService({
        serviceId: service.id,
        serviceName: service.name,
        amount: parseFloat(amount),
        recipient: phone,
        networkId: networkId!,
      });
      setStep("success");
      await fetchWalletBalance();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Payment failed");
      setStep("error");
    } finally {
      setBusy(false);
    }
  };

  const network = networks.find((n) => n.id === networkId);
  const total = parseFloat(amount) || 0;
  const insufficient = walletBalance !== null && total > walletBalance;

  return (
    <div className="px content-narrow">
      {step === "network" && (
        <>
          <h2 style={{ fontSize: 20, marginTop: 6 }}>Choose network</h2>
          <div className="muted mb-3">Which network is this for?</div>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {networks.map((n) => (
              <button
                key={n.id}
                className={`card card-pad ${networkId === n.id ? "card-selected" : ""}`}
                onClick={() => setNetworkId(n.id)}
                style={{ flex: 1, minWidth: 120, textAlign: "center" }}
              >
                {n.name}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-block mt-4" disabled={!networkId} onClick={() => setStep("phone")}>
            Continue
          </button>
        </>
      )}

      {step === "phone" && (
        <>
          <h2 style={{ fontSize: 20, marginTop: 6 }}>Phone number</h2>
          <div className="muted mb-3">Enter the phone number to top up</div>
          <label className="field-label">Phone Number</label>
          <input className="field" placeholder="077 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn btn-primary btn-block mt-4" disabled={phone.trim().length < 3} onClick={() => setStep("amount")}>
            Continue
          </button>
        </>
      )}

      {step === "amount" && (
        <>
          <h2 style={{ fontSize: 20, marginTop: 6 }}>Amount</h2>
          <div className="muted mb-3">How much airtime?</div>
          <label className="field-label">Amount (USD)</label>
          <input
            className="field"
            type="number"
            placeholder="1.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {walletBalance !== null && (
            <div className="muted mt-2" style={{ fontSize: 13 }}>
              Wallet balance: ${walletBalance.toFixed(2)}
            </div>
          )}
          {insufficient && (
            <div className="error mt-2" style={{ fontSize: 13 }}>
              Insufficient wallet balance
            </div>
          )}
          <button
            className="btn btn-primary btn-block mt-4"
            disabled={!amount || parseFloat(amount) <= 0 || insufficient || busy}
            onClick={handleSubmit}
          >
            {busy ? "Processing..." : "Pay with Wallet"}
          </button>
        </>
      )}

      {step === "processing" && (
        <div style={{ textAlign: "center", paddingTop: 60 }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <h2 style={{ fontSize: 18, marginTop: 18 }}>Processing payment</h2>
          <div className="muted mt-1">Please wait...</div>
        </div>
      )}

      {step === "success" && (
        <div style={{ textAlign: "center", paddingTop: 60 }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h2 style={{ fontSize: 18, marginTop: 18 }}>Payment successful</h2>
          <div className="muted mt-1">
            ${total.toFixed(2)} airtime sent to {phone}
          </div>
          <button className="btn btn-primary btn-block mt-4" onClick={() => router.push("/home")}>
            Done
          </button>
        </div>
      )}

      {step === "error" && (
        <div style={{ textAlign: "center", paddingTop: 60 }}>
          <div style={{ fontSize: 40 }}>❌</div>
          <h2 style={{ fontSize: 18, marginTop: 18 }}>Payment failed</h2>
          <div className="muted mt-1">{errorMsg || "Something went wrong"}</div>
          <button className="btn btn-primary btn-block mt-4" onClick={() => setStep("amount")}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
