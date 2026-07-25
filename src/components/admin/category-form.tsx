"use client";

import { useState, useTransition } from "react";
import { createCategory, updateCategory, type CategoryInput } from "@/lib/actions/admin";
import type { ServiceCategory } from "@/types/database";

function toInput(c: ServiceCategory | undefined): CategoryInput {
  return {
    id: c?.id ?? "",
    name: c?.name ?? "",
    icon: c?.icon ?? "grid",
    color: c?.color ?? "#00C853",
    bg: c?.bg ?? "#E9FBF0",
    description: c?.description ?? "",
    sortOrder: c?.sort_order ?? 0,
  };
}

export function CategoryForm({ existing, onDone }: { existing?: ServiceCategory; onDone: () => void }) {
  const [form, setForm] = useState<CategoryInput>(toInput(existing));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!existing;

  function set<K extends keyof CategoryInput>(key: K, value: CategoryInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title" style={{ fontSize: 14 }}>
        {isEdit ? `Edit ${existing!.name}` : "New category"}
      </div>
      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Category ID (slug)</label>
          <input className="field" placeholder="e.g. airtimedata" value={form.id} disabled={isEdit} onChange={(e) => set("id", e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Name</label>
          <input className="field" placeholder="e.g. Airtime & Data" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field-label">Description</label>
        <input className="field" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="row gap-2">
        <div style={{ flex: 1 }}>
          <label className="field-label">Icon</label>
          <input className="field" value={form.icon} onChange={(e) => set("icon", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Color</label>
          <input className="field" value={form.color} onChange={(e) => set("color", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Background</label>
          <input className="field" value={form.bg} onChange={(e) => set("bg", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Sort order</label>
          <input className="field" type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)} />
        </div>
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
          disabled={!form.id || !form.name || pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                if (isEdit) await updateCategory(existing!.id, form);
                else await createCategory(form);
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save category.");
              }
            });
          }}
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create category"}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
