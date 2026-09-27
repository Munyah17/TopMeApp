"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

// data-theme lives on <html>, set by the blocking init script before
// hydration (see src/lib/theme-script.ts) and mutated directly by
// toggleTheme() below — neither goes through React, so useSyncExternalStore
// (not state+effect) is the correct way to read it: getServerSnapshot
// matches what the server actually rendered (always light), and React
// reconciles to the real client value right after hydration with no
// mismatch warning.
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

export function useDarkTheme() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function toggleTheme() {
  const next = !getSnapshot();
  document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
  } catch {
    // Private browsing / storage blocked — the toggle still works for
    // this page view, it just won't be remembered next visit.
  }
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const dark = useDarkTheme();

  return (
    <div className={`toggle ${dark ? "on" : ""} tap`} role="switch" aria-checked={dark} onClick={toggleTheme}>
      <div className="knob" />
    </div>
  );
}

// Sun/moon icon button for the app header — the always-visible switch, so
// theme isn't buried in /account#appearance.
export function ThemeIconButton() {
  const dark = useDarkTheme();
  return (
    <button
      type="button"
      className="header-icon-btn tap"
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Icon name={dark ? "sun" : "moon"} size={17} />
    </button>
  );
}
