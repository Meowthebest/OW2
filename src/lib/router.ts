import { useEffect, useState } from 'react';

// Hash routes keep deep links working on GitHub Pages, which has no SPA fallback.

export type CareerTab = 'overview' | 'statistics';

/** The query holds shareable filters, as in #/patches?balance=nerf&role=tank. */
export type PatchRoute = { view: 'patches'; tab: 'changes' | 'history'; query: string };

export type PlayersRoute = { view: 'players'; query: string };

export type HubPage = 'mythics' | 'battle-passes' | 'twitch-drops' | 'stats';

/** Everything in the cosmetics section. As with patches, the query holds shareable filters. */
export type CosmeticsRoute =
  | { view: 'cosmetics'; id?: string; query: string }
  | { view: 'bundles'; id?: string; query: string }
  | { view: 'shop'; query: string }
  | { view: 'loot-pools'; slug?: string; query: string }
  | { view: 'hub'; page: HubPage; id?: string; query: string }
  | { view: 'collection'; query: string }
  | { view: 'events'; query: string };

export type Route =
  | { view: 'randomizer' }
  | { view: 'heroes' }
  | { view: 'guess' }
  | { view: 'career'; playerId?: string; tab: CareerTab; hero?: string }
  | PatchRoute
  | PlayersRoute
  | CosmeticsRoute;

function decode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const mark = raw.indexOf('?');
  const parts = (mark === -1 ? raw : raw.slice(0, mark)).split('/').filter(Boolean);
  if (parts[0] === 'heroes') return { view: 'heroes' };
  if (parts[0] === 'guess') return { view: 'guess' };
  const query = mark === -1 ? '' : raw.slice(mark + 1);
  if (parts[0] === 'cosmetics') return { view: 'cosmetics', id: parts[1] ? decode(parts[1]) : undefined, query };
  if (parts[0] === 'bundles') return { view: 'bundles', id: parts[1] ? decode(parts[1]) : undefined, query };
  if (parts[0] === 'shop') return { view: 'shop', query };
  if (parts[0] === 'loot-pools') return { view: 'loot-pools', slug: parts[1] ? decode(parts[1]) : undefined, query };
  if (parts[0] === 'collection') return { view: 'collection', query };
  if (parts[0] === 'events') return { view: 'events', query };
  if (parts[0] === 'hub') {
    const page: HubPage = parts[1] === 'mythics' || parts[1] === 'battle-passes' || parts[1] === 'twitch-drops' ? parts[1] : 'stats';
    return { view: 'hub', page, id: parts[2] ? decode(parts[2]) : undefined, query };
  }
  if (parts[0] === 'players') return { view: 'players', query: mark === -1 ? '' : raw.slice(mark + 1) };
  if (parts[0] === 'patches') {
    return { view: 'patches', tab: parts[1] === 'history' ? 'history' : 'changes', query: mark === -1 ? '' : raw.slice(mark + 1) };
  }
  if (parts[0] === 'career') {
    const playerId = parts[1] ? decode(parts[1]) : undefined;
    return {
      view: 'career',
      playerId,
      tab: parts[2] === 'statistics' ? 'statistics' : 'overview',
      hero: parts[3] ? decode(parts[3]) : undefined,
    };
  }
  return { view: 'randomizer' };
}

export function careerHref(playerId?: string, tab: CareerTab = 'overview', hero?: string) {
  if (!playerId) return '#/career';
  const base = '#/career/' + encodeURIComponent(playerId);
  if (tab === 'overview') return base;
  return base + '/statistics' + (hero ? '/' + encodeURIComponent(hero) : '');
}

export function navigate(href: string, options: { replace?: boolean } = {}) {
  if (options.replace) window.location.replace(href);
  else window.location.hash = href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}
