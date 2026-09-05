"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?type=recovery`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  // Always the same confirmation, sent or not: telling a stranger whether an
  // address has an account here turns this form into a way to test which of
  // a leaked email list banks with us.
  if (sent) {
    return (
      <div className="card card-pad" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 20 }}>Check your email</h2>
        <div className="muted mt-1">
          If an account exists for {email}, we&apos;ve sent a link to reset your password. It expires in
          one hour and can only be used once.
        </div>
        <Link href="/login" className="btn btn-secondary btn-block mt-3" style={{ textDecoration: "none" }}>
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>Reset your password</h2>
      <div className="muted mb-2">Enter your email and we&apos;ll send you a link to set a new one.</div>

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
        {error && (
          <div className="muted" style={{ color: "var(--error)" }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <div className="muted mt-3" style={{ textAlign: "center" }}>
        Remembered it? <Link href="/login" style={{ color: "var(--green-600)", fontWeight: 700 }}>Back to login</Link>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
