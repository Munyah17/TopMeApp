import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.topme.co.zw";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing behind a login belongs in a search index, and the staff
        // consoles definitely don't — keep crawlers out of both entirely
        // rather than relying on auth alone to hide them.
        disallow: ["/admin", "/super-admin", "/api", "/wallet", "/account", "/history", "/chat"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
