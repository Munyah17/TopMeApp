"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFeatureFlag } from "@/lib/actions/settings";

interface FlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
}

export function FlagsClient({ flags }: { flags: FlagRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {flags.map((f) => (
        <div key={f.key} className="card card-pad mb-2 row gap-2" style={{ alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{f.key}</div>
            {f.description && <div className="muted mt-1" style={{ fontSize: 12 }}>{f.description}</div>}
          </div>
          <div
            className={`toggle ${f.enabled ? "on" : ""} tap`}
            style={{ opacity: pending ? 0.6 : 1 }}
            onClick={() => startTransition(async () => { await toggleFeatureFlag(f.key, !f.enabled); router.refresh(); })}
          >
            <div className="knob" />
          </div>
        </div>
      ))}
    </div>
  );
}
