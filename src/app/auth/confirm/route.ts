import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing point for the links in Supabase's own auth emails (recovery,
// signup confirmation, email change).
//
// Deliberately the token_hash + verifyOtp flow rather than letting the
// browser client pick a session out of the URL: the browser client runs
// PKCE, whose code verifier lives in the storage of the browser that
// *started* the flow. People routinely request a reset on their phone and
// open the mail on a laptop, and that combination fails under PKCE with a
// confusing "invalid request" — the one moment a locked-out customer can
// least afford it. verifyOtp carries everything it needs in the link, so it
// works from any device.
//
// Pair it with this in Auth > Email Templates (both Confirm signup and
// Reset password), replacing the default {{ .ConfirmationURL }} link:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/forgot-password?error=${encodeURIComponent(reason)}`);

  if (!token_hash || !type) return fail("That link is incomplete. Request a new one below.");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    // Recovery links are single-use and time-limited, and this is the most
    // common way a customer arrives here — say so plainly instead of
    // surfacing Supabase's wording.
    return fail("That link has expired or has already been used. Request a new one below.");
  }

  // verifyOtp has established a session on the response cookies. For a
  // recovery that session exists solely so the next page can set a new
  // password; anything else goes to the app.
  return NextResponse.redirect(`${origin}${type === "recovery" ? "/reset-password" : "/home"}`);
}
