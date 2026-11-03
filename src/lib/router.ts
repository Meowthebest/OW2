import { useEffect, useState } from 'react';

// Hash routes keep deep links working on GitHub Pages, which has no SPA fallback.

export type CareerTab = 'overview' | 'statistics';

export type Route =
  | { view: 'randomizer' }
  | { view: 'heroes' }
  | { view: 'career'; playerId?: string; tab: CareerTab; hero?: string };

function decode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'heroes') return { view: 'heroes' };
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
