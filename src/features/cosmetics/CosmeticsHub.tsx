import { useEffect, useRef } from 'react';
import { useToast } from '../../components/Toast';
import { navigate, type Route } from '../../lib/router';
import { idsOf } from './core/collection';
import { loadCatalog, loadDrops, loadMeta } from './data';
import { BattlePassDetailPage, BattlePassesPage } from './pages/BattlePassesPage';
import { BundleDetailPage, BundlesPage } from './pages/BundlesPage';
import { CollectionPage } from './pages/CollectionPage';
import { CosmeticDetailPage, CosmeticsPage } from './pages/CosmeticsPage';
import { DropsPage, dropNotifyId } from './pages/DropsPage';
import { LootPoolDetailPage, LootPoolsPage } from './pages/LootPoolsPage';
import { MythicDetailPage, MythicsPage } from './pages/MythicsPage';
import { ShopPage } from './pages/ShopPage';
import { StatsPage } from './pages/StatsPage';
import { readJson, writeJson } from '../../lib/storage';
import { getEntries } from './useCollection';

const ALERTS_SEEN_KEY = 'ow2.alerts.seen.v1';
const REMINDER_DAYS = 3;

/** Tells a visitor, once per shop or campaign, when something they asked about is available or ending. */
function useAvailabilityAlerts() {
  const toast = useToast();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const watching = idsOf(getEntries(), 'notify');
    if (watching.length === 0) return;
    const ids = new Set(watching);
    void (async () => {
      const [meta, rows, campaigns] = await Promise.all([loadMeta(), loadCatalog(), loadDrops()]);
      const seen = readJson<Record<string, string>>(ALERTS_SEEN_KEY) ?? {};
      const inShop = rows.filter((row) => ids.has(row.id) && row.availability === 'in-shop');
      const now = Date.now();
      const ending = campaigns.filter((campaign) => {
        const end = Date.parse(campaign.end);
        return ids.has(dropNotifyId(campaign.id)) && end > now && end - now < REMINDER_DAYS * 86400000 && seen[campaign.id] !== 'told';
      });
      const shopKey = inShop.map((row) => row.id).sort().join('|');
      const newInShop = inShop.length > 0 && seen.shop !== `${meta.counts.rotations}:${shopKey}`;
      if (!newInShop && ending.length === 0) return;
      const message = newInShop
        ? `${inShop.length === 1 ? `${inShop[0].name} is` : `${inShop.length} cosmetics you're watching are`} in the shop now.`
        : `${ending.length === 1 ? `Twitch campaign "${ending[0].name}" ends` : `${ending.length} Twitch campaigns you're watching end`} within ${REMINDER_DAYS} days.`;
      toast({ message, actionLabel: 'View', onAction: () => navigate(newInShop ? '#/collection?tab=alerts' : '#/hub/twitch-drops') });
      writeJson(ALERTS_SEEN_KEY, { ...seen, shop: `${meta.counts.rotations}:${shopKey}`, ...Object.fromEntries(ending.map((campaign) => [campaign.id, 'told'])) });
    })().catch(() => undefined);
  }, [toast]);
}

const listPositions = new Map<string, number>();

/** Puts a new page at the top, while a change of filters stays where it is. Coming back to a list returns to your place in it. */
function useScrollPlace(key: string, isList: boolean) {
  const current = useRef(key);
  const changedAt = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      // The browser moves the page by itself as the old content is replaced, which isn't the visitor scrolling.
      if (Date.now() - changedAt.current > 400) listPositions.set(current.current, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (current.current === key) return undefined;
    current.current = key;
    changedAt.current = Date.now();
    const saved = isList ? listPositions.get(key) : undefined;
    window.scrollTo(0, 0);
    if (!saved) return undefined;
    // The list's data is already in memory, so it renders a moment later.
    const timer = window.setTimeout(() => window.scrollTo(0, saved), 60);
    return () => window.clearTimeout(timer);
  }, [key, isList]);
}

const pageKey = (route: Route) => {
  switch (route.view) {
    case 'cosmetics':
    case 'bundles':
      return `${route.view}/${route.id ?? ''}`;
    case 'loot-pools':
      return `${route.view}/${route.slug ?? ''}`;
    case 'hub':
      return `hub/${route.page}/${route.id ?? ''}`;
    default:
      return route.view;
  }
};

/** Every page in the cosmetics section. They load together, and none of it loads until someone opens one. */
export function CosmeticsHub({ route }: { route: Route }) {
  useAvailabilityAlerts();
  const key = pageKey(route);
  useScrollPlace(key, key.endsWith('/') || !key.includes('/'));

  // A fresh object on every hash change, which tells filter state a link was followed.
  switch (route.view) {
    case 'cosmetics':
      return route.id ? <CosmeticDetailPage key={route.id} id={route.id} /> : <CosmeticsPage query={route.query} routeKey={route} />;
    case 'bundles':
      return route.id ? <BundleDetailPage key={route.id} id={route.id} /> : <BundlesPage query={route.query} routeKey={route} />;
    case 'shop':
      return <ShopPage query={route.query} routeKey={route} />;
    case 'loot-pools':
      return route.slug ? <LootPoolDetailPage key={route.slug} slug={route.slug} query={route.query} routeKey={route} /> : <LootPoolsPage />;
    case 'collection':
      return <CollectionPage query={route.query} routeKey={route} />;
    case 'hub':
      if (route.page === 'mythics') return route.id ? <MythicDetailPage key={route.id} id={route.id} /> : <MythicsPage query={route.query} routeKey={route} />;
      if (route.page === 'battle-passes') return route.id ? <BattlePassDetailPage key={route.id} id={route.id} /> : <BattlePassesPage />;
      if (route.page === 'twitch-drops') return <DropsPage />;
      return <StatsPage query={route.query} routeKey={route} />;
    default:
      return null;
  }
}
