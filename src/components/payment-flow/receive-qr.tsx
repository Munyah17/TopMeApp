"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Icon } from "@/components/icons";

export function ReceiveQr({ phone, name }: { phone: string; name: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, `TOPME-PAY:${phone}`, { width: 220, margin: 1 }, () => {});
    }
  }, [phone]);

  return (
    <div className="px content-narrow" style={{ paddingTop: 6 }}>
      <div className="topbar">
        <Link href="/wallet" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>Receive Money</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 10 }}>
        <div className="receipt-card" style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{name || "Your TopMe Pay Code"}</div>
          <div className="muted mb-2">Anyone with TopMe can scan this to send you money</div>
          <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 14px" }}>
            <canvas ref={canvasRef} width={220} height={220} />
          </div>
          <div className="dashed" />
          <div style={{ padding: "10px 0" }}>
            <div className="muted">Your number</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{phone}</div>
          </div>
        </div>

        <Link href="/pay/scan" className="btn btn-primary btn-block mt-3" style={{ textDecoration: "none" }}>
          <Icon name="scan" size={17} stroke={2} /> Scan to Pay Someone
        </Link>
        <Link href="/wallet" className="btn btn-ghost btn-block" style={{ textDecoration: "none" }}>
          Done
        </Link>
      </div>
    </div>
  );
}
