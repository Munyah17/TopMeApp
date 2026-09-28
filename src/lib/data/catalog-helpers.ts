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

// WCAG relative luminance of a hex/rgb color; null when the string can't be
// parsed (var(), gradients, named colors).
function luminance(color: string): number | null {
  const s = color.trim();
  let rgb: [number, number, number] | null = null;
  const hex = s.replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    rgb = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  } else if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    rgb = hex.split("").map((h) => parseInt(h + h, 16)) as [number, number, number];
  } else {
    const m = s.match(/rgba?\((\d+)[^\d]+(\d+)[^\d]+(\d+)/);
    if (m) rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Readable text color for text painted on an arbitrary brand fill. Several
// seeded service/network colors are light (amber #F59E0B, sky #38BDF8, bright
// green #00C853), so the old hardcoded "#fff" rendered white-on-light.
// Whichever of dark/light wins on contrast is returned; anything unparseable
// keeps the previous default of white.
export function textOn(bg: string) {
  const l = luminance(bg);
  return l !== null && l > 0.23 ? "#0f172a" : "#fff";
}

// Softer secondary label on the same fill.
export function mutedOn(bg: string) {
  const l = luminance(bg);
  return l !== null && l > 0.23 ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.75)";
}
