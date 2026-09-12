"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { subscribeToPush } from "@/lib/actions/push";

const DISMISS_KEY = "topme-push-dismissed";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Small, dismissible banner offering push notifications for new messages
// and payments — appears once per browser (until enabled or dismissed),
// only when the browser actually supports it and permission hasn't
// already been decided one way or the other.
export function PushSubscribeButton() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return;
    if (Notification.permission !== "default") return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private browsing or storage blocked — treat as not dismissed.
    }
    if (!dismissed) setVisible(true);
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Push notifications aren't set up yet.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = subscription.toJSON();
      await subscribeToPush({ endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } });
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do if storage is unavailable — it'll just ask again next visit.
    }
  }

  if (!visible) return null;

  return (
    <div className="card card-pad mb-2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div className="ibadge round" style={{ width: 34, height: 34, background: "var(--green-50)", color: "var(--green-600)", flexShrink: 0 }}>
        <Icon name="bell" size={16} stroke={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Get notified</div>
        <div className="muted" style={{ fontSize: 11.5 }}>New messages and payments, even when TopMe isn&apos;t open.</div>
        {error && <div style={{ color: "var(--error)", fontSize: 11, marginTop: 2 }}>{error}</div>}
      </div>
      <button className="btn btn-primary" style={{ height: 32, padding: "0 12px", fontSize: 12, flexShrink: 0 }} disabled={busy} onClick={enable}>
        {busy ? "…" : "Enable"}
      </button>
      <button className="btn btn-ghost" style={{ height: 32, padding: "0 8px", fontSize: 12, flexShrink: 0 }} onClick={dismiss} aria-label="Dismiss">
        <Icon name="x" size={14} stroke={2.2} />
      </button>
    </div>
  );
}
