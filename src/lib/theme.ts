// src/lib/theme.ts
// Minimal, robust theme utilities for a Tailwind app using `darkMode: "class"`.

export type Theme = "light" | "dark";

const KEY = "ow2_theme";

/** Detect the user's current OS color scheme. */
export function detectSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Read a previously saved theme. Returns null if none or invalid. */
export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

/** Best initial theme: saved one or (first visit) system preference. */
export function getInitialTheme(): Theme {
  return getStoredTheme() ?? detectSystemTheme();
}

/** Apply theme to the <html> element and persist it. */
export function applyTheme(next: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Keep only one of these classes for Tailwind’s dark mode.
  root.classList.remove("light", "dark");
  root.classList.add(next);

  // Optional: useful for CSS hooks or analytics.
  root.setAttribute("data-theme", next);

  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
}

/**
 * Call this ONCE before your app renders (e.g., in src/main.tsx),
 * to avoid a brief flash of the wrong theme.
 */
export function initTheme(): void {
  applyTheme(getInitialTheme());
}
