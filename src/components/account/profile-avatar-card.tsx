"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { removeMyAvatar, uploadMyAvatar } from "@/lib/actions/account";

function initials(name: string | null) {
  if (!name) return "TM";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Profile header on /account — shows the real uploaded photo when one exists
// and falls back to initials only when it doesn't. Tap the photo (or the
// button) to upload/change; Remove clears it back to initials.
export function ProfileAvatarCard({
  name,
  phone,
  email,
  avatarUrl,
}: {
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const url = await uploadMyAvatar(formData);
      setAvatar(url);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't upload that image.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setErr(null);
    setBusy(true);
    try {
      await removeMyAvatar();
      setAvatar(null);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't remove the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad mt-3">
      <div className="row gap-2" style={{ alignItems: "center" }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar from our own storage, no stored dimensions
          <img src={avatar} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "var(--green-700)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {initials(name)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>{name || "Your name"}</div>
          <div className="muted">{phone || email}</div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      <div className="row gap-2 mt-3">
        <button
          type="button"
          className="btn btn-secondary"
          style={{ height: 34, padding: "0 14px", fontSize: 12.5 }}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Working…" : avatar ? "Change photo" : "Add photo"}
        </button>
        {avatar && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ height: 34, padding: "0 12px", fontSize: 12.5 }}
            disabled={busy}
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>
      {err && (
        <div className="mt-2" style={{ color: "var(--error)", fontSize: 13 }}>
          {err}
        </div>
      )}
    </div>
  );
}
