"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { hexA } from "@/lib/data/catalog-helpers";
import { CategoryForm } from "@/components/admin/category-form";
import { ServiceForm } from "@/components/admin/service-form";
import { deleteService, toggleServiceActive } from "@/lib/actions/admin";
import type { Service, ServiceCategory } from "@/types/database";

function ServiceRow({ service, categoryColor, categories }: { service: Service; categoryColor: string; categories: ServiceCategory[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <ServiceForm
        categories={categories}
        existing={service}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div
      className="row gap-2"
      style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", opacity: service.is_active ? 1 : 0.5, flexWrap: "wrap" }}
    >
      <div className="ibadge round" style={{ width: 36, height: 36, background: hexA(categoryColor, 0.12), color: categoryColor }}>
        <Icon name={service.icon} size={16} stroke={1.8} />
      </div>
      <div style={{ flex: "1 1 160px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{service.name}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {service.id} · {service.provider_label || "—"} · cost {service.cost_percentage}%
        </div>
      </div>
      {error && (
        <div className="muted" style={{ color: "var(--error)", fontSize: 11 }}>
          {error}
        </div>
      )}
      <div
        className={`toggle ${service.is_active ? "on" : ""} tap`}
        title={service.is_active ? "Active: visible to customers" : "Inactive: hidden from customers"}
        onClick={() => startTransition(async () => { await toggleServiceActive(service.id, service.is_active); router.refresh(); })}
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
          if (!confirm(`Delete "${service.name}"? This can't be undone.`)) return;
          setError(null);
          startTransition(async () => {
            try {
              await deleteService(service.id);
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

export function ProductsClient({ categories, services }: { categories: ServiceCategory[]; services: Service[] }) {
  const router = useRouter();
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingServiceFor, setAddingServiceFor] = useState<string | null>(null);
  const servicesByCategory = new Map<string, Service[]>();
  for (const s of services) {
    const arr = servicesByCategory.get(s.category_id) ?? [];
    arr.push(s);
    servicesByCategory.set(s.category_id, arr);
  }

  return (
    <div>
      <div className="row between mb-2">
        <span className="section-title">Categories & services</span>
        <button className="btn btn-primary" style={{ height: 36, padding: "0 14px", fontSize: 13 }} onClick={() => setAddingCategory((v) => !v)}>
          <Icon name={addingCategory ? "x" : "plus"} size={14} stroke={2.4} /> {addingCategory ? "Close" : "Add category"}
        </button>
      </div>

      {addingCategory && (
        <CategoryForm
          onDone={() => {
            setAddingCategory(false);
            router.refresh();
          }}
        />
      )}

      {categories.map((c) => (
        <div key={c.id} className="card mb-3" style={{ overflow: "hidden" }}>
          <div className="row gap-2" style={{ padding: 16, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            <div className="ibadge" style={{ background: c.bg, color: c.color }}>
              <Icon name={c.icon} size={20} stroke={1.8} />
            </div>
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div className="muted">{(servicesByCategory.get(c.id) ?? []).length} services</div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ height: 34, padding: "0 12px", fontSize: 12.5 }}
              onClick={() => setAddingServiceFor(addingServiceFor === c.id ? null : c.id)}
            >
              {addingServiceFor === c.id ? "Close" : "+ Add service"}
            </button>
          </div>

          {addingServiceFor === c.id && (
            <div style={{ padding: 16 }}>
              <ServiceForm
                categories={categories}
                onDone={() => {
                  setAddingServiceFor(null);
                  router.refresh();
                }}
              />
            </div>
          )}

          {(servicesByCategory.get(c.id) ?? []).map((s) => (
            <ServiceRow key={s.id} service={s} categoryColor={c.color} categories={categories} />
          ))}
        </div>
      ))}
    </div>
  );
}
