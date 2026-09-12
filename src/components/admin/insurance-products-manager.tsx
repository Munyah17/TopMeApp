"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { updateInsuranceProduct } from "@/lib/actions/admin";
import { displayName, displayPremium, type InsuranceProduct } from "@/lib/insurance/types";

const PROVIDER_LABEL: Record<string, string> = { tariqify: "Motions Microinsurance", enpassent: "EnpassentIMS" };

function InsuranceProductRow({ product }: { product: InsuranceProduct }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [displayNameVal, setDisplayNameVal] = useState(product.display_name ?? "");
  const [displayDesc, setDisplayDesc] = useState(product.display_description ?? "");
  const [markup, setMarkup] = useState(String(product.markup_percent));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateInsuranceProduct(product.id, {
          displayName: displayNameVal,
          displayDescription: displayDesc,
          markupPercent: parseFloat(markup) || 0,
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function toggle(field: "isActive" | "isPurchasable", value: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await updateInsuranceProduct(product.id, { [field]: value });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update this.");
      }
    });
  }

  if (editing) {
    return (
      <div className="card card-pad mb-2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="section-title" style={{ fontSize: 13.5 }}>{displayName(product)}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>Underwriter&apos;s own name/description: &quot;{product.name}&quot;. Leave blank to just show that.</div>
        <div>
          <label className="field-label">Display name override</label>
          <input className="field" value={displayNameVal} onChange={(e) => setDisplayNameVal(e.target.value)} placeholder={product.name} />
        </div>
        <div>
          <label className="field-label">Display description override</label>
          <input className="field" value={displayDesc} onChange={(e) => setDisplayDesc(e.target.value)} placeholder={product.description ?? ""} />
        </div>
        <div>
          <label className="field-label">Markup % (added on top of the underwriter&apos;s premium)</label>
          <input className="field" type="number" step="0.5" value={markup} onChange={(e) => setMarkup(e.target.value)} />
        </div>
        {error && <div style={{ color: "var(--error)", fontSize: 12 }}>{error}</div>}
        <div className="row gap-2">
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="row gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", opacity: product.is_active ? 1 : 0.5 }}>
      <div className="ibadge round" style={{ width: 36, height: 36, background: "var(--green-50)", color: "var(--green-600)", flexShrink: 0 }}>
        <Icon name="shield" size={16} stroke={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(product)}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {PROVIDER_LABEL[product.provider] ?? product.provider} · ${displayPremium(product).toFixed(2)}/mo · {product.markup_percent}% markup
        </div>
      </div>
      {!product.is_purchasable && (
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--warning)", background: "#FEF6E7", padding: "3px 8px", borderRadius: 7, flexShrink: 0 }}>
          NOT PURCHASABLE
        </span>
      )}
      {error && <div style={{ color: "var(--error)", fontSize: 11 }}>{error}</div>}
      <div
        className={`toggle ${product.is_active ? "on" : ""} tap`}
        title={product.is_active ? "Active: shown in the Insurance catalog" : "Inactive: hidden from customers"}
        onClick={() => toggle("isActive", !product.is_active)}
      >
        <div className="knob" />
      </div>
      <button className="btn btn-ghost" style={{ height: 32, padding: "0 10px", fontSize: 12 }} disabled={pending} onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  );
}

export function InsuranceProductsManager({ products }: { products: InsuranceProduct[] }) {
  if (products.length === 0) return null;
  return (
    <>
      <div className="section-title mt-3 mb-2">Insurance products</div>
      <div className="muted mb-2" style={{ fontSize: 12 }}>
        Synced from each underwriter — you can't add or remove a product here, only override how it's shown
        and priced, or take it off the customer catalog.
      </div>
      <div className="card mb-3" style={{ overflow: "hidden" }}>
        {products.map((p) => (
          <InsuranceProductRow key={p.id} product={p} />
        ))}
      </div>
    </>
  );
}
