// Search and filters for the bundles page.
import { normalizeText } from './text';
import type { Bundle, CosmeticType } from './types';
import { COSMETIC_TYPES } from './types';

export type BundleStatusFilter = 'active' | 'previous' | 'all';
export type BundleSort = 'newest' | 'name' | 'price-low' | 'price-high' | 'items';

export interface BundleFilters {
  q: string;
  status: BundleStatusFilter;
  hero: string;
  season: string;
  type: CosmeticType | 'all';
  min: number | null;
  max: number | null;
  sort: BundleSort;
  page: number;
}

export const DEFAULT_BUNDLE_FILTERS: BundleFilters = { q: '', status: 'active', hero: 'all', season: 'all', type: 'all', min: null, max: null, sort: 'newest', page: 1 };

export const BUNDLE_PAGE_SIZE = 24;

const TYPE_IDS: readonly string[] = COSMETIC_TYPES.map((type) => type.id);
const SORTS: readonly string[] = ['newest', 'name', 'price-low', 'price-high', 'items'];

function positive(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseBundleFilters(query: string): BundleFilters {
  const params = new URLSearchParams(query);
  const status = params.get('status');
  const type = params.get('type');
  const sort = params.get('sort');
  const page = Number(params.get('page'));
  const slug = (value: string | null) => (value && /^[a-z0-9-]{1,60}$/.test(value) ? value : 'all');
  return {
    q: (params.get('q') ?? '').slice(0, 80),
    status: status === 'previous' || status === 'all' ? status : 'active',
    hero: slug(params.get('hero')),
    season: slug(params.get('season')),
    type: type && TYPE_IDS.includes(type) ? (type as CosmeticType) : 'all',
    min: positive(params.get('min')),
    max: positive(params.get('max')),
    sort: sort && SORTS.includes(sort) ? (sort as BundleSort) : 'newest',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function serializeBundleFilters(filters: BundleFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status !== 'active') params.set('status', filters.status);
  if (filters.hero !== 'all') params.set('hero', filters.hero);
  if (filters.season !== 'all') params.set('season', filters.season);
  if (filters.type !== 'all') params.set('type', filters.type);
  if (filters.min !== null) params.set('min', String(filters.min));
  if (filters.max !== null) params.set('max', String(filters.max));
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

/** Prices in different currencies can't be compared, so the price filter and sort use Coins only. */
export const bundleCoins = (bundle: Bundle) => (bundle.price && /^coins$/i.test(bundle.price.currency) ? bundle.price.amount : null);

export function applyBundleFilters(bundles: readonly Bundle[], filters: BundleFilters) {
  const words = normalizeText(filters.q).split(' ').filter(Boolean);
  const filtered = bundles.filter((bundle) => {
    if (filters.status !== 'all' && bundle.status !== filters.status) return false;
    if (filters.hero !== 'all' && !bundle.heroes.includes(filters.hero)) return false;
    if (filters.season !== 'all' && bundle.season !== filters.season) return false;
    if (filters.type !== 'all' && !bundle.types.includes(filters.type)) return false;
    if (filters.min !== null || filters.max !== null) {
      const coins = bundleCoins(bundle);
      if (coins === null) return false;
      if (filters.min !== null && coins < filters.min) return false;
      if (filters.max !== null && coins > filters.max) return false;
    }
    if (words.length > 0) {
      const name = normalizeText(bundle.name);
      if (!words.every((word) => name.includes(word))) return false;
    }
    return true;
  });
  const byName = (a: Bundle, b: Bundle) => a.name.localeCompare(b.name);
  const known = (a: number | null, b: number | null, direction: 1 | -1) => {
    if (a === null || b === null) return Number(a === null) - Number(b === null);
    return (a - b) * direction;
  };
  const compare: Record<BundleSort, (a: Bundle, b: Bundle) => number> = {
    newest: (a, b) => known(a.productId, b.productId, -1) || byName(a, b),
    name: byName,
    'price-low': (a, b) => known(bundleCoins(a), bundleCoins(b), 1) || byName(a, b),
    'price-high': (a, b) => known(bundleCoins(a), bundleCoins(b), -1) || byName(a, b),
    items: (a, b) => Math.max(b.statedCount ?? 0, b.items.length) - Math.max(a.statedCount ?? 0, a.items.length) || byName(a, b),
  };
  return filtered.sort(compare[filters.sort]);
}
