"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";

// Staff sign-in, rendered in place at /admin and /super-admin for
// logged-out sessions — staff never touch the customer /login page.
// After auth the profile role decides the destination: each account goes
// to the console that belongs to it, and a customer account that
// authenticates here is signed straight back out with an explanation.
export function StaffLogin({ portal }: { portal: "admin" | "superadmin" }) {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const portalLabel = portal === "superadmin" ? "Super Admin" : "Admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your staff email and password.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(error.message);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let role: string | null = null;
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        role = prof?.role ?? null;
      }
      if (role !== "admin" && role !== "superadmin") {
        await supabase.auth.signOut();
        setError("This portal is for TopMe staff accounts only. Customer sign-in is at /login.");
        return;
      }
      // Hard navigation so the proxy middleware sees the fresh auth cookie.
      // An account always lands on its own console — an owner logging in on
      // the staff portal goes to /super-admin, staff hitting the owner's
      // portal go to /admin; matching role + portal reloads the deep link.
      const dest =
        role === "superadmin" ? "/super-admin" : portal === "superadmin" ? "/admin" : pathname;
      window.location.assign(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-left)) 0", flexShrink: 0 }}>
        <Link
          href="/home"
          className="muted tap"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 36, textDecoration: "none", fontSize: 13.5, fontWeight: 700 }}
        >
          Back to TopMe
        </Link>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <BrandMark size={36} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
              Top<b>Me</b>
            </div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {portalLabel}
            </div>
          </div>
        </div>
        <div className="content-narrow page-enter" style={{ width: "100%", maxWidth: 400 }}>
          <div className="card card-pad">
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Staff sign in</h2>
            <div className="muted mb-2">{portal === "superadmin" ? "Platform owners and directors." : "TopMe operations console."}</div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
              <div>
                <label className="field-label">Email</label>
                <input
                  className="field"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@topme.co.zw"
                />
              </div>
              <div>
                <label className="field-label">Password</label>
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
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
