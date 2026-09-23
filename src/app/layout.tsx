import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { themeInitScript } from "@/lib/theme-script";
import "./globals.css";
import "./fa-subset.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});
// CoolAdmin's typeface — self-hosted from the template's own font files so
// builds never hit Google Fonts. Applied only inside .admin-shell, so the
// customer app keeps Inter/Space Grotesk untouched.
const poppins = localFont({
  variable: "--font-poppins",
  preload: false,
  display: "swap",
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
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
        <link rel="preload" href="/fonts/fa-solid-900.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
