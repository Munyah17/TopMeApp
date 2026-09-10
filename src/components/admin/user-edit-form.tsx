"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { sendCustomerPasswordReset, updateCustomerProfile } from "@/lib/actions/admin";

export function UserEditForm({
  userId,
  fullName,
  phone,
  email,
}: {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(fullName ?? "");
  const [ph, setPh] = useState(phone ?? "");
  const [em, setEm] = useState(email ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  return (
    <div className="card card-pad">
      <div className="section-title" style={{ fontSize: 14 }}>Account details</div>
      <div className="muted mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Fix a customer&apos;s name, phone or email. Changing the email updates their login and is
        marked confirmed. Every change is logged to the audit trail.
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
    </div>
  );
}
