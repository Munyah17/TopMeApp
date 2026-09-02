import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Module-level, short-TTL cache — middleware runs on every single
// navigation across the whole app, so a real Postgres round-trip here for
// a flag that changes maybe a few times a year was pure added latency on
// every click. Edge runtime instances stay warm across bursts of traffic,
// so this cuts the real query down to roughly once per 30s per warm
// instance instead of once per request. Worst case, a maintenance-mode
// toggle takes up to 30s to reach an already-warm instance — acceptable,
// and staff can always verify immediately since /admin and /super-admin
// are exempt from the check entirely.
let maintenanceCache: { value: boolean; expiresAt: number } | null = null;
const MAINTENANCE_CACHE_MS = 30_000;

async function getMaintenanceMode(supabase: SupabaseClient): Promise<boolean> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) return maintenanceCache.value;
  const { data } = await supabase.rpc("get_public_setting", { p_key: "maintenance_mode" });
  const value = data === true;
  maintenanceCache = { value, expiresAt: now + MAINTENANCE_CACHE_MS };
  return value;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // getSession reads the cookie — no network round-trip. This is an optimistic
  // check only; real authorization happens via RLS on every query.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const pathname = request.nextUrl.pathname;

  // Only /admin and /super-admin hard-redirect at the edge. /wallet, /history
  // and /account are guest-reachable too now — each page renders its own
  // in-shell "log in" prompt (or, for /history, cached guest activity) so the
  // app shell and its navigation stay visible instead of bouncing the visitor
  // to a bare /login.
  const protectedPrefixes = ["/admin", "/super-admin"];
  const authPrefixes = ["/login", "/signup"];

  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
  const isAuthRoute = authPrefixes.some((p) => pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  // Maintenance mode: blocks everyone except staff, and never blocks /admin,
  // /super-admin, or the maintenance page (so it can always be turned back off).
  // /auth and the password-reset pages are exempt too: locking a customer
  // out of account recovery is exactly the wrong thing to do during an
  // outage, and a recovery link that lands on /maintenance is spent — they
  // are single-use, so the customer can't simply retry it later.
  const exemptFromMaintenance =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  if (!exemptFromMaintenance) {
    const maintenanceOn = await getMaintenanceMode(supabase);
    if (maintenanceOn) {
      let isStaff = false;
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        isStaff = profile?.role === "admin" || profile?.role === "superadmin";
      }
      if (!isStaff) {
        const url = request.nextUrl.clone();
        url.pathname = "/maintenance";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
