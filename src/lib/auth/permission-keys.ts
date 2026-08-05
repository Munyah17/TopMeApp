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
