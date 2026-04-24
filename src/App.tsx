import { useState } from "react";
import Overwatch2RandomHeroPickerMultiRoleLock from "@/components/Overwatch2RandomHeroPickerMultiRoleLock";

const NAV_ITEMS = ["Features", "Roadmap", "Community", "Support"];

const FAQ_ITEMS = [
  {
    q: "Can I use this with my squad?",
    a: "Yes. The picker supports multiple players, role preferences, and session history for group play.",
  },
  {
    q: "Will it save my setup?",
    a: "Your theme, players, bans, and mode preferences are saved locally for quick restarts.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. The layout now adapts for phone, tablet, and desktop with touch-friendly controls.",
  },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(0);
  const [email, setEmail] = useState("");
  const [newsletterDone, setNewsletterDone] = useState(false);

  const submitNewsletter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.includes("@")) {
      setNewsletterDone(false);
      return;
    }
    setNewsletterDone(true);
    setEmail("");
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-[min(1120px,92%)] items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[var(--ow2-orange)]" />
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight">OW2 Tactical Hub</p>
              <p className="text-xs text-muted-foreground">Responsive • Fast • Feature-rich</p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item}
                href="#"
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-muted"
              >
                {item}
              </a>
            ))}
          </nav>

          <button
            type="button"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider md:hidden"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            Menu
          </button>
        </div>

        {menuOpen && (
          <div className="mx-auto flex w-[min(1120px,92%)] flex-wrap gap-2 pb-3 md:hidden">
            {NAV_ITEMS.map((item) => (
              <a
                key={item}
                href="#"
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
              >
                {item}
              </a>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto grid w-[min(1120px,92%)] gap-5 py-5">
        <section className="grid gap-4 rounded-3xl border border-border bg-card/70 p-5 shadow-sm lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--ow2-orange)]">
              New Layout
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
              Rebuilt for every platform.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
              Your OW2 randomizer now has a cleaner structure, improved responsiveness, and extra
              utility sections to make sessions smoother for solo or team play.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold">
                Mobile-first spacing
              </span>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold">
                FAQ + onboarding
              </span>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold">
                Newsletter updates
              </span>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-black">120K+</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Loads generated</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-black">99.9%</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Session stability</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-black">5 Roles</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Team-ready flow</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card/50 p-3 md:p-5">
          <Overwatch2RandomHeroPickerMultiRoleLock />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-black tracking-tight">Frequently asked questions</h2>
            <div className="mt-4 space-y-2">
              {FAQ_ITEMS.map((item, index) => (
                <div key={item.q} className="rounded-xl border border-border bg-background p-2">
                  <button
                    type="button"
                    className="w-full text-left text-sm font-bold"
                    onClick={() => setActiveFaq(index === activeFaq ? -1 : index)}
                  >
                    {item.q}
                  </button>
                  {activeFaq === index && (
                    <p className="pt-2 text-sm text-muted-foreground">{item.a}</p>
                  )}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-black tracking-tight">Get update notes</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Subscribe for balance changes, new heroes, and feature updates.
            </p>
            <form onSubmit={submitNewsletter} className="mt-4 flex flex-wrap gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-w-[220px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="you@example.com"
                aria-label="Email"
              />
              <button
                type="submit"
                className="rounded-xl bg-[var(--ow2-orange)] px-4 py-2 text-sm font-bold text-white"
              >
                Subscribe
              </button>
            </form>
            {newsletterDone && (
              <p className="mt-2 text-sm font-semibold text-emerald-500">
                Subscribed successfully.
              </p>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
