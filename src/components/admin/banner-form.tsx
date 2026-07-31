"use client";

import { useState, useTransition } from "react";
import { createPromoBanner, updatePromoBanner, type PromoBannerInput } from "@/lib/actions/admin";
import type { PromoBanner } from "@/types/database";

function toInput(b: PromoBanner | undefined): PromoBannerInput {
  return {
    imageUrl: b?.image_url ?? "",
    linkUrl: b?.link_url ?? "",
    sortOrder: b?.sort_order ?? 0,
  };
}

export function BannerForm({ existing, onDone }: { existing?: PromoBanner; onDone: () => void }) {
  const [form, setForm] = useState<PromoBannerInput>(toInput(existing));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!existing;

  function set<K extends keyof PromoBannerInput>(key: K, value: PromoBannerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = form.imageUrl.trim().length > 0;

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title" style={{ fontSize: 14 }}>
        {isEdit ? "Edit banner" : "New banner"}
      </div>

      <div>
        <label className="field-label">Image URL</label>
        <input
          className="field"
          placeholder="https://…/banner.png"
          value={form.imageUrl}
          onChange={(e) => set("imageUrl", e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Link URL (optional — where tapping the banner goes)</label>
        <input
          className="field"
          placeholder="/services/gadgets"
          value={form.linkUrl}
          onChange={(e) => set("linkUrl", e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Sort order (lower shows first when multiple are active)</label>
        <input
          className="field"
          type="number"
          value={form.sortOrder}
          onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
        />
      </div>

      {form.imageUrl.trim() && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied banner URL
        <img src={form.imageUrl} alt="Banner preview" style={{ width: "100%", borderRadius: 12, maxHeight: 180, objectFit: "cover" }} />
      )}

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
                if (isEdit) await updatePromoBanner(existing!.id, form);
                else await createPromoBanner(form);
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save banner.");
              }
            });
          }}
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create banner"}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
