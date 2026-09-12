"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomerAccount } from "@/lib/actions/admin";

// Guarded the same way promoting to Super Admin is — retype the email to
// confirm — plus the server side refuses outright if the account still has
// money on it. See deleteCustomerAccount in src/lib/actions/admin.ts for
// why: this permanently erases the account's whole financial history, not
// just its login.
export function UserDeleteButton({ userId, email, basePath }: { userId: string; email: string; basePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn btn-secondary btn-block" style={{ color: "var(--error)" }} onClick={() => setOpen(true)}>
        Delete account
      </button>
    );
  }

  return (
    <div className="card card-pad" style={{ borderColor: "var(--error)" }}>
      <div style={{ fontWeight: 700, color: "var(--error)" }}>Delete this account</div>
      <div className="muted mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Permanent — their login, wallet, ledger and transaction history are all removed, not just hidden. Their
        wallet balance must be $0 first. Retype their email to confirm.
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
          style={{ flex: 1, background: "var(--error)" }}
          disabled={pending || confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await deleteCustomerAccount(userId, confirmEmail);
                router.push(`${basePath}/users`);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not delete this account.");
              }
            })
          }
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
