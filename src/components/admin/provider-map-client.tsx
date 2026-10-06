"use client";

import { useState, useTransition } from "react";
import { createProviderMapEntry, deleteProviderMapEntry, updateProviderMapEntry } from "@/lib/actions/admin";

export interface ProviderMapRow {
  id: string;
  service_id: string;
  provider: string;
  provider_product_id: string;
  provider_sku: string;
  network_id: string;
  cost_amount: number | null;
  commission_pct: number | null;
  margin_pct: number | null;
  enabled: boolean;
  priority: number;
  notes: string | null;
}

export function ProviderMapClient({ rows, serviceIds }: { rows: ProviderMapRow[]; serviceIds: string[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function run(work: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Update failed."); }
    });
  }

  return (
    <div className="card card-pad mb-3">
      <div className="row between" style={{ alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Fulfillment Routing</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Provider priority, margins and manual service mappings. Higher priority wins when providers are healthy.</div>
        </div>
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: "7px 12px" }} onClick={() => setAdding((v) => !v)}>Add mapping</button>
      </div>

      {adding && (
        <form
          className="card card-pad mt-3"
          style={{ background: "var(--surface-2)" }}
          action={(fd) => run(async () => {
            await createProviderMapEntry({
              service_id: String(fd.get("service_id") || ""),
              provider: String(fd.get("provider") || ""),
              provider_product_id: String(fd.get("provider_product_id") || ""),
              provider_sku: String(fd.get("provider_sku") || ""),
              network_id: String(fd.get("network_id") || ""),
              priority: Number(fd.get("priority") || 0),
              margin_pct: fd.get("margin_pct") ? Number(fd.get("margin_pct")) : null,
              notes: String(fd.get("notes") || ""),
            });
            setAdding(false);
          })}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 8 }}>
            <select name="service_id" className="field" required defaultValue=""><option value="" disabled>Service</option>{serviceIds.map((id) => <option key={id}>{id}</option>)}</select>
            <input name="provider" className="field" required placeholder="Provider (billpay)" />
            <input name="provider_product_id" className="field" placeholder="Biller / product ID" />
            <input name="provider_sku" className="field" placeholder="SKU" />
            <input name="network_id" className="field" placeholder="Network (optional)" />
            <input name="priority" className="field" type="number" placeholder="Priority" defaultValue="0" />
            <input name="margin_pct" className="field" type="number" step="0.01" placeholder="Margin %" />
            <input name="notes" className="field" placeholder="Notes" />
          </div>
          <button disabled={pending} className="btn btn-primary mt-2" style={{ fontSize: 12 }}>Save mapping</button>
        </form>
      )}

      {error && <div className="muted mt-2" style={{ color: "var(--error)" }}>{error}</div>}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}><th style={{ padding: 8 }}>Service</th><th>Provider</th><th>Product / SKU</th><th>Network</th><th>Priority</th><th>Margin</th><th>Enabled</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: 8, fontWeight: 700 }}>{r.service_id}</td>
                <td>{r.provider}</td>
                <td>{[r.provider_product_id, r.provider_sku].filter(Boolean).join(" / ") || "—"}</td>
                <td>{r.network_id || "—"}</td>
                <td><input aria-label="Priority" className="field" style={{ width: 65, height: 34 }} type="number" defaultValue={r.priority} onBlur={(e) => run(() => updateProviderMapEntry(r.id, { priority: Number(e.target.value) }))} /></td>
                <td><input aria-label="Margin percentage" className="field" style={{ width: 75, height: 34 }} type="number" step="0.01" defaultValue={r.margin_pct ?? ""} placeholder="—" onBlur={(e) => run(() => updateProviderMapEntry(r.id, { margin_pct: e.target.value ? Number(e.target.value) : null }))} /></td>
                <td><button disabled={pending} className={`status-badge ${r.enabled ? "success" : "error"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => run(() => updateProviderMapEntry(r.id, { enabled: !r.enabled }))}>{r.enabled ? "On" : "Off"}</button></td>
                <td><button disabled={pending} className="btn btn-ghost" style={{ color: "var(--error)", padding: 6, fontSize: 11 }} onClick={() => { if (confirm("Delete this provider mapping?")) run(() => deleteProviderMapEntry(r.id)); }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="muted" style={{ padding: 14, textAlign: "center" }}>No provider mappings yet.</div>}
      </div>
    </div>
  );
}
