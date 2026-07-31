"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { BrandMark, Wordmark } from "@/components/logo";
import { Footer } from "@/components/app-shell/footer";
import type { Profile } from "@/types/database";

const NAVTABS = [
  { id: "home", href: "/home", label: "Home", icon: "home" },
  { id: "services", href: "/services", label: "Services", icon: "grid" },
  { id: "wallet", href: "/wallet", label: "Wallet", icon: "wallet" },
  { id: "history", href: "/history", label: "History", icon: "clock" },
  { id: "account", href: "/account", label: "Account", icon: "user" },
];

function initials(name: string | null) {
  if (!name) return "TM";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "TM";
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ profile, children }: { profile: Profile | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const showFab = pathname === "/home";

  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="app-header">
          <Link href="/home" className="header-logo tap" style={{ textDecoration: "none" }}>
            <BrandMark size={30} />
            <Wordmark size={16} />
          </Link>

          <nav className="header-nav">
            {NAVTABS.map((t) => (
              <Link key={t.id} href={t.href} className={`header-nav-item ${isActive(pathname, t.href) ? "active" : ""}`}>
                <Icon name={t.icon} size={17} stroke={2} />
                <span>{t.label}</span>
              </Link>
            ))}
          </nav>

          <div className="header-right">
            {profile ? (
              <>
                <Link href="/account" className="header-icon-btn tap" style={{ textDecoration: "none" }}>
                  <Icon name="bell" size={18} stroke={2} />
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 9,
                      width: 6,
                      height: 6,
                      background: "var(--error)",
                      borderRadius: "50%",
                      border: "1.5px solid var(--surface)",
                    }}
                  />
                </Link>
                <Link href="/account" className="header-avatar tap" style={{ textDecoration: "none" }}>
                  {initials(profile.full_name)}
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-secondary tap" style={{ textDecoration: "none", padding: "0 16px", height: 36 }}>
                  Log in
                </Link>
                <Link href="/signup" className="btn btn-primary tap" style={{ textDecoration: "none", padding: "0 16px", height: 36 }}>
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </header>

        <div className="view-area">
          <div className="screen-pad page-enter" key={pathname}>
            {children}
          </div>
          <Footer />
        </div>

        {showFab && (
          <button className="fab tap" title="Browse services" onClick={() => router.push("/services")}>
            <Icon name="grid" size={22} stroke={1.8} className="text-white" />
          </button>
        )}

        <nav className="bottom-nav">
          {NAVTABS.map((t) => (
            <Link key={t.id} href={t.href} className={`nav-item ${isActive(pathname, t.href) ? "active" : ""}`}>
              <Icon name={t.icon} size={22} stroke={2} />
              <span className="nav-label">{t.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
