import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { HEROES, ROSTER_SEASON } from '../data/heroes';
import type { Route } from '../lib/router';
import { cn } from '../lib/format';
import { LogoMark } from './icons';
import { SECTIONS, sectionOf, type SectionLink } from './SectionNav';

const NAV: ReadonlyArray<{ href: string; label: string; short?: string; view: Route['view'] }> = [
  { href: '#/', label: 'Randomizer', short: 'Random', view: 'randomizer' },
  { href: '#/heroes', label: 'Heroes', view: 'heroes' },
  { href: '#/career', label: 'Career', view: 'career' },
  { href: '#/patches', label: 'Patch Notes', short: 'Patches', view: 'patches' },
  { href: '#/players', label: 'Players', view: 'players' },
];

const linksOf = (id: 'hub' | 'cosmetics') => SECTIONS.find((section) => section.id === id)?.links ?? [];
const isCollection = (link: SectionLink) => link.href === '#/collection';

/** The phone menu, where there's no room for the two section links. It holds the same pages as the section tabs. */
const HUB_GROUPS: ReadonlyArray<{ title: string; links: readonly SectionLink[] }> = [
  { title: 'Cosmetics', links: linksOf('cosmetics').filter((link) => !isCollection(link)) },
  { title: 'Hub', links: linksOf('hub') },
  { title: 'Yours', links: linksOf('cosmetics').filter(isCollection) },
];

function HubMenu({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const inHub = HUB_GROUPS.some((group) => group.links.some((link) => link.active(route)));

  const shownRoute = useRef(route);
  useEffect(() => {
    if (shownRoute.current === route) return;
    shownRoute.current = route;
    setOpen(false);
  }, [route]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="cx-nav" ref={root}>
      <button ref={button} type="button" className={cn('site-nav__link cx-nav__button', inHub && 'is-active')} aria-expanded={open} aria-controls="cx-nav-panel" aria-label="Cosmetics and hub menu" onClick={() => setOpen((value) => !value)}>
        <span className="site-nav__full">Cosmetics</span>
        <span className="site-nav__short">Hub</span>
        <ChevronDown size={14} aria-hidden="true" className="cx-nav__chevron" />
      </button>
      <div className="cx-nav__panel" id="cx-nav-panel" hidden={!open}>
        {HUB_GROUPS.map((group) => (
          <div key={group.title} className="cx-nav__group">
            <p className="cx-nav__title">{group.title}</p>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={cn('cx-nav__link', link.active(route) && 'is-active')} aria-current={link.active(route) ? 'page' : undefined} onClick={() => setOpen(false)}>{link.menuLabel ?? link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

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
            <a key={item.view} href={item.href} className={cn('site-nav__link', route.view === item.view && 'is-active')} aria-current={route.view === item.view ? 'page' : undefined} aria-label={item.short ? item.label : undefined}>
              {item.short ? (
                <>
                  <span className="site-nav__full">{item.label}</span>
                  <span className="site-nav__short">{item.short}</span>
                </>
              ) : (
                item.label
              )}
            </a>
          ))}
          {SECTIONS.map((section) => {
            const active = sectionOf(route)?.id === section.id;
            return (
              <a key={section.id} href={section.href} className={cn('site-nav__link site-nav__section', active && 'is-active')} aria-current={active ? 'true' : undefined}>
                {section.title}
              </a>
            );
          })}
          <HubMenu route={route} />
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
          {' '}Patch data is drawn from <a href="https://overwatch.blizzard.com/en-us/news/patch-notes/" target="_blank" rel="noreferrer">Blizzard's published patch notes</a>.
          {' '}Player counts come from the Steam Web API, cover Steam players only and are provided as is. Not affiliated with or endorsed by Valve or Steam.
          {' '}Shop data is from <a href="https://itemshop.gg/overwatch" target="_blank" rel="noreferrer">itemshop.gg</a>.
        </p>
        <a href="https://github.com/Meowthebest/OW2" target="_blank" rel="noreferrer">Source on GitHub</a>
      </div>
    </footer>
  );
}
