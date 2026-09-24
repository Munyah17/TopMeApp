import type { PermissionKey } from "@/lib/auth/permission-keys";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  perm?: PermissionKey;
  badge?: "alerts";
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
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
      { label: "User Management", href: "/admin/users", icon: "users", perm: "users.view" },
      { label: "Staff Management", href: "/admin/staff", icon: "user", perm: "staff.manage" },
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

// NAV hrefs are authored against "/admin" and rewritten to whichever portal
// is actually mounted — /admin for staff, /super-admin for the owner's own
// console (see src/app/admin/layout.tsx and src/app/super-admin/layout.tsx).
// Keeping one nav table instead of two means the two portals can't drift.
export function portalHref(href: string, basePath: string) {
  return href === "/admin" ? basePath : basePath + href.slice("/admin".length);
}
