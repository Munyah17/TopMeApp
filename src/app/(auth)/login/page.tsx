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
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // A hard navigation (not router.push + router.refresh) so the proxy
    // middleware sees the just-set auth cookie on the very next request —
    // push+refresh back-to-back races and can drop the navigation entirely.
    window.location.assign(searchParams.get("redirect") || "/home");
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
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
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
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
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
