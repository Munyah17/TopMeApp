"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Per-field validation — flag exactly which input is wrong instead of
    // failing silently or surfacing a generic Supabase error.
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "That doesn't look like a valid email address.";
    if (!password) errs.password = "Enter your password.";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        // Credential failures belong on the form, not a field — but a
        // "invalid login credentials" is really about the pair, so keep it
        // as a form-level message.
        setError(error.message);
        return;
      }
      // Route by role: staff land on their console, customers on the app.
      // An explicit ?redirect= always wins (e.g. middleware bounced them off
      // a protected page they asked for).
      let dest = searchParams.get("redirect") || "/home";
      if (!searchParams.get("redirect")) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
          if (prof?.role === "superadmin") dest = "/super-admin";
          else if (prof?.role === "admin") dest = "/admin";
        }
      }
      // A hard navigation (not router.push + router.refresh) so the proxy
      // middleware sees the just-set auth cookie on the very next request —
      // push+refresh back-to-back races and can drop the navigation entirely.
      window.location.assign(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card card-pad">
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>Welcome back</h2>
      <div className="muted mb-2">Log in to top up and pay in seconds.</div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <div>
          <label className="field-label">Email</label>
          <input
            className="field"
            type="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined })); }}
            placeholder="you@example.com"
            style={fieldErrors.email ? { borderColor: "var(--error)" } : undefined}
          />
          {fieldErrors.email && (
            <div style={{ color: "var(--error)", fontSize: 12.5, marginTop: 4 }}>{fieldErrors.email}</div>
          )}
        </div>
        <div>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <label className="field-label">Password</label>
            <Link
              href="/forgot-password"
              className="muted"
              style={{ fontSize: 12.5, fontWeight: 600, textDecoration: "none", color: "var(--green-600)" }}
            >
              Forgot password?
            </Link>
          </div>
          <input
            className="field"
            type="password"
            required
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined })); }}
            placeholder="••••••••"
            style={fieldErrors.password ? { borderColor: "var(--error)" } : undefined}
          />
          {fieldErrors.password && (
            <div style={{ color: "var(--error)", fontSize: 12.5, marginTop: 4 }}>{fieldErrors.password}</div>
          )}
        </div>
        {error && (
          <div className="muted" style={{ color: "var(--error)" }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div className="muted mt-3" style={{ textAlign: "center" }}>
        New to TopMe? <Link href="/signup" style={{ color: "var(--green-600)", fontWeight: 700 }}>Create an account</Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
