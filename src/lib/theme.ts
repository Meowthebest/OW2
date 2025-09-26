export type Theme = "light" | "dark";
const KEY = "ow2_theme";

export function getStoredTheme(): Theme {
  const raw = (typeof window !== "undefined" && localStorage.getItem(KEY)) as Theme | null;
  return raw === "light" || raw === "dark" ? raw : "dark";
}

export function applyTheme(next: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  localStorage.setItem(KEY, next);
}
