"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { removePaymentBanner, uploadPaymentBanner } from "@/lib/actions/settings";
import type { GuestGateway } from "@/lib/actions/guest-payments";

const GATEWAYS: { id: GuestGateway; label: string }[] = [
  { id: "paynow", label: "Paynow" },
  { id: "ecocash", label: "Ecocash Instant" },
  { id: "stripe", label: "Stripe" },
];

function GatewayBannerRow({ gateway, label, currentUrl }: { gateway: GuestGateway; label: string; currentUrl?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    startTransition(async () => {
      try {
        await uploadPaymentBanner(gateway, (() => {
          const fd = new FormData();
          fd.append("file", file);
          return fd;
        })());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not upload banner.");
      }
    });
  }

  return (
    <div className="card card-pad mb-2">
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
      <div className="muted mt-1" style={{ fontSize: 12 }}>
        Rectangle PNG banner shown as the button on checkout. Recommended ~600×90px, transparent or solid background.
      </div>

      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded banner preview
        <img src={currentUrl} alt={label} style={{ width: "100%", borderRadius: 10, marginTop: 10, display: "block" }} />
      )}

      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <div className="row gap-2 mt-2">
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={pending} onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={15} stroke={2} /> {pending ? "Uploading…" : currentUrl ? "Replace banner" : "Upload banner"}
        </button>
        {currentUrl && (
          <button
            className="btn btn-ghost"
            style={{ color: "var(--error)" }}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await removePaymentBanner(gateway);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not remove banner.");
                }
              })
            }
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export function PaymentBannersClient({ banners }: { banners: Record<string, string> }) {
  return (
    <div>
      {GATEWAYS.map((g) => (
        <GatewayBannerRow key={g.id} gateway={g.id} label={g.label} currentUrl={banners[g.id]} />
      ))}
    </div>
  );
}
