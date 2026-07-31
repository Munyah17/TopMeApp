"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { BannerForm } from "@/components/admin/banner-form";
import { deletePromoBanner, togglePromoBannerActive } from "@/lib/actions/admin";
import type { PromoBanner } from "@/types/database";

function BannerRow({ banner }: { banner: PromoBanner }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <BannerForm
        existing={banner}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="row gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", opacity: banner.is_active ? 1 : 0.5 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied banner URL */}
      <img src={banner.image_url} alt="" style={{ width: 64, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {banner.image_url}
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {banner.link_url || "No link"} · sort {banner.sort_order}
        </div>
      </div>
      {error && (
        <div className="muted" style={{ color: "var(--error)", fontSize: 11 }}>
          {error}
        </div>
      )}
      <div
        className={`toggle ${banner.is_active ? "on" : ""} tap`}
        title={banner.is_active ? "Active — shown on Home" : "Inactive — hidden from Home"}
        onClick={() => startTransition(async () => { await togglePromoBannerActive(banner.id, banner.is_active); router.refresh(); })}
      >
        <div className="knob" />
      </div>
      <button className="btn btn-ghost" style={{ height: 32, padding: "0 10px", fontSize: 12 }} onClick={() => setEditing(true)}>
        Edit
      </button>
      <button
        className="btn btn-ghost"
        style={{ height: 32, padding: "0 10px", fontSize: 12, color: "var(--error)" }}
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this banner? This can't be undone.")) return;
          setError(null);
          startTransition(async () => {
            try {
              await deletePromoBanner(banner.id);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not delete.");
            }
          });
        }}
      >
        Delete
      </button>
    </div>
  );
}

export function BannersClient({ banners }: { banners: PromoBanner[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="row between mb-2">
        <span className="section-title">Home page banner</span>
        <button className="btn btn-primary" style={{ height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => setAdding((v) => !v)}>
          <Icon name={adding ? "x" : "plus"} size={14} stroke={2.4} /> {adding ? "Close" : "Add banner"}
        </button>
      </div>

      {adding && (
        <BannerForm
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {banners.length === 0 ? (
          <div className="card-pad muted">No banners yet — add one above.</div>
        ) : (
          banners.map((b) => <BannerRow key={b.id} banner={b} />)
        )}
      </div>
    </div>
  );
}
