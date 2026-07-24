"use client";

import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { hexA } from "@/lib/data/catalog-helpers";
import { toggleApiModule } from "@/lib/actions/admin";
import type { ApiModuleSafe } from "@/types/database";

export function ApiModuleCard({ module }: { module: ApiModuleSafe }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row gap-2">
        <div className="ibadge round" style={{ width: 38, height: 38, background: hexA(module.color, 0.12), color: module.color }}>
          <Icon name={module.icon} size={18} stroke={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{module.name}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {module.provider} · {module.category}
          </div>
        </div>
      </div>
      <div className="row between" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <span className="muted" style={{ fontFamily: "monospace", fontSize: 11.5 }}>
          {module.key_last4 ? `••••${module.key_last4}` : "No key set"}
        </span>
        <div className="row gap-2">
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              textTransform: "uppercase",
              color: module.status === "active" ? "var(--success)" : "var(--text-faint)",
            }}
          >
            {module.status}
          </span>
          <div
            className={`toggle ${module.status === "active" ? "on" : ""} tap`}
            style={{ opacity: pending ? 0.6 : 1 }}
            onClick={() => startTransition(() => toggleApiModule(module.id, module.status))}
          >
            <div className="knob" />
          </div>
        </div>
      </div>
    </div>
  );
}
