"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { AvatarMenu } from "@/components/app-shell/avatar-menu";
import { BrandMark, Wordmark } from "@/components/logo";
import { Footer } from "@/components/app-shell/footer";
import type { Profile } from "@/types/database";

const NAVTABS = [
  { id: "home", href: "/home", label: "Home", icon: "home" },
  { id: "services", href: "/services", label: "Services", icon: "grid" },
  { id: "chat", href: "/chat", label: "Chat & Pay", icon: "chat" },
  { id: "history", href: "/history", label: "History", icon: "clock" },
  { id: "account", href: "/account", label: "Account", icon: "user" },
];

// Human title for the sticky topbar, derived from the current route.
const PAGE_TITLES: Array<[string, string]> = [
  ["/home", "Home"],
  ["/services", "Services"],
  ["/chat", "Chat & Pay"],
  ["/history", "History"],
  ["/account", "Account"],
  ["/wallet", "Wallet"],
  ["/insurance", "Insurance"],
  ["/pay", "Pay"],
];
function pageTitle(pathname: string) {
  const match = PAGE_TITLES.find(([href]) => pathname === href || pathname.startsWith(href + "/"));
  return match?.[1] ?? "TopMe";
}

function initials(name: string | null) {
  if (!name) return "TM";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "TM";
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  profile,
  unreadChatCount = 0,
  chatEnabled = true,
  announcements,
  children,
}: {
  profile: Profile | null;
  unreadChatCount?: number;
  chatEnabled?: boolean;
  announcements?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showFab = pathname === "/home";
  const isAdminSection = pathname.startsWith("/admin");
  const navTabs = chatEnabled ? NAVTABS : NAVTABS.filter((t) => t.id !== "chat");

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const navLinks = (onNavigate?: () => void) =>
    navTabs.map((t) => (
      <Link
        key={t.id}
        href={t.href}
        onClick={onNavigate}
        className={`side-nav-item ${isActive(pathname, t.href) ? "active" : ""}`}
      >
        <Icon name={t.icon} size={18} stroke={2} />
        <span>{t.label}</span>
        {t.id === "chat" && unreadChatCount > 0 && <span className="side-nav-dot" />}
      </Link>
    ));

  const userCard = profile ? (
    <Link href="/account" className="side-user" style={{ textDecoration: "none" }}>
      <span className="side-user-avatar">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar from our own storage, no stored dimensions
          <img src={profile.avatar_url} alt="" />
        ) : (
          initials(profile.full_name)
        )}
      </span>
      <span className="side-user-meta">
        <span className="side-user-name">{profile.full_name || "Account"}</span>
        <span className="side-user-sub">View profile</span>
      </span>
      <Icon name="chevronR" size={16} stroke={2} className="side-user-chevron" />
    </Link>
  ) : (
    <div className="side-user" style={{ gap: 8 }}>
      <Link
        href="/login"
        className="btn"
        style={{ flex: 1, height: 38, textDecoration: "none", background: "rgba(236,253,245,0.1)", color: "#ecfdf5", border: "1px solid rgba(236,253,245,0.2)" }}
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="btn"
        style={{ flex: 1, height: 38, textDecoration: "none", background: "#fff", color: "var(--green-900)", fontWeight: 700 }}
      >
        Sign Up
      </Link>
    </div>
  );

  return (
    <div className="app-shell">
      {/* Desktop sidebar — fixed left rail with brand, grouped nav, user card. */}
      <aside className="app-sidebar">
        <Link href="/home" className="side-brand" style={{ textDecoration: "none" }}>
          <BrandMark size={30} />
          <Wordmark size={16} />
        </Link>
        <nav className="side-nav">
          {navLinks()}
        </nav>
        <div className="side-footer">{userCard}</div>
      </aside>

      {/* Mobile drawer — same nav, slides in over a scrim. */}
      <div className={`drawer-scrim ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <aside className={`app-drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <Link href="/home" className="side-brand" style={{ textDecoration: "none" }} onClick={() => setDrawerOpen(false)}>
            <BrandMark size={28} />
            <Wordmark size={15} />
          </Link>
          <button type="button" className="header-icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <Icon name="x" size={18} stroke={2} />
          </button>
        </div>
        <nav className="side-nav">{navLinks(() => setDrawerOpen(false))}</nav>
        <div className="side-footer">{userCard}</div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="header-inner">
            <button
              type="button"
              className="drawer-toggle tap"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Icon name="menu" size={24} stroke={2} />
            </button>
            <div className="topbar-title">{pageTitle(pathname)}</div>

            <div className="header-right">
              {profile ? (
                <AvatarMenu initials={initials(profile.full_name)} avatarUrl={profile.avatar_url} />
              ) : (
                <>
                  {/* Mobile gets one clean CTA; desktop keeps the split pair. */}
                  <div className="mobile-only">
                    <Link href="/signup" className="btn btn-primary tap" style={{ textDecoration: "none", padding: "0 18px", height: 38 }}>
                      Get Started
                    </Link>
                  </div>
                  <div className="header-auth-desktop">
                    <Link href="/login" className="btn btn-secondary tap" style={{ textDecoration: "none", padding: "0 16px", height: 36 }}>
                      Log in
                    </Link>
                    <Link href="/signup" className="btn btn-primary tap" style={{ textDecoration: "none", padding: "0 16px", height: 36 }}>
                      Sign Up
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="view-area">
          <div className={`screen-pad page-enter${pathname.startsWith("/chat") ? " chat-route" : ""}`} key={pathname}>
            {!isAdminSection && announcements}
            {children}
          </div>
          {/* No footer on /chat — the fixed-height shell fills the view-area,
              so a footer would just add a scrollable gap below it. */}
          {!pathname.startsWith("/chat") && <Footer />}
        </div>

        {showFab && (
          <button className="fab tap" title="Browse services" onClick={() => router.push("/services")}>
            <Icon name="grid" size={22} stroke={1.8} className="text-white" />
          </button>
        )}

        <nav className="bottom-nav">
          {navTabs.map((t) =>
            t.id === "chat" ? (
              <Link key={t.id} href={t.href} className={`nav-item nav-item-chat ${isActive(pathname, t.href) ? "active" : ""}`}>
                <span className="nav-chat-badge">
                  <Icon name={t.icon} size={23} stroke={2.2} className="text-white" />
                  {unreadChatCount > 0 && <span className="nav-chat-dot" />}
                </span>
                <span className="nav-label">{t.label}</span>
              </Link>
            ) : (
              <Link key={t.id} href={t.href} className={`nav-item ${isActive(pathname, t.href) ? "active" : ""}`}>
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <Icon name={t.icon} size={22} stroke={2} />
                </span>
                <span className="nav-label">{t.label}</span>
              </Link>
            )
          )}
        </nav>
      </div>
    </div>
  );
}
