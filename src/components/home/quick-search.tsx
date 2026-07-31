"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import type { Service } from "@/types/database";

export function QuickSearch({ services }: { services: Service[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return services.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, services]);

  const showDropdown = focused && query.trim().length > 0;

  return (
    <div style={{ position: "relative" }}>
      <label className="field-label mt-3">Search service</label>
      <div className="header-search" style={{ maxWidth: "none", cursor: "text" }}>
        <Icon name="search" size={17} stroke={2} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search services, ZESA, DStv…"
          style={{ border: "none", outline: "none", background: "transparent", flex: 1, font: "inherit", color: "var(--text)" }}
        />
      </div>
      {showDropdown && (
        <div className="quicksearch-dropdown">
          {results.length === 0 ? (
            <div className="muted" style={{ padding: "12px 16px" }}>
              No services found.
            </div>
          ) : (
            results.map((s) => (
              <Link key={s.id} href={`/pay/${s.id}`} className="quicksearch-item">
                <Icon name={s.icon} size={16} stroke={1.8} />
                <span>{s.name}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
