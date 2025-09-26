// Simple theme controller (dark / light) using localStorage + <html class="dark">
const KEY = "ow2_theme"; // "dark" | "light"

export type Theme = "dark" | "light";

export function getStoredTheme(): Theme {
  const t = (localStorage.getItem(KEY) as Theme) || "dark";
  return t === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  localStorage.setItem(KEY, t);
}

export function initThemeOnce() {
  const t = getStoredTheme();
  applyTheme(t);
}
