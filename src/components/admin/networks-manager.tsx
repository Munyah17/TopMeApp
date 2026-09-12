"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { setNetworkActive, setNetworkLogo, uploadNetworkLogo } from "@/lib/actions/admin";
import type { Network } from "@/types/database";

function NetworkRow({ network }: { network: Network }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const url = await uploadNetworkLogo(fd);
      await setNetworkLogo(network.id, url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="row gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", opacity: network.is_active ? 1 : 0.55 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: network.logo_url ? "var(--surface)" : network.color,
          border: network.logo_url ? "1px solid var(--border)" : "none",
          color: "#fff",
          fontWeight: 800,
          fontSize: 15,
          overflow: "hidden",
        }}
      >
        {network.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo, small, in the admin console only
          <img src={network.logo_url} alt={network.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          network.name.slice(0, 1)
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {network.name}
          {!network.is_active && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "var(--warning)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Hidden
            </span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {network.is_active ? "Live for customers" : "Not shown to customers"} · {network.logo_url ? "logo set" : "lettered fallback"}
        </div>
        {error && (
          <div className="muted" style={{ color: "var(--error)", fontSize: 11 }}>
            {error}
          </div>
        )}
      </div>

      <div
        className={`toggle ${network.is_active ? "on" : ""} tap`}
        title={network.is_active ? "Live: customers can select this network" : "Hidden from customers"}
        onClick={() =>
          startTransition(async () => {
            setBusy(true);
            try {
              await setNetworkActive(network.id, !network.is_active);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't update.");
            } finally {
              setBusy(false);
            }
          })
        }
      >
        <div className="knob" />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        className="btn btn-secondary"
        style={{ height: 32, padding: "0 12px", fontSize: 12 }}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Uploading…" : network.logo_url ? "Replace" : "Upload logo"}
      </button>
      {network.logo_url && (
        <button
          className="btn btn-ghost"
          style={{ height: 32, padding: "0 10px", fontSize: 12, color: "var(--error)" }}
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              setBusy(true);
              try {
                await setNetworkLogo(network.id, null);
                router.refresh();
              } finally {
                setBusy(false);
              }
            })
          }
        >
          Remove
        </button>
      )}
    </div>
  );
}

export function NetworksManager({ networks }: { networks: Network[] }) {
  if (networks.length === 0) return null;
  return (
    <div className="card mb-3" style={{ overflow: "hidden" }}>
      <div className="row gap-2" style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
        <div className="ibadge" style={{ background: "var(--green-50)", color: "var(--green-600)" }}>
          <Icon name="phone" size={20} stroke={1.8} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Network operators</div>
          <div className="muted">Logos shown on the airtime &ldquo;Choose network&rdquo; step</div>
        </div>
      </div>
      {networks.map((n) => (
        <NetworkRow key={n.id} network={n} />
      ))}
    </div>
  );
}
