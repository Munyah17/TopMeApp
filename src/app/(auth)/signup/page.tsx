"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sendWelcomeEmail } from "@/lib/actions/account";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setCheckEmail(true);
      return;
    }
    // Account is live (no confirmation step) — send the welcome mail before
    // navigating away. Awaited so the request isn't cut short by the hard
    // navigation below; it can't throw or block for long, since sendEmail
    // swallows its own failures.
    await sendWelcomeEmail();
    // Hard navigation so the proxy middleware sees the just-set auth cookie
    // on the next request (see login/page.tsx for why push+refresh races).
    window.location.assign("/home");
  }

  if (checkEmail) {
    return (
      <div className="card card-pad" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 20 }}>Check your email</h2>
        <div className="muted mt-1">We sent a confirmation link to {email}. Follow it to activate your account.</div>
        <Link href="/login" className="btn btn-secondary btn-block mt-3" style={{ textDecoration: "none" }}>
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>Create your TopMe account</h2>
      <div className="muted mb-2">One wallet for airtime, ZESA, DStv, insurance and more.</div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <div>
          <label className="field-label">Full Name</label>
          <input
            className="field"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="field-label">Phone Number</label>
          <input
            className="field"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="077 123 4567"
          />
        </div>
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
          <label className="field-label">Password</label>
          <input
            className="field"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>
        {error && (
          <div className="muted" style={{ color: "var(--error)" }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="muted mt-3" style={{ textAlign: "center" }}>
        Already have an account? <Link href="/login" style={{ color: "var(--green-600)", fontWeight: 700 }}>Log in</Link>
      </div>
    </div>
  );
}
