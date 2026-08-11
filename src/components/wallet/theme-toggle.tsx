"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

// data-theme lives on <html>, set by the blocking init script before
// hydration (see src/lib/theme-script.ts) and mutated directly by toggle()
// below — neither goes through React, so useSyncExternalStore (not
// state+effect) is the correct way to read it: getServerSnapshot matches
// what the server actually rendered (always light), and React reconciles
// to the real client value right after hydration with no mismatch warning.
const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}
function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !dark;
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing / storage blocked — the toggle still works for
      // this page view, it just won't be remembered next visit.
    }
    listeners.forEach((l) => l());
  }

  return (
    <div className={`toggle ${dark ? "on" : ""} tap`} role="switch" aria-checked={dark} onClick={toggle}>
      <div className="knob" />
    </div>
  );
}
