"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { sendCustomerPasswordReset, setCustomerPassword, setUserAvatar, updateCustomerProfile, uploadUserAvatar } from "@/lib/actions/admin";

export function UserEditForm({
  userId,
  fullName,
  phone,
  email,
  avatarUrl,
}: {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(fullName ?? "");
  const [ph, setPh] = useState(phone ?? "");
  const [em, setEm] = useState(email ?? "");
  const [avatar, setAvatar] = useState(avatarUrl);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    name.trim() !== (fullName ?? "") ||
    ph.trim() !== (phone ?? "") ||
    em.trim().toLowerCase() !== (email ?? "").toLowerCase();

  function save() {
    setErr(null);
    setMsg(null);
    start(async () => {
      try {
        const r = await updateCustomerProfile(userId, { fullName: name, phone: ph, email: em });
        const n = Object.keys(r.changed).length;
        setMsg(n ? `Saved ${n} change${n === 1 ? "" : "s"}.` : "Nothing changed.");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function resetPw() {
    setErr(null);
    setMsg(null);
    start(async () => {
      try {
        const r = await sendCustomerPasswordReset(userId);
        setMsg(`Password-reset email sent to ${r.email}.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't send the reset email.");
      }
    });
  }

  function savePassword() {
    setErr(null);
    setMsg(null);
    start(async () => {
      try {
        await setCustomerPassword(userId, newPassword);
        setMsg("Password updated. Let them know their new password directly.");
        setNewPassword("");
        setShowPasswordField(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't set the password.");
      }
    });
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setMsg(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const url = await uploadUserAvatar(formData);
      await setUserAvatar(userId, url);
      setAvatar(url);
      setMsg("Profile picture updated.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  function removeAvatar() {
    setErr(null);
    setMsg(null);
    start(async () => {
      try {
        await setUserAvatar(userId, null);
        setAvatar(null);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't remove the picture.");
      }
    });
  }

  return (
    <div className="card card-pad">
      <div className="section-title" style={{ fontSize: 14 }}>Account details</div>
      <div className="muted mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Fix a customer&apos;s name, phone, email or picture. Changing the email updates their login and is
        marked confirmed. Every change is logged to the audit trail.
      </div>

      <div className="row gap-2 mt-3" style={{ alignItems: "center" }}>
        {avatar ? (
          <img src={avatar} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover" }} />
        ) : (
          <div className="ibadge round" style={{ width: 52, height: 52, background: "#F1F4F9", color: "var(--text-soft)", fontWeight: 700 }}>
            {(name || "?").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="row gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
          <button className="btn btn-secondary" style={{ height: 34, padding: "0 12px", fontSize: 12.5 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Uploading…" : avatar ? "Change picture" : "Upload picture"}
          </button>
          {avatar && (
            <button className="btn btn-ghost" style={{ height: 34, padding: "0 12px", fontSize: 12.5 }} disabled={pending} onClick={removeAvatar}>
              Remove
            </button>
          )}
        </div>
      </div>

      <label className="field-label mt-3">Full name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="—" />

      <label className="field-label mt-2">Phone</label>
      <input className="field" value={ph} onChange={(e) => setPh(e.target.value)} placeholder="+263…" inputMode="tel" />

      <label className="field-label mt-2">Email (login)</label>
      <input className="field" value={em} onChange={(e) => setEm(e.target.value)} placeholder="name@example.com" inputMode="email" />

      {err && <div className="mt-2" style={{ color: "var(--error)", fontSize: 13 }}>{err}</div>}
      {msg && <div className="mt-2" style={{ color: "var(--success)", fontSize: 13 }}>{msg}</div>}

      <div className="row gap-2 mt-3" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary" style={{ flex: "1 1 140px" }} disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn-secondary" style={{ flex: "1 1 160px" }} disabled={pending || !(email && email.trim())} onClick={resetPw}>
          <Icon name="lock" size={14} stroke={2} /> Send password reset
        </button>
      </div>

      {showPasswordField ? (
        <div className="mt-2">
          <label className="field-label">New password (set directly, no email)</label>
          <div className="row gap-2">
            <input className="field" style={{ flex: 1 }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
            <button className="btn btn-primary" style={{ height: 40, padding: "0 14px" }} disabled={pending || newPassword.length < 8} onClick={savePassword}>
              Set
            </button>
            <button className="btn btn-ghost" style={{ height: 40, padding: "0 10px" }} onClick={() => { setShowPasswordField(false); setNewPassword(""); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost btn-block mt-2" style={{ fontSize: 12.5 }} onClick={() => setShowPasswordField(true)}>
          Or set a password directly instead
        </button>
      )}
    </div>
  );
}
