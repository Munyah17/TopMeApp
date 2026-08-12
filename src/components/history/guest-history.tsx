"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { getGuestActivity, type GuestActivityEntry } from "@/lib/guest-activity";

export function GuestHistory() {
  const [activity, setActivity] = useState<GuestActivityEntry[] | null>(null);

  useEffect(() => {
    // localStorage isn't available during SSR — start from null so the
    // server-rendered markup has nothing to hydrate-mismatch against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivity(getGuestActivity());
  }, []);

  if (activity === null) return null;

  if (activity.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
        <div
          style={{
            width: 74,
            height: 74,
            borderRadius: 22,
            background: "var(--badge-neutral-bg)",
            color: "var(--text-faint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="clock" size={32} stroke={1.6} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>No history found</div>
        <div className="muted mt-1" style={{ maxWidth: 260 }}>
          Log in to access your full history, or check back here after a guest checkout on this device.
        </div>
        <Link href="/login" className="btn btn-primary mt-4" style={{ textDecoration: "none", padding: "0 20px", height: 44 }}>
          Log in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="muted mb-2" style={{ fontSize: 12.5 }}>
        Showing guest activity saved on this device.{" "}
        <Link href="/login" style={{ color: "var(--green-600)", fontWeight: 700 }}>
          Log in
        </Link>{" "}
        for your full history.
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {activity.map((t, i) => (
          <div
            key={t.reference}
            className="row gap-2"
            style={{ padding: "14px 16px", borderBottom: i < activity.length - 1 ? "1px solid var(--border)" : "none" }}
          >
            <div className="ibadge" style={{ background: "var(--badge-neutral-bg)", color: "var(--text-soft)" }}>
              <Icon name="wallet" size={20} stroke={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.serviceName}</div>
              <div className="muted">
                {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {t.reference}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>-{fmt(t.amount)}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--success)" }}>Success</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
