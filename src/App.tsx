import Overwatch2RandomHeroPickerMultiRoleLock from "@/components/Overwatch2RandomHeroPickerMultiRoleLock";

export default function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-border
                          bg-gradient-to-b from-background/85 to-background/55
                          backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded bg-[var(--ow2-orange)]" />
            <div className="leading-tight">
              <div className="font-extrabold tracking-tight">OW2 Random Hero Picker</div>
              <div className="text-xs text-muted-foreground">Multiplayer • Role Lock • Local Save</div>
            </div>
          </div>
          <div />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Overwatch2RandomHeroPickerMultiRoleLock />
      </main>
    </div>
  );
}
