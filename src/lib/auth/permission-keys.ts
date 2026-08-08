// Plain constants shared by both server code (RBAC checks) and client
// components (rendering permission checkboxes) — kept separate from
// permissions.ts so client bundles never pull in "server-only".
export const PERMISSION_KEYS = [
  "users.view",
  "users.suspend",
  "staff.manage",
  "transactions.view",
  "transactions.rectify",
  "wallet.adjust",
  "disputes.manage",
  "support.manage",
  "tasks.manage",
  "reports.view",
  "catalog.manage",
  "apis.manage",
  "announcements.manage",
  "settings.manage",
  "flags.manage",
  "audit.view",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABEL: Record<PermissionKey, string> = {
  "users.view": "View customers",
  "users.suspend": "Suspend/reactivate customers",
  "staff.manage": "Manage staff & admins",
  "transactions.view": "View transactions",
  "transactions.rectify": "Rectify transactions",
  "wallet.adjust": "Adjust wallet balances",
  "disputes.manage": "Manage disputes",
  "support.manage": "Manage support tickets",
  "tasks.manage": "Manage tasks",
  "reports.view": "View reports & analytics",
  "catalog.manage": "Manage products & services",
  "apis.manage": "Manage API integrations",
  "announcements.manage": "Manage announcements",
  "settings.manage": "Manage global settings",
  "flags.manage": "Manage feature flags",
  "audit.view": "View audit log",
};

// Grouped for the per-permission toggle UI on /super-admin/staff — mirrors
// the admin sidebar's section groupings so "what this unlocks" is obvious
// at a glance instead of one flat wall of switches.
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: "Operations", keys: ["transactions.view", "transactions.rectify", "wallet.adjust", "disputes.manage", "support.manage", "tasks.manage"] },
  { label: "People", keys: ["users.view", "users.suspend", "staff.manage"] },
  { label: "Platform", keys: ["catalog.manage", "apis.manage", "announcements.manage"] },
  { label: "Insight", keys: ["reports.view", "audit.view"] },
  { label: "Configuration", keys: ["settings.manage", "flags.manage"] },
];
