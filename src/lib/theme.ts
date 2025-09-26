export type Theme = "light" | "dark";
const KEY = "ow2_theme";

export function detectSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function getInitialTheme(): Theme {
  return getStoredTheme() ?? detectSystemTheme();
}

export function applyTheme(next: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.setAttribute("data-theme", next);
  try { localStorage.setItem(KEY, next); } catch {}
}

/** Optional: call in main.tsx before React mounts to avoid flash */
export function initTheme(): void {
  applyTheme(getInitialTheme());
}
