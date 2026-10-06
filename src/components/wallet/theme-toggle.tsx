"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

// data-theme lives on <html>, set by the blocking init script before
// hydration (see src/lib/theme-script.ts). Observe the DOM itself instead
// of relying on an in-memory listener set: that remains correct across hot
// reloads, duplicate client bundles, initialization, and storage changes in
// another tab.
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", callback);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", callback);
  };
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
