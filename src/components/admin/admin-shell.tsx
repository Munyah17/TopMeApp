"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import type { PermissionKey } from "@/lib/auth/permission-keys";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  perm?: PermissionKey;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { label: "Cockpit", items: [{ label: "Main Instruments", href: "/admin", icon: "grid" }] },
  {
    label: "Operations",
    items: [
      { label: "Operations Center", href: "/admin/operations", icon: "zap", perm: "transactions.view" },
      { label: "Transactions", href: "/admin/transactions", icon: "wallet", perm: "transactions.view" },
      { label: "Disputes", href: "/admin/disputes", icon: "shield", perm: "disputes.manage" },
      { label: "Support Tickets", href: "/admin/support", icon: "headset", perm: "support.manage" },
      { label: "Tasks", href: "/admin/tasks", icon: "ticket", perm: "tasks.manage" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Users", href: "/admin/users", icon: "users", perm: "users.view" },
      { label: "Staff & Access", href: "/admin/staff", icon: "user", perm: "staff.manage" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Products & Services", href: "/admin/products", icon: "grid", perm: "catalog.manage" },
      { label: "APIs Management", href: "/admin/apis", icon: "plug", perm: "apis.manage" },
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
      { label: "My Profile", href: "/admin/profile", icon: "user" },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin" };

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminShell({
  role,
  permissions,
  announcements,
  children,
}: {
  role: string;
  permissions: PermissionKey[];
  announcements?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const canSee = (item: NavItem) => !item.perm || role === "superadmin" || permissions.includes(item.perm);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);
  const allItems = groups.flatMap((g) => g.items);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div style={{ fontWeight: 800, fontSize: 15 }}>Command Center</div>
          <span
            style={{
              background: role === "superadmin" ? "#F3EEFE" : "#EAF8FF",
              color: role === "superadmin" ? "#8B5CF6" : "#38BDF8",
              fontSize: 10,
              fontWeight: 800,
              padding: "4px 9px",
              borderRadius: 7,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {ROLE_LABEL[role] ?? role}
          </span>
        </div>
        {groups.map((g) => (
          <div key={g.label} className="admin-nav-group">
            <div className="admin-nav-group-label">{g.label}</div>
            {g.items.map((item) => (
              <Link key={item.href} href={item.href} className={`admin-sidebar-item ${isActive(pathname, item.href) ? "active" : ""}`}>
                <Icon name={item.icon} size={16} stroke={1.9} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
        <Link href="/home" className="admin-sidebar-item admin-sidebar-exit">
          <Icon name="logout" size={16} stroke={1.9} />
          <span>Back to TopMe</span>
        </Link>
      </aside>

      <div className="admin-tabstrip">
        {allItems.map((item) => (
          <Link key={item.href} href={item.href} className={`chip tap admin-tabstrip-item ${isActive(pathname, item.href) ? "selected" : ""}`}>
            <Icon name={item.icon} size={14} stroke={2} /> {item.label}
          </Link>
        ))}
      </div>

      <div className="admin-content">
        {announcements}
        {children}
      </div>
    </div>
  );
}
