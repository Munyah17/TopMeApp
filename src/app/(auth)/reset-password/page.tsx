"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // null = still checking. /auth/confirm establishes the recovery session
  // before redirecting here, so this only fails if someone opens the page
  // directly — in which case sending them back for a fresh link is the only
  // thing that helps.
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Drop the recovery session so the new password is actually used to get
    // back in — and so a shared or borrowed device isn't left signed in.
    await supabase.auth.signOut();
    setDone(true);
  }

  if (done) {
    return (
      <div className="card card-pad" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 20 }}>Password updated</h2>
        <div className="muted mt-1">You can now log in with your new password.</div>
        <Link href="/login" className="btn btn-primary btn-block mt-3" style={{ textDecoration: "none" }}>
          Log in
        </Link>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="card card-pad" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 20 }}>This link isn&apos;t valid</h2>
        <div className="muted mt-1">
          Reset links expire after an hour and can only be used once. Request a fresh one and it&apos;ll
          work straight away.
        </div>
        <Link href="/forgot-password" className="btn btn-primary btn-block mt-3" style={{ textDecoration: "none" }}>
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>Set a new password</h2>
      <div className="muted mb-2">Choose something you haven&apos;t used on TopMe before.</div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <div>
          <label className="field-label">New password</label>
          <input
            className="field"
            type="password"
            required
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="field-label">Confirm new password</label>
          <input
            className="field"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && (
          <div className="muted" style={{ color: "var(--error)" }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={loading || hasSession === null}>
          {loading ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
