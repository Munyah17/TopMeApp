"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/data/catalog-helpers";
import { getGuestActivity, type GuestActivityEntry } from "@/lib/guest-activity";

export function GuestRecent() {
  const [activity, setActivity] = useState<GuestActivityEntry[] | null>(null);

  useEffect(() => {
    // localStorage isn't available during SSR — this has to run after mount,
    // starting from null so the server-rendered markup has nothing to hydrate-mismatch against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivity(getGuestActivity());
  }, []);

  if (activity === null) return null;

  if (activity.length === 0) {
    return <div className="card card-pad muted">No recent activity on this device yet.</div>;
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {activity.map((t, i) => (
        <div
          key={t.reference}
          className="row gap-2"
          style={{
            padding: "14px 16px",
            borderBottom: i < activity.length - 1 ? "1px solid var(--border)" : "none",
          }}
        >
          <div className="ibadge" style={{ background: "var(--badge-neutral-bg)", color: "var(--text-soft)" }}>
            <Icon name="wallet" size={20} stroke={1.8} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.serviceName}</div>
            <div className="muted">
              {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>-{fmt(t.amount)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--success)" }}>Success</div>
          </div>
        </div>
      ))}
    </div>
  );
}
