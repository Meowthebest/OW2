import { HEROES, ROSTER_SEASON } from '../data/heroes';
import type { Route } from '../lib/router';
import { cn } from '../lib/format';
import { LogoMark } from './icons';

const NAV = [
  { href: '#/', label: 'Randomizer', view: 'randomizer' },
  { href: '#/heroes', label: 'Heroes', view: 'heroes' },
  { href: '#/career', label: 'Career', view: 'career' },
] as const;

export function SiteHeader({ route }: { route: Route }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a href="#/" className="brand" aria-label="OW2 Hero Selector home">
          <LogoMark />
          <span className="brand__text">
            <span className="brand__name">Hero Selector</span>
            <span className="brand__tag">OW2 companion</span>
          </span>
        </a>
        <nav className="site-nav" aria-label="Main">
          {NAV.map((item) => (
            <a key={item.view} href={item.href} className={cn('site-nav__link', route.view === item.view && 'is-active')} aria-current={route.view === item.view ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <p className="site-header__meta">
          <strong>{HEROES.length}</strong> heroes <span aria-hidden="true">·</span> {ROSTER_SEASON} roster
        </p>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span className="brand brand--small"><LogoMark size={22} /><span className="brand__name">Hero Selector</span></span>
        <p>
          Unofficial fan project, not affiliated with or endorsed by Blizzard Entertainment. Overwatch, hero names and artwork are © Blizzard Entertainment.
          {' '}Career data comes from public profiles through the community-run <a href="https://overfast-api.tekrop.fr/" target="_blank" rel="noreferrer">OverFast API</a>.
        </p>
        <a href="https://github.com/Meowthebest/OW2" target="_blank" rel="noreferrer">Source on GitHub</a>
      </div>
    </footer>
  );
}
