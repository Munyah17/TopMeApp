"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

// Root error boundary — catches anything that throws while rendering a
// page instead of showing Next's default stack-trace screen to a real
// customer. Deliberately doesn't say what went wrong (that detail goes to
// the server console/logs, not a stranger's browser) and never implies
// money moved — "try again" is the honest instruction when we don't know.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[unhandled]", error);
  }, [error]);

  return (
    <div className="px" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", textAlign: "center" }}>
      <div className="ibadge round" style={{ width: 72, height: 72, background: "var(--error-bg)", color: "var(--error)" }}>
        <Icon name="alert" size={30} stroke={1.6} />
      </div>
      <h2 style={{ fontSize: 20, marginTop: 20 }}>Something went wrong</h2>
      <div className="muted mt-1" style={{ maxWidth: 300 }}>
        That&apos;s on us, not you. If you were in the middle of a payment, check your wallet or transaction
        history before trying again — nothing is charged twice.
      </div>
      <div className="row gap-2 mt-4">
        <button className="btn btn-secondary" onClick={() => reset()}>Try again</button>
        <Link href="/home" className="btn btn-primary" style={{ textDecoration: "none", padding: "0 20px" }}>
          Back to TopMe
        </Link>
      </div>
    </div>
  );
}
