"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frameId: number;
    let stopped = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        tick();
      } catch {
        setError("Couldn't access the camera. Check your browser permissions and try again.");
      }
    }

    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data.startsWith("TOPME-PAY:")) {
            setScanning(false);
            stopped = true;
            stream?.getTracks().forEach((t) => t.stop());
            const phone = code.data.slice("TOPME-PAY:".length);
            router.replace(`/pay/send?to=${encodeURIComponent(phone)}`);
            return;
          }
        }
      }
      frameId = requestAnimationFrame(tick);
    }

    start();
    return () => {
      stopped = true;
      if (frameId) cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="px content-narrow" style={{ paddingTop: 6 }}>
      <div className="topbar">
        <Link href="/wallet" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15.5 }}>Scan to Pay</div>
      </div>

      {error ? (
        <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, textAlign: "center" }}>
          <div style={{ width: 84, height: 84, borderRadius: 26, background: "#FDECEC", color: "var(--error)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="alert" size={38} stroke={1.6} />
          </div>
          <h2 style={{ fontSize: 18, marginTop: 18 }}>Camera unavailable</h2>
          <div className="muted mt-1" style={{ maxWidth: 260 }}>{error}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 10 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 340, aspectRatio: "1", borderRadius: 20, overflow: "hidden", background: "#000" }}>
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div
              style={{
                position: "absolute",
                inset: 24,
                border: "3px solid rgba(255,255,255,0.85)",
                borderRadius: 20,
                boxShadow: "0 0 0 999px rgba(0,0,0,0.25)",
              }}
            />
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div className="muted mt-3" style={{ textAlign: "center" }}>
            {scanning ? "Point your camera at a TopMe Pay Code" : "Code found, opening…"}
          </div>
        </div>
      )}
    </div>
  );
}
