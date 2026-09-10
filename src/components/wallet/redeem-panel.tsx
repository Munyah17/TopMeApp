"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { redeemGiftVoucher } from "@/lib/actions/payments";

export function RedeemPanel() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<number | null>(null);

  function submit() {
    setErr(null);
    setOk(null);
    start(async () => {
      try {
        const v = await redeemGiftVoucher(code);
        setOk(v.amount);
        setCode("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't redeem that code.");
      }
    });
  }

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>Redeem a gift card</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
        Enter a TopMe gift code to add it to your balance. Gift balance is spent on TopMe services and can&apos;t be withdrawn to cash.
      </div>
      <div className="row gap-2 mt-2" style={{ alignItems: "stretch" }}>
        <input
          className="field"
          placeholder="GFT-123456"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")); setErr(null); setOk(null); }}
          onKeyDown={(e) => e.key === "Enter" && code.trim() && submit()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" style={{ padding: "0 16px", flexShrink: 0 }} disabled={pending || code.trim().length < 6} onClick={submit}>
          {pending ? "…" : "Redeem"}
        </button>
      </div>
      {ok !== null && (
        <div className="row gap-2 mt-2" style={{ color: "var(--success)", fontSize: 13, fontWeight: 600, alignItems: "center" }}>
          <Icon name="check" size={15} stroke={2.4} /> {fmt(ok)} added to your wallet.
        </div>
      )}
      {err && <div className="mt-2" style={{ color: "var(--error)", fontSize: 13 }}>{err}</div>}
    </div>
  );
}
