"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logAppVersion } from "@/lib/actions/settings";

export function VersionLogForm() {
  const router = useRouter();
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card card-pad mb-3">
      <div className="section-title" style={{ fontSize: 14 }}>
        Log a release
      </div>
      <label className="field-label mt-2">Version</label>
      <input className="field" placeholder="e.g. 1.4.0" value={version} onChange={(e) => setVersion(e.target.value)} />
      <label className="field-label mt-2">Notes</label>
      <input className="field" placeholder="What changed" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      <button
        className="btn btn-primary btn-block mt-3"
        disabled={!version.trim() || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await logAppVersion(version, notes);
              setVersion("");
              setNotes("");
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not log release.");
            }
          })
        }
      >
        {pending ? "Logging…" : "Log release"}
      </button>
    </div>
  );
}
