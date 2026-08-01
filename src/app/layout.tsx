import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
