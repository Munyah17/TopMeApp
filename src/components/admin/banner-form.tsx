"use client";

import { useState, useTransition } from "react";
import { createPromoBanner, updatePromoBanner, type PromoBannerInput } from "@/lib/actions/admin";
import type { PromoBanner } from "@/types/database";

function toInput(b: PromoBanner | undefined): PromoBannerInput {
  return {
    kind: b?.kind ?? "image",
    imageUrl: b?.image_url ?? "",
    linkUrl: b?.link_url ?? "",
    title: b?.title ?? "",
    body: b?.body ?? "",
    audience: b?.audience ?? "customers",
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

  const canSave = form.kind === "image" ? form.imageUrl.trim().length > 0 : form.title.trim().length > 0 && form.body.trim().length > 0;

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title" style={{ fontSize: 14 }}>
        {isEdit ? "Edit" : "New"} {form.kind === "image" ? "banner" : "announcement"}
      </div>

      {!isEdit && (
        <div className="row gap-2">
          <div className={`chip tap ${form.kind === "image" ? "selected" : ""}`} style={{ flex: 1, textAlign: "center" }} onClick={() => set("kind", "image")}>
            Image Banner
          </div>
          <div className={`chip tap ${form.kind === "announcement" ? "selected" : ""}`} style={{ flex: 1, textAlign: "center" }} onClick={() => set("kind", "announcement")}>
            Text Announcement
          </div>
        </div>
      )}

      {form.kind === "image" ? (
        <>
          <div>
            <label className="field-label">Image URL</label>
            <input className="field" placeholder="https://…/banner.png" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Link URL (where tapping the banner goes, optional)</label>
            <input className="field" placeholder="/services/gadgets" value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} />
          </div>
          {form.imageUrl.trim() && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied banner URL
            <img src={form.imageUrl} alt="Banner preview" style={{ width: "100%", borderRadius: 12, maxHeight: 180, objectFit: "cover" }} />
          )}
        </>
      ) : (
        <>
          <div>
            <label className="field-label">Title</label>
            <input className="field" placeholder="e.g. Scheduled maintenance tonight" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Body</label>
            <input className="field" placeholder="Short message" value={form.body} onChange={(e) => set("body", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Audience</label>
            <div className="row gap-2">
              {(["customers", "staff", "all"] as const).map((a) => (
                <div key={a} className={`chip tap ${form.audience === a ? "selected" : ""}`} style={{ flex: 1, textAlign: "center", textTransform: "capitalize" }} onClick={() => set("audience", a)}>
                  {a}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label className="field-label">Sort order (lower shows first when multiple are active)</label>
        <input className="field" type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)} />
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
                if (isEdit) await updatePromoBanner(existing!.id, form);
                else await createPromoBanner(form);
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save.");
              }
            });
          }}
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : `Create ${form.kind === "image" ? "banner" : "announcement"}`}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
