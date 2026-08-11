// Runs synchronously in <head>, before hydration — sets data-theme="dark"
// on <html> immediately if that's the resolved theme, so the page never
// paints light-then-flips-dark. Light stays the unmarked default (no
// attribute needed, since :root's base tokens are already the light
// palette — see globals.css).
//
// Resolution order: an explicit saved choice (the user manually toggled
// at some point) always wins; otherwise fall back to the OS/browser's
// prefers-color-scheme, so a device already in dark mode gets dark on
// first visit without the user having to do anything.
export const THEME_STORAGE_KEY = "topme-theme";

export const themeInitScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=s==="dark"||s==="light"?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;
