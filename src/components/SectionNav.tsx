import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BarChart3, Box, CalendarDays, CircleHelp, Gauge, Gem, Newspaper, Package, Shirt, ShoppingBag, Ticket, Tv, UserRound, type LucideIcon } from 'lucide-react';
import type { HubPage, Route } from '../lib/router';
import { cn } from '../lib/format';

export interface SectionLink {
  href: string;
  label: string;
  /** A longer name for the phone menu, where there's room for it. */
  menuLabel?: string;
  Icon: LucideIcon;
  active: (route: Route) => boolean;
  /** Marks the tab while a Twitch campaign is running. */
  live?: boolean;
}

export interface Section {
  id: 'hub' | 'cosmetics';
  title: string;
  /** Where the section's own header link goes. */
  href: string;
  links: SectionLink[];
}

const hubPage = (page: HubPage) => (route: Route) => route.view === 'hub' && route.page === page;

/** The two sections of the site that have several pages, each with a row of tabs across the top of its pages. */
export const SECTIONS: readonly Section[] = [
  {
    id: 'hub',
    title: 'Hub',
    href: '#/events',
    links: [
      { href: '#/events', label: 'Events', menuLabel: 'In-Game Events', Icon: CalendarDays, active: (route) => route.view === 'events' },
      { href: '#/hub/twitch-drops', label: 'Twitch Drops', Icon: Tv, active: hubPage('twitch-drops'), live: true },
      { href: '#/hub/battle-passes', label: 'Battle Passes', Icon: Ticket, active: hubPage('battle-passes') },
      { href: '#/hub/mythics', label: 'Mythics', Icon: Gem, active: hubPage('mythics') },
      { href: '#/hub/drives', label: 'Drives', Icon: Gauge, active: hubPage('drives') },
      { href: '#/hub/stats', label: 'Stats', Icon: BarChart3, active: hubPage('stats') },
      { href: '#/hub/news', label: 'News', Icon: Newspaper, active: hubPage('news') },
      { href: '#/guess', label: 'Guess the Pro', Icon: CircleHelp, active: (route) => route.view === 'guess' },
    ],
  },
  {
    id: 'cosmetics',
    title: 'Cosmetics',
    href: '#/cosmetics',
    links: [
      { href: '#/cosmetics', label: 'Cosmetics', Icon: Shirt, active: (route) => route.view === 'cosmetics' },
      { href: '#/bundles', label: 'Bundles', Icon: Package, active: (route) => route.view === 'bundles' },
      { href: '#/shop', label: 'Shop', Icon: ShoppingBag, active: (route) => route.view === 'shop' },
      { href: '#/loot-pools', label: 'Loot Pools', Icon: Box, active: (route) => route.view === 'loot-pools' },
      { href: '#/collection', label: 'My Collection', Icon: UserRound, active: (route) => route.view === 'collection' },
    ],
  },
];

export const sectionOf = (route: Route) => SECTIONS.find((section) => section.links.some((link) => link.active(route))) ?? null;

const DROPS_URL = `${import.meta.env.VITE_COSMETICS_DATA_URL || `${import.meta.env.BASE_URL}data/cosmetics/`}twitch-drops.json`;
let liveCheck: Promise<boolean> | null = null;

/** Whether a recorded Twitch campaign is running now. Read once a visit; a failure just leaves the tab unmarked. */
function dropsLive(): Promise<boolean> {
  liveCheck ??= Promise.resolve()
    .then(() => fetch(DROPS_URL, { cache: 'no-cache' }))
    .then((response) => (response.ok ? response.json() : []))
    .then((list: unknown) => {
      const now = Date.now();
      return Array.isArray(list) && list.some((campaign: { start?: string; end?: string }) => Date.parse(campaign.start ?? '') <= now && Date.parse(campaign.end ?? '') > now);
    })
    .catch(() => false);
  return liveCheck;
}

function useDropsLive(enabled: boolean) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    void dropsLive().then((value) => current && setLive(value));
    return () => {
      current = false;
    };
  }, [enabled]);
  return live;
}

/** The tabs of the section this page belongs to. On a narrow screen they scroll sideways, with the open one in view. */
export function SectionNav({ route }: { route: Route }) {
  const section = sectionOf(route);
  const live = useDropsLive(section?.id === 'hub');
  const strip = useRef<HTMLDivElement>(null);
  const activeHref = section?.links.find((link) => link.active(route))?.href;

  useLayoutEffect(() => {
    const element = strip.current;
    const active = element?.querySelector<HTMLElement>('.section-nav__link.is-active');
    if (!element || !active || element.scrollWidth <= element.clientWidth) return;
    element.scrollLeft = Math.max(0, active.offsetLeft - (element.clientWidth - active.offsetWidth) / 2);
  }, [activeHref]);

  if (!section) return null;
  return (
    <nav className="section-nav" aria-label={section.title}>
      <div className="section-nav__inner" ref={strip}>
        {section.links.map((link) => {
          const active = link.active(route);
          return (
            <a key={link.href} href={link.href} className={cn('section-nav__link', active && 'is-active')} aria-current={active ? 'page' : undefined}>
              <link.Icon size={16} aria-hidden="true" />
              {link.label}
              {link.live && live && <span className="section-nav__live"><span className="sr-only">, </span>Live<span className="sr-only"> now</span></span>}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
