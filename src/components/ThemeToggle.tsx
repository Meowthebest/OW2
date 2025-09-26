// src/components/ThemeToggle.tsx
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";

type Props = { className?: string };

export default function ThemeToggle({ className }: Props) {
  // Initialize from the best guess (storage or system).
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  // Ensure DOM matches state on first mount (no-op if you called initTheme()).
  useEffect(() => {
    applyTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next); // update DOM + persist first
      return next;      // then update React state
    });
  };

  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className={`gap-2 ${className ?? ""}`}
      aria-label={label}
      title={label}
      aria-pressed={theme === "dark" ? true : false}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </span>
    </Button>
  );
}
