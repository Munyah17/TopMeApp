"use client";

import { useState, useTransition } from "react";
import { createService, updateService, type ServiceInput } from "@/lib/actions/admin";
import type { Service, ServiceCategory } from "@/types/database";

const AMOUNT_MODES: ServiceInput["amountMode"][] = ["chips", "bundles", "packages", "outstanding"];

function toInput(s: Service | undefined): ServiceInput {
  return {
    id: s?.id ?? "",
    categoryId: s?.category_id ?? "",
    name: s?.name ?? "",
    description: s?.description ?? "",
    icon: s?.icon ?? "phone",
    providerLabel: s?.provider_label ?? "",
    logoUrl: s?.logo_url ?? "",
    color: s?.color ?? "#00C853",
    amountMode: s?.amount_mode ?? "chips",
    chips: s?.chips ?? [1, 2, 5, 10],
    outstanding: s?.outstanding ?? null,
    needsNetwork: s?.needs_network ?? false,
    idLabel: s?.id_label ?? "Phone Number",
    idPlaceholder: s?.id_placeholder ?? "077 123 4567",
    extraFieldLabel: s?.extra_field_label ?? "",
    extraFieldPlaceholder: s?.extra_field_placeholder ?? "",
    isGift: s?.is_gift ?? false,
    validateMsg: s?.validate_msg ?? "Validating",
    mockName: s?.mock_name ?? "",
    mockSub: s?.mock_sub ?? "",
    sortOrder: s?.sort_order ?? 0,
    costPercentage: s?.cost_percentage ?? 0,
  };
}

export function ServiceForm({
  categories,
  existing,
  onDone,
}: {
  categories: ServiceCategory[];
  existing?: Service;
  onDone: () => void;
}) {
  const [form, setForm] = useState<ServiceInput>(toInput(existing));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!existing;

  function set<K extends keyof ServiceInput>(key: K, value: ServiceInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = form.id && form.categoryId && form.name && form.idLabel;

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title" style={{ fontSize: 14 }}>
        {isEdit ? `Edit ${existing!.name}` : "New service"}
      </div>

      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Service ID (slug)</label>
          <input className="field" placeholder="e.g. airtime" value={form.id} disabled={isEdit} onChange={(e) => set("id", e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Category</label>
          <select className="field" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label">Name</label>
        <input className="field" placeholder="e.g. Airtime Top Up" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div>
        <label className="field-label">Description</label>
        <input className="field" placeholder="Short description shown on the card" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Icon (see src/components/icons.tsx)</label>
          <input className="field" placeholder="phone" value={form.icon} onChange={(e) => set("icon", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Provider label</label>
          <input className="field" placeholder="e.g. Econet Wireless" value={form.providerLabel} onChange={(e) => set("providerLabel", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Color (fallback if no logo)</label>
          <input className="field" placeholder="#00C853" value={form.color} onChange={(e) => set("color", e.target.value)} />
        </div>
      </div>

      <div>
        <label className="field-label">Logo image URL (shown on the customer catalog card)</label>
        <input className="field" placeholder="https://…/econet-logo.png" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
      </div>

      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Amount mode</label>
          <select className="field" value={form.amountMode} onChange={(e) => set("amountMode", e.target.value as ServiceInput["amountMode"])}>
            {AMOUNT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {form.amountMode === "chips" && (
          <div style={{ flex: 2 }}>
            <label className="field-label">Chip amounts (comma-separated)</label>
            <input
              className="field"
              placeholder="1,2,5,10,20"
              value={form.chips.join(",")}
              onChange={(e) => set("chips", e.target.value.split(",").map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v)))}
            />
          </div>
        )}
        {form.amountMode === "outstanding" && (
          <div style={{ flex: 2 }}>
            <label className="field-label">Outstanding amount</label>
            <input
              className="field"
              type="number"
              placeholder="145"
              value={form.outstanding ?? ""}
              onChange={(e) => set("outstanding", e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
        )}
      </div>

      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">{"Recipient field label (e.g. \"Meter Number\")"}</label>
          <input className="field" value={form.idLabel} onChange={(e) => set("idLabel", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Recipient field placeholder</label>
          <input className="field" value={form.idPlaceholder} onChange={(e) => set("idPlaceholder", e.target.value)} />
        </div>
      </div>

      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Extra field label (optional)</label>
          <input className="field" placeholder="e.g. Institution" value={form.extraFieldLabel} onChange={(e) => set("extraFieldLabel", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Extra field placeholder</label>
          <input className="field" value={form.extraFieldPlaceholder} onChange={(e) => set("extraFieldPlaceholder", e.target.value)} />
        </div>
      </div>

      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Mock recipient name (shown after validation)</label>
          <input className="field" value={form.mockName} onChange={(e) => set("mockName", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Mock recipient sub-label</label>
          <input className="field" value={form.mockSub} onChange={(e) => set("mockSub", e.target.value)} />
        </div>
      </div>

      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Provider cost % (what the fulfilling provider keeps)</label>
          <input
            className="field"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={form.costPercentage}
            onChange={(e) => set("costPercentage", parseFloat(e.target.value) || 0)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Sort order</label>
          <input className="field" type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)} />
        </div>
      </div>

      <div className="row gap-3">
        <label className="row gap-2" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={form.needsNetwork} onChange={(e) => set("needsNetwork", e.target.checked)} />
          <span className="muted">Needs network selection</span>
        </label>
        <label className="row gap-2" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={form.isGift} onChange={(e) => set("isGift", e.target.checked)} />
          <span className="muted">Is a gift voucher flow</span>
        </label>
      </div>

      {error && (
        <div className="muted" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      <div className="row gap-2">
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!canSave || pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                if (isEdit) await updateService(existing!.id, form);
                else await createService(form);
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save service.");
              }
            });
          }}
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create service"}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
