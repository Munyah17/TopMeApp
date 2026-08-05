import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // Only /admin hard-redirects at the edge. /wallet, /history and /account are
  // guest-reachable too now — each page renders its own in-shell "log in"
  // prompt (or, for /history, cached guest activity) so the app shell and its
  // navigation stay visible instead of bouncing the visitor to a bare /login.
  const protectedPrefixes = ["/admin"];
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

  // Maintenance mode: blocks everyone except staff, and never blocks /admin
  // itself or the maintenance page (so it can always be turned back off).
  const exemptFromMaintenance = pathname.startsWith("/admin") || pathname.startsWith("/maintenance") || pathname.startsWith("/api");
  if (!exemptFromMaintenance) {
    const { data: maintenanceOn } = await supabase.rpc("get_public_setting", { p_key: "maintenance_mode" });
    if (maintenanceOn === true) {
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
