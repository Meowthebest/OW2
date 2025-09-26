import { useEffect } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import Overwatch2RandomHeroPickerDuoRoleLock from "@/components/Overwatch2RandomHeroPickerDuoRoleLock";
import { initThemeOnce } from "@/lib/theme";

export default function App() {
  useEffect(() => { initThemeOnce(); }, []);
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded bg-[var(--ow2-orange)]"></div>
            <div className="leading-tight">
              <div className="font-extrabold tracking-tight">OW2 Random Hero Picker</div>
              <div className="text-xs text-muted-foreground">Multiplayer • Role Lock • Local Save</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Overwatch2RandomHeroPickerDuoRoleLock />
      </main>
    </div>
  );
}
