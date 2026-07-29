"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { BrandMark, Wordmark } from "@/components/logo";
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
      <aside className="sidebar">
        <div className="sidebar-top">
          <BrandMark size={34} />
          <Wordmark size={19} showTagline />
        </div>
        <nav className="side-nav">
          {NAVTABS.map((t) => (
            <Link key={t.id} href={t.href} className={`nav-item ${isActive(pathname, t.href) ? "active" : ""}`}>
              <Icon name={t.icon} size={22} stroke={2} />
              <span className="nav-label">{t.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href={profile ? "/account" : "/login"} className="sidebar-user tap" style={{ textDecoration: "none" }}>
            {profile ? initials(profile.full_name) : <Icon name="user" size={17} stroke={2} />}
          </Link>
          <div className="sidebar-user-info">
            <div style={{ fontWeight: 700, fontSize: 13 }}>{profile?.full_name || "Guest"}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {profile ? "View account" : <Link href="/login" style={{ color: "var(--green-600)", fontWeight: 700 }}>Log in</Link>}
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <Link
            href="/services"
            className="header-search tap"
            style={{ textDecoration: "none" }}
          >
            <Icon name="search" size={17} stroke={2} />
            <span>Search services, bills, beneficiaries…</span>
          </Link>
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
              <Link href="/login" className="btn btn-primary tap" style={{ textDecoration: "none", padding: "0 16px", height: 36 }}>
                Log in
              </Link>
            )}
          </div>
        </header>

        <div className="view-area">
          <div className="screen-pad page-enter" key={pathname}>
            {children}
          </div>
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
