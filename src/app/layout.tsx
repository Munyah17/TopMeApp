import type { Metadata, Viewport } from "next";
import { Inter, Poppins, Space_Grotesk } from "next/font/google";
import { themeInitScript } from "@/lib/theme-script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// CoolAdmin's typeface — loaded globally as a CSS var but only applied inside
// .admin-shell, so the customer app keeps Inter/Space Grotesk untouched.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TopMe: Zimbabwe's Digital Convenience Store",
  description: "Top up airtime, data, ZESA, DStv, insurance and more from one wallet. Top up. Pay easy.",
};

// viewportFit: "cover" lets the app draw under the notch/home-indicator/URL-bar
// safe areas instead of leaving them to the OS, which is what makes the
// env(safe-area-inset-*) values below actually resolve to something nonzero.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Font Awesome 7 (bundled from the CoolAdmin template) — the Icon
            component renders these glyphs; self-hosted, no CDN dependency. */}
        <link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
