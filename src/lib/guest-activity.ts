const STORAGE_KEY = "topme_guest_recent";
const MAX_ENTRIES = 10;

export interface GuestActivityEntry {
  reference: string;
  serviceName: string;
  amount: number;
  recipient: string;
  createdAt: string;
}

export function getGuestActivity(): GuestActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addGuestActivity(entry: GuestActivityEntry) {
  if (typeof window === "undefined") return;
  try {
    const existing = getGuestActivity().filter((e) => e.reference !== entry.reference);
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing, quota) — not worth surfacing.
  }
}
