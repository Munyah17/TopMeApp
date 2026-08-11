import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  allowedDevOrigins: ["172.20.10.9"],
  images: {
    // Every admin-uploaded/user-uploaded image (chat, product logos, promo
    // banners, payment gateway banners) lives in Supabase Storage's public
    // bucket path — one pattern covers all of them for next/image.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
};

export default nextConfig;
