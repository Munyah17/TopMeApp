export function fmt(n: number) {
  return "$" + Math.abs(n).toFixed(2);
}

export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

// Maps a domain status string to a .status-badge pill variant — keeps every
// list and detail page colouring the same word the same way.
export function statusTone(status: string): StatusTone {
  switch (status) {
    case "success":
    case "fulfilled":
    case "resolved":
    case "active":
    case "completed":
    case "paid":
    case "delivered":
    case "approved":
      return "success";
    case "pending":
    case "open":
    case "invited":
    case "requested":
    case "simulated":
    case "awaiting delivery":
      return "warning";
    case "failed":
    case "rejected":
    case "cancelled":
    case "disputed":
      return "error";
    case "investigating":
    case "in_progress":
    case "processing":
      return "info";
    default:
      return "neutral";
  }
}

export function shade(hex: string, percent: number) {
  const c = hex.replace("#", "");
  let r = parseInt(c.substring(0, 2), 16);
  let g = parseInt(c.substring(2, 4), 16);
  let b = parseInt(c.substring(4, 6), 16);
  r = Math.min(255, Math.max(0, Math.round(r + (r * percent) / 100)));
  g = Math.min(255, Math.max(0, Math.round(g + (g * percent) / 100)));
  b = Math.min(255, Math.max(0, Math.round(b + (b * percent) / 100)));
  return `rgb(${r},${g},${b})`;
}

export function hexA(hex: string, a: number) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
