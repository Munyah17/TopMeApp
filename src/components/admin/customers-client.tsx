"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toggleAccountSuspension } from "@/lib/actions/admin";
import type { Profile } from "@/types/database";

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin", customer: "Customer" };

function CustomerRow({ customer }: { customer: Profile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isSuperadmin = customer.role === "superadmin";

  return (
    <div className="row gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", opacity: customer.is_suspended ? 0.6 : 1 }}>
      <div className="ibadge round" style={{ width: 36, height: 36, background: "#F1F4F9", color: "var(--text-soft)", fontSize: 12, fontWeight: 700 }}>
        {(customer.full_name || customer.phone || customer.email || "?").slice(0, 2).toUpperCase()}
      </div>
      <Link href={`/admin/users/${customer.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{customer.full_name || "Unnamed"}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {customer.phone || "No phone"} · {customer.email || "No email"} · {ROLE_LABEL[customer.role]}
        </div>
      </Link>
      {error && (
        <div className="muted" style={{ color: "var(--error)", fontSize: 11 }}>
          {error}
        </div>
      )}
      {customer.is_suspended && (
        <span style={{ background: "#FDECEC", color: "var(--error)", fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 8 }}>
          Suspended
        </span>
      )}
      {isSuperadmin ? (
        <span className="muted" style={{ fontSize: 11.5 }}>
          Protected
        </span>
      ) : (
        <button
          className="btn btn-ghost"
          style={{ height: 32, padding: "0 12px", fontSize: 12, color: customer.is_suspended ? "var(--success)" : "var(--error)" }}
          disabled={pending}
          onClick={() => {
            if (!confirm(`${customer.is_suspended ? "Reactivate" : "Suspend"} this account?`)) return;
            setError(null);
            startTransition(async () => {
              try {
                await toggleAccountSuspension(customer.id, customer.is_suspended);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not update this account.");
              }
            });
          }}
        >
          {pending ? "Working…" : customer.is_suspended ? "Reactivate" : "Suspend"}
        </button>
      )}
    </div>
  );
}

export function CustomersClient({ customers }: { customers: Profile[] }) {
  if (customers.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center" }}>
        <Icon name="users" size={28} stroke={1.6} className="text-faint" />
        <div className="muted mt-2">No customers match that search.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {customers.map((c) => (
        <CustomerRow key={c.id} customer={c} />
      ))}
    </div>
  );
}
