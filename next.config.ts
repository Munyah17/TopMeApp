import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Allow LAN device testing via e.g. NEXT_DEV_ORIGIN=192.168.1.20 npm run dev
  ...(process.env.NEXT_DEV_ORIGIN ? { allowedDevOrigins: [process.env.NEXT_DEV_ORIGIN] } : {}),
  images: {
    // Every admin-uploaded/user-uploaded image (chat, product logos, promo
    // banners, payment gateway banners) lives in Supabase Storage's public
    // bucket path — one pattern covers all of them for next/image.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  // No CSP here yet — this app loads Stripe.js and other third-party
  // scripts on the payment pages, and a wrong CSP silently breaks
  // checkout rather than failing loudly, so it needs its own careful pass
  // (enumerate every script/style/connect origin across every page) rather
  // than shipping alongside everything else in this change. The headers
  // below are the ones safe to add without that audit.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Real clickjacking risk for a wallet app specifically: without
          // this, TopMe's pay/login pages can be framed invisibly on an
          // attacker's page (a classic UI-redress attack — the victim
          // thinks they're clicking the attacker's button and are actually
          // clicking "Confirm payment" underneath). DENY, not
          // SAMEORIGIN — nothing in this app embeds its own pages in a
          // frame, so there's no legitimate case to leave open.
          { key: "X-Frame-Options", value: "DENY" },
          // Stops a browser from re-interpreting a response as a different
          // content type than the one declared (e.g. a chat-image upload
          // sniffed and executed as HTML/script) — meaningful precisely
          // because chat-images accepts any authenticated user's upload.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Full URL only ever sent same-origin; cross-origin requests
          // (images, any future third-party call) get just the origin —
          // reference/transaction IDs that end up in a page's URL never
          // leak to another site via the Referer header.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Deny every sensor API by default except the one this app
          // actually uses — camera, for /pay/scan's QR scanner (jsQR).
          // self, not none, or that page breaks.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          // HTTPS-only for a year, including subdomains — safe to set
          // unconditionally since it's a no-op over plain HTTP in dev.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
