import { lazy, Suspense, useEffect, useRef } from 'react';
import { SiteFooter, SiteHeader } from './components/SiteChrome';
import { ToastProvider, useToast } from './components/Toast';
import { RandomizerPage } from './features/randomizer/RandomizerPage';
import { useRandomizer } from './features/randomizer/useRandomizer';
import { useRoute } from './lib/router';

const CareerPage = lazy(() => import('./features/career/CareerPage').then((module) => ({ default: module.CareerPage })));
const PatchNotesPage = lazy(() => import('./features/patches/PatchNotesPage').then((module) => ({ default: module.PatchNotesPage })));
const PlayersPage = lazy(() => import('./features/players/PlayersPage').then((module) => ({ default: module.PlayersPage })));
const CosmeticsHub = lazy(() => import('./features/cosmetics/CosmeticsHub').then((module) => ({ default: module.CosmeticsHub })));

const pageFallback = <div className="page"><div className="skeleton skeleton--page" aria-hidden="true"><span /><span /><span /></div></div>;

function Shell() {
  const route = useRoute();
  const toast = useToast();
  // Lives above the router so a spin, filters and history survive a trip to the Career page.
  const randomizer = useRandomizer((message) => toast({ message }));
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.view = route.view;
  }, [route.view]);

  return (
    <>
      <button type="button" className="skip-link" onClick={() => main.current?.focus()}>Skip to content</button>
      <SiteHeader route={route} />
      <main ref={main} tabIndex={-1} className="site-main">
        {route.view === 'career' ? (
          <Suspense fallback={pageFallback}>
            <CareerPage route={route} />
          </Suspense>
        ) : route.view === 'patches' ? (
          <Suspense fallback={pageFallback}>
            <PatchNotesPage route={route} />
          </Suspense>
        ) : route.view === 'players' ? (
          <Suspense fallback={pageFallback}>
            <PlayersPage route={route} />
          </Suspense>
        ) : route.view === 'cosmetics' || route.view === 'bundles' || route.view === 'shop' || route.view === 'loot-pools' || route.view === 'hub' || route.view === 'collection' || route.view === 'events' ? (
          <Suspense fallback={pageFallback}>
            <CosmeticsHub route={route} />
          </Suspense>
        ) : (
          <RandomizerPage api={randomizer} focusRoster={route.view === 'heroes'} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
