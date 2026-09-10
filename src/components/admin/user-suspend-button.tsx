"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toggleAccountSuspension } from "@/lib/actions/admin";

export function UserSuspendButton({ userId, suspended }: { userId: string; suspended: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button
        className="btn btn-secondary"
        style={{ height: 36, padding: "0 14px", fontSize: 13, color: suspended ? "var(--success)" : "var(--error)" }}
        disabled={pending}
        onClick={() => {
          if (!confirm(`${suspended ? "Reactivate" : "Suspend"} this account?`)) return;
          setErr(null);
          start(async () => {
            try {
              await toggleAccountSuspension(userId, suspended);
              router.refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Couldn't update this account.");
            }
          });
        }}
      >
        <Icon name={suspended ? "check" : "alert"} size={14} stroke={2.2} />
        {pending ? "…" : suspended ? "Reactivate account" : "Suspend account"}
      </button>
      {err && <div className="muted mt-1" style={{ color: "var(--error)", fontSize: 12 }}>{err}</div>}
    </>
  );
}
