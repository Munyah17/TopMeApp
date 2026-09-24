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

  // MUST be getUser(), not getSession(): getUser() validates the JWT against
  // the auth server AND — crucially — refreshes an expired/expiring access
  // token, writing the new token back through the setAll adapter above so
  // both this request's downstream render and the browser get fresh cookies.
  // getSession() only decodes the cookie and never refreshes, so once the
  // ~1h access token lapsed, server-component RLS queries (getWallet,
  // getRecentTransactions, …) started running unauthenticated — auth.uid()
  // came back NULL and the customer's own wallet row was filtered out,
  // showing a $0 balance while the DB held the real amount.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // /admin and /super-admin don't redirect to /login — staff sign in at
  // their own portal URLs (each layout renders StaffLogin for a logged-out
  // session), keeping the customer and staff entry points fully separate.
  // /wallet, /history and /account are guest-reachable too — each page
  // renders its own in-shell "log in" prompt (or, for /history, cached
  // guest activity) so the app shell and its navigation stay visible.
  const authPrefixes = ["/login", "/signup"];
  const isAuthRoute = authPrefixes.some((p) => pathname.startsWith(p));

  if (user && isAuthRoute) {
    // Staff belong on their console, not the customer home — resolve the
    // role here too so a logged-in admin revisiting /login isn't dropped
    // back into the customer app. Rare path (auth pages only), so the one
    // profile read is fine.
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const url = request.nextUrl.clone();
    url.pathname = profile?.role === "superadmin" ? "/super-admin" : profile?.role === "admin" ? "/admin" : "/home";
    return NextResponse.redirect(url);
  }

  // Staff have no customer account: /account, /wallet, personal /pay routes
  // and /chat are customer-profile surfaces, and an admin session reaching
  // one is bounced to their console. Public pages (/home, /services,
  // /pay/[serviceId] checkout, /pay/guest) stay open to them — staff can
  // view the site like a visitor, they just can't hold a client profile.
  const staffGatedPrefixes = ["/account", "/wallet", "/history", "/chat", "/pay/send", "/pay/receive", "/pay/scan"];
  const isCustomerAccountRoute = staffGatedPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (user && isCustomerAccountRoute) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role === "superadmin" || profile?.role === "admin") {
      const url = request.nextUrl.clone();
      url.pathname = profile.role === "superadmin" ? "/super-admin" : "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
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
