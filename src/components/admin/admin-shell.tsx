"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { BrandMark } from "@/components/logo";
import { signOut } from "@/lib/actions/account";
import type { PermissionKey } from "@/lib/auth/permission-keys";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  perm?: PermissionKey;
  badge?: "alerts";
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { label: "Workspace", items: [{ label: "Dashboard", href: "/admin", icon: "home" }] },
  {
    label: "Operations",
    items: [
      { label: "Operations Center", href: "/admin/operations", icon: "zap", perm: "transactions.view", badge: "alerts" },
      { label: "Transactions", href: "/admin/transactions", icon: "wallet", perm: "transactions.view" },
      { label: "Refunds", href: "/admin/refunds", icon: "refresh", perm: "transactions.rectify" },
      { label: "Withdrawals", href: "/admin/withdrawals", icon: "arrowUpR", perm: "wallet.adjust" },
      { label: "Disputes", href: "/admin/disputes", icon: "shield", perm: "disputes.manage" },
      { label: "Support Tickets", href: "/admin/support", icon: "headset", perm: "support.manage" },
      { label: "Tasks", href: "/admin/tasks", icon: "ticket", perm: "tasks.manage" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Users", href: "/admin/users", icon: "users", perm: "users.view" },
      { label: "Staff", href: "/admin/staff", icon: "user", perm: "staff.manage" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Products & Services", href: "/admin/products", icon: "grid", perm: "catalog.manage" },
      { label: "APIs & Integrations", href: "/admin/apis", icon: "plug", perm: "apis.manage" },
      { label: "Announcements", href: "/admin/announcements", icon: "monitor", perm: "announcements.manage" },
    ],
  },
  {
    label: "Insight",
    items: [
      { label: "Reports & Analytics", href: "/admin/reports", icon: "book", perm: "reports.view" },
      { label: "System Health", href: "/admin/system-health", icon: "battery", perm: "reports.view" },
      { label: "Audit Log", href: "/admin/audit", icon: "clock", perm: "audit.view" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Global Settings", href: "/admin/settings", icon: "settings", perm: "settings.manage" },
      { label: "Feature Flags", href: "/admin/settings/flags", icon: "zap", perm: "flags.manage" },
      { label: "Version Tracker", href: "/admin/settings/versions", icon: "refresh", perm: "settings.manage" },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin" };

function isActive(pathname: string, href: string, basePath: string) {
  if (href === basePath) return pathname === basePath;
  return pathname === href || pathname.startsWith(href + "/");
}

// NAV hrefs are authored against "/admin" and rewritten to whichever portal
// is actually mounted — /admin for staff, /super-admin for the owner's own
// console (see src/app/admin/layout.tsx and src/app/super-admin/layout.tsx).
// Keeping one nav table instead of two means the two portals can't drift.
function portalHref(href: string, basePath: string) {
  return href === "/admin" ? basePath : basePath + href.slice("/admin".length);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TM";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Longest matching nav href wins, so /admin/settings/flags resolves to
// "Feature Flags" rather than its parent "Global Settings". Anything deeper
// than a nav entry (a transaction / user / ticket id) renders as "Detail".
function crumbsFor(pathname: string, basePath: string) {
  let best: { label: string; href: string } | null = null;
  for (const g of NAV) {
    for (const item of g.items) {
      const href = portalHref(item.href, basePath);
      if (isActive(pathname, href, basePath) && (!best || href.length > best.href.length)) best = { label: item.label, href };
    }
  }
  if (pathname === `${basePath}/profile`) best = { label: "My Profile", href: pathname };
  const trail: { label: string; href: string }[] = [];
  if (best) {
    trail.push(best);
    if (pathname !== best.href) trail.push({ label: "Detail", href: pathname });
  }
  return trail;
}

const themeListeners = new Set<() => void>();
function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => themeListeners.delete(cb);
}
function getThemeSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function AdminShell({
  role,
  permissions,
  basePath,
  portalLabel,
  userName,
  alertCount = 0,
  version,
  announcements,
  children,
}: {
  role: string;
  permissions: PermissionKey[];
  basePath: "/admin" | "/super-admin";
  portalLabel: string;
  userName: string;
  alertCount?: number;
  version?: string;
  announcements?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => false);
  const canSee = (item: NavItem) => !item.perm || role === "superadmin" || permissions.includes(item.perm);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);
  const crumbs = crumbsFor(pathname, basePath);

  // Any navigation (link tap, browser back/forward) closes the drawer —
  // otherwise it'd still be open over the new page underneath it.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("admin-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleTheme() {
    const next = !dark;
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage blocked — theme still applies for this page view.
    }
    themeListeners.forEach((l) => l());
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const looksLikePerson = /[a-z]/i.test(q) && !/^(TPM|PNW|STR|ECO)-/i.test(q);
    const target = looksLikePerson && (role === "superadmin" || permissions.includes("users.view")) ? "users" : "transactions";
    router.push(`${basePath}/${target}?q=${encodeURIComponent(q)}`);
    setQuery("");
  }

  const year = new Date().getFullYear();

  return (
    <div className="admin-shell">
      {drawerOpen && <div className="admin-drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside className={`admin-sidebar ${drawerOpen ? "admin-sidebar-open" : ""}`}>
        <Link href={basePath} className="admin-brand">
          <BrandMark size={34} />
          <div className="admin-brand-text">
            <div className="admin-brand-name">
              Top<b>Me</b>
            </div>
            <div className="admin-brand-tag">{portalLabel}</div>
          </div>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={(e) => {
              e.preventDefault();
              setDrawerOpen(false);
            }}
            aria-label="Close navigation"
          >
            <Icon name="x" size={18} stroke={2.2} />
          </button>
        </Link>

        {groups.map((g) => (
          <div key={g.label} className="admin-nav-group">
            <div className="admin-nav-group-label">{g.label}</div>
            {g.items.map((item) => {
              const href = portalHref(item.href, basePath);
              const badge = item.badge === "alerts" && alertCount > 0 ? alertCount : null;
              return (
                <Link key={href} href={href} className={`admin-sidebar-item ${isActive(pathname, href, basePath) ? "active" : ""}`}>
                  <Icon name={item.icon} size={17} stroke={1.75} />
                  <span>{item.label}</span>
                  {badge !== null && <span className="admin-nav-badge">{badge > 99 ? "99+" : badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="admin-sidebar-footer">
          <Link href={`${basePath}/profile`} className="admin-workspace">
            <div className="admin-avatar">{initials(userName)}</div>
            <div className="admin-workspace-text">
              <div className="admin-workspace-name">{userName}</div>
              <div className="admin-workspace-role">{ROLE_LABEL[role] ?? role}</div>
            </div>
            <Icon name="chevronR" size={14} stroke={2} />
          </Link>
          <Link href="/home" className="admin-sidebar-item">
            <Icon name="arrowUpR" size={16} stroke={1.9} />
            <span>Back to TopMe</span>
          </Link>
          <button
            type="button"
            className="admin-sidebar-item admin-sidebar-logout"
            onClick={async () => {
              await signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <Icon name="logout" size={16} stroke={1.9} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button type="button" className="admin-icon-btn admin-hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
              <Icon name="menu" size={20} stroke={2} />
            </button>
            <nav className="admin-crumbs" aria-label="Breadcrumb">
              <Link href={basePath}>{portalLabel}</Link>
              {crumbs.map((c) => (
                <span key={c.href} style={{ display: "contents" }}>
                  <span className="sep">
                    <Icon name="chevronR" size={13} stroke={2} />
                  </span>
                  {c.href === pathname ? <span className="current">{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
                </span>
              ))}
              {crumbs.length === 0 && (
                <>
                  <span className="sep">
                    <Icon name="chevronR" size={13} stroke={2} />
                  </span>
                  <span className="current">Dashboard</span>
                </>
              )}
            </nav>
          </div>
          <div className="admin-topbar-actions">
            <form className="admin-cmd" onSubmit={submitSearch} role="search">
              <Icon name="search" size={14} stroke={2} />
              <input
                id="admin-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reference, phone or email…"
                aria-label="Search"
              />
              <span className="admin-kbd">Ctrl K</span>
            </form>
            <Link href={`${basePath}/operations`} className="admin-icon-btn" aria-label={`${alertCount} items need attention`}>
              <Icon name="bell" size={18} stroke={1.8} />
              {alertCount > 0 && <span className="count">{alertCount > 99 ? "99+" : alertCount}</span>}
            </Link>
            <button type="button" className="admin-icon-btn" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
              <Icon name={dark ? "sun" : "moon"} size={18} stroke={1.8} />
            </button>
            <Link href={`${basePath}/profile`} className="admin-avatar" aria-label="My profile">
              {initials(userName)}
            </Link>
          </div>
        </header>

        <main className="admin-content">
          {announcements}
          {children}
        </main>

        <footer className="admin-footer">
          <div>
            © {year} TopMe · <Link href="/home" style={{ color: "var(--green)", fontWeight: 600, textDecoration: "none" }}>Open customer app</Link>
          </div>
          <div className="admin-footer-meta">
            {version && <span>v{version}</span>}
            <span>{ROLE_LABEL[role]?.toUpperCase() ?? role}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
