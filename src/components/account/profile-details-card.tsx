"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { updateMyProfile } from "@/lib/actions/account";

// "Personal details" card on /account — lets a signed-in customer edit their
// own basic identity (name + contact email) without KYC. Phone stays read-only
// because it's the sign-in credential; changing it needs a verified auth flow.
export function ProfileDetailsCard({
  name,
  phone,
  email,
}: {
  name: string | null;
  phone: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(name ?? "");
  const [emailVal, setEmailVal] = useState(email ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function startEdit() {
    setFullName(name ?? "");
    setEmailVal(email ?? "");
    setErr(null);
    setSaved(false);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await updateMyProfile({ fullName, email: emailVal });
      setEditing(false);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save your details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="row between" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <div className="ibadge round" style={{ width: 38, height: 38, background: "var(--badge-neutral-bg)", color: "var(--text-soft)" }}>
            <Icon name="user" size={17} stroke={1.8} />
          </div>
          <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em" }}>Personal details</div>
        </div>
        {!editing && (
          <button type="button" className="btn btn-ghost" style={{ height: 32, padding: "0 12px", fontSize: 12.5 }} onClick={startEdit}>
            <Icon name="edit" size={14} stroke={2} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ padding: "14px 16px" }}>
          <label className="field-label">Full name</label>
          <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" autoFocus />

          <label className="field-label mt-2">Email</label>
          <input className="field" type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)} placeholder="you@example.com" />

          <label className="field-label mt-2">Phone</label>
          <input className="field" value={phone ?? ""} disabled readOnly />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Phone is your sign-in number — contact support to change it.
          </div>

          {err && (
            <div className="mt-2" style={{ color: "var(--error)", fontSize: 13 }}>
              {err}
            </div>
          )}

          <div className="row gap-2 mt-3">
            <button type="button" className="btn btn-primary" style={{ height: 38, padding: "0 18px", fontSize: 13 }} disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-ghost" style={{ height: 38, padding: "0 14px", fontSize: 13 }} disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: "4px 0" }}>
          {[
            { label: "Full name", value: name || "—" },
            { label: "Email", value: email || "—" },
            { label: "Phone", value: phone || "—" },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className="row between"
              style={{ padding: "12px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              <span className="muted" style={{ fontSize: 13 }}>{row.label}</span>
              <span style={{ fontWeight: 600, fontSize: 13.5, textAlign: "right", marginLeft: 16 }}>{row.value}</span>
            </div>
          ))}
          {saved && (
            <div style={{ padding: "0 16px 12px", color: "var(--green)", fontSize: 12.5, fontWeight: 600 }}>
              Saved.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
