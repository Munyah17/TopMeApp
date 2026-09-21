"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteToSuperadmin } from "@/lib/actions/admin";

export function PromoteSuperadminForm({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn btn-secondary btn-block" style={{ color: "var(--adm-purple)" }} onClick={() => setOpen(true)}>
        Promote to Super Admin
      </button>
    );
  }

  return (
    <div className="card card-pad" style={{ borderColor: "var(--adm-purple)" }}>
      <div style={{ fontWeight: 700, color: "var(--adm-purple)" }}>Promote to Super Admin</div>
      <div className="muted mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
        This is the highest-privilege action in the system — full access to everything, no permission gate. Retype
        their email to confirm.
      </div>
      <input className="field mt-2" placeholder={email} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      <div className="row gap-2 mt-3">
        <button
          className="btn btn-primary"
          style={{ flex: 1, background: "var(--adm-purple)" }}
          disabled={pending || confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await promoteToSuperadmin(userId, confirmEmail);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not promote.");
              }
            })
          }
        >
          {pending ? "Promoting…" : "Confirm promotion"}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
