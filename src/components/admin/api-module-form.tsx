"use client";

import { useState, useTransition } from "react";
import { createApiModule } from "@/lib/actions/admin";

export function ApiModuleForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [category, setCategory] = useState("");
  const [key, setKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-title" style={{ fontSize: 14 }}>
        New API module
      </div>
      <div>
        <label className="field-label">Service Name</label>
        <input className="field" placeholder="e.g. Telecel Airtime API" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Provider</label>
        <input className="field" placeholder="e.g. vitalpay" value={provider} onChange={(e) => setProvider(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Category</label>
        <input className="field" placeholder="e.g. Airtime & Data" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div>
        <label className="field-label">API Key</label>
        <input className="field" placeholder="sk_live_..." value={key} onChange={(e) => setKey(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Webhook URL (optional)</label>
        <input className="field" placeholder="https://" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
      </div>
      {error && (
        <div className="muted" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      <button
        className="btn btn-primary btn-block"
        disabled={!name || !key || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await createApiModule({ name, provider, category, key, webhookUrl });
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save module.");
            }
          });
        }}
      >
        {pending ? "Saving…" : "Save module"}
      </button>
    </div>
  );
}
