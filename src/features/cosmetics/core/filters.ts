// Search, filters and sorting for the cosmetics gallery. Filters combine with AND and live in the URL.
import { HEROES, type Role } from '../../../data/heroes';
import { normalizeText } from './text';
import { COSMETIC_TYPES, RARITY_RANK, RARITIES, type CatalogRow, type CosmeticType, type Currency, type Rarity } from './types';

export type AvailabilityFilter = 'all' | 'in-shop' | 'previous' | 'never-seen' | 'gallery';
export type MineFilter = 'all' | 'owned' | 'unowned' | 'wishlist' | 'favorites';
export type SortKey = 'newest' | 'oldest' | 'name' | 'rarity' | 'price-low' | 'price-high' | 'last-seen';
export type ViewMode = 'grid' | 'list';
export type PriceCurrency = Extract<Currency, 'coins' | 'credits'>;

export interface CosmeticFilters {
  q: string;
  type: CosmeticType | 'all';
  rarity: Rarity | 'all';
  hero: string;
  role: Role | 'all';
  availability: AvailabilityFilter;
  battlePass: boolean;
  esports: boolean;
  limited: boolean;
  pool: string;
  event: string;
  season: string;
  mine: MineFilter;
  currency: PriceCurrency;
  min: number | null;
  max: number | null;
  sort: SortKey;
  view: ViewMode;
  page: number;
}

export const DEFAULT_FILTERS: CosmeticFilters = {
  q: '',
  type: 'all',
  rarity: 'all',
  hero: 'all',
  role: 'all',
  availability: 'all',
  battlePass: false,
  esports: false,
  limited: false,
  pool: 'all',
  event: 'all',
  season: 'all',
  mine: 'all',
  currency: 'coins',
  min: null,
  max: null,
  sort: 'newest',
  view: 'grid',
  page: 1,
};

export const PAGE_SIZE = 48;

const TYPE_IDS: readonly string[] = COSMETIC_TYPES.map((type) => type.id);
const RARITY_IDS: readonly string[] = RARITIES.map((rarity) => rarity.id);
const ROLES: readonly string[] = ['tank', 'damage', 'support'];
const AVAILABILITY: readonly string[] = ['all', 'in-shop', 'previous', 'never-seen', 'gallery'];
const MINE: readonly string[] = ['all', 'owned', 'unowned', 'wishlist', 'favorites'];
const SORTS: readonly string[] = ['newest', 'oldest', 'name', 'rarity', 'price-low', 'price-high', 'last-seen'];

const oneOf = <T extends string>(value: string | null, allowed: readonly string[], fallback: T): T => (value !== null && allowed.includes(value) ? (value as T) : fallback);
const slugOr = (value: string | null, fallback: string) => (value && /^[a-z0-9-]{1,60}$/.test(value) ? value : fallback);

function positive(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Reads filters from a URL. Anything unrecognized falls back to its default, so old links keep working. */
export function parseFilters(query: string): CosmeticFilters {
  const params = new URLSearchParams(query);
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').slice(0, 80),
    type: oneOf(params.get('type'), TYPE_IDS, 'all'),
    rarity: oneOf(params.get('rarity'), RARITY_IDS, 'all'),
    hero: slugOr(params.get('hero'), 'all'),
    role: oneOf(params.get('role'), ROLES, 'all'),
    availability: oneOf(params.get('availability'), AVAILABILITY, 'all'),
    battlePass: params.get('bp') === '1',
    esports: params.get('esports') === '1',
    limited: params.get('limited') === '1',
    pool: slugOr(params.get('pool'), 'all'),
    event: slugOr(params.get('event'), 'all'),
    season: slugOr(params.get('season'), 'all'),
    mine: oneOf(params.get('mine'), MINE, 'all'),
    currency: params.get('currency') === 'credits' ? 'credits' : 'coins',
    min: positive(params.get('min')),
    max: positive(params.get('max')),
    sort: oneOf(params.get('sort'), SORTS, 'newest'),
    view: params.get('view') === 'list' ? 'list' : 'grid',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Writes only what differs from the defaults, so a shared link stays short. */
export function serializeFilters(filters: CosmeticFilters) {
  const params = new URLSearchParams();
  const put = (key: string, value: string, fallback: string) => {
    if (value && value !== fallback) params.set(key, value);
  };
  put('q', filters.q, '');
  put('type', filters.type, 'all');
  put('rarity', filters.rarity, 'all');
  put('hero', filters.hero, 'all');
  put('role', filters.role, 'all');
  put('availability', filters.availability, 'all');
  if (filters.battlePass) params.set('bp', '1');
  if (filters.esports) params.set('esports', '1');
  if (filters.limited) params.set('limited', '1');
  put('pool', filters.pool, 'all');
  put('event', filters.event, 'all');
  put('season', filters.season, 'all');
  put('mine', filters.mine, 'all');
  if (filters.min !== null || filters.max !== null) put('currency', filters.currency, 'coins');
  if (filters.min !== null) params.set('min', String(filters.min));
  if (filters.max !== null) params.set('max', String(filters.max));
  put('sort', filters.sort, 'newest');
  put('view', filters.view, 'grid');
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

/** How many filters narrow the results. Sort, view and page don't count. */
export function activeFilterCount(filters: CosmeticFilters) {
  const keys: Array<keyof CosmeticFilters> = ['q', 'type', 'rarity', 'hero', 'role', 'availability', 'battlePass', 'esports', 'limited', 'pool', 'event', 'season', 'mine', 'min', 'max'];
  return keys.filter((key) => filters[key] !== DEFAULT_FILTERS[key]).length;
}

export interface FilterContext {
  isOwned?: (id: string) => boolean;
  isWished?: (id: string) => boolean;
  isFavorite?: (id: string) => boolean;
  eventLabels?: Map<string, string>;
}

const HERO_ROLE = new Map<string, Role>(HEROES.map((hero) => [hero.id, hero.role]));
const HERO_NAME = new Map<string, string>(HEROES.map((hero) => [hero.id, hero.name]));
const TYPE_NAME = new Map<string, string>(COSMETIC_TYPES.flatMap((type) => [[type.id, `${type.label} ${type.singular}`]] as Array<[string, string]>));

const searchCache = new WeakMap<CatalogRow, string>();

function searchText(row: CatalogRow, context: FilterContext) {
  let text = searchCache.get(row);
  if (text === undefined) {
    text = normalizeText([row.name, row.hero ? HERO_NAME.get(row.hero) : '', TYPE_NAME.get(row.type), row.rarity ?? '', row.event ? context.eventLabels?.get(row.event) ?? row.event : ''].join(' '));
    searchCache.set(row, text);
  }
  return text;
}

export const priceIn = (row: Pick<CatalogRow, 'prices'>, currency: Currency) => row.prices.find((price) => price.currency === currency)?.amount ?? null;

function matches(row: CatalogRow, filters: CosmeticFilters, words: string[], context: FilterContext) {
  if (filters.type !== 'all' && row.type !== filters.type) return false;
  if (filters.rarity !== 'all' && row.rarity !== filters.rarity) return false;
  if (filters.hero !== 'all' && row.hero !== filters.hero) return false;
  if (filters.role !== 'all' && (!row.hero || HERO_ROLE.get(row.hero) !== filters.role)) return false;

  if (filters.availability === 'in-shop' && row.availability !== 'in-shop') return false;
  if (filters.availability === 'previous' && (row.availability === 'in-shop' || row.seen === 0)) return false;
  if (filters.availability === 'never-seen' && row.seen !== 0) return false;
  if (filters.availability === 'gallery' && row.availability !== 'gallery') return false;

  if (filters.battlePass && !row.tags.includes('battle-pass')) return false;
  if (filters.esports && !row.tags.includes('esports')) return false;
  if (filters.limited && !row.tags.includes('limited')) return false;
  if (filters.pool !== 'all' && !row.pools.includes(filters.pool)) return false;
  if (filters.event !== 'all' && row.event !== filters.event) return false;
  if (filters.season !== 'all' && row.season !== filters.season) return false;

  if (filters.mine === 'owned' && !context.isOwned?.(row.id)) return false;
  if (filters.mine === 'unowned' && context.isOwned?.(row.id)) return false;
  if (filters.mine === 'wishlist' && !context.isWished?.(row.id)) return false;
  if (filters.mine === 'favorites' && !context.isFavorite?.(row.id)) return false;

  if (filters.min !== null || filters.max !== null) {
    const price = priceIn(row, filters.currency);
    if (price === null) return false;
    if (filters.min !== null && price < filters.min) return false;
    if (filters.max !== null && price > filters.max) return false;
  }

  if (words.length > 0) {
    const text = searchText(row, context);
    if (!words.every((word) => text.includes(word))) return false;
  }
  return true;
}

const byName = (a: CatalogRow, b: CatalogRow) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/** Items with no value for a sort go last in both directions, so an unknown never reads as newest or cheapest. */
function compareKnown(a: number | string | null, b: number | string | null, direction: 1 | -1) {
  const missingA = a === null || a === '' || a === 0;
  const missingB = b === null || b === '' || b === 0;
  if (missingA || missingB) return Number(missingA) - Number(missingB);
  if (a === b) return 0;
  return (a! < b! ? -1 : 1) * direction;
}

const anyPrice = (row: CatalogRow, currency: PriceCurrency) => priceIn(row, currency) ?? row.prices[0]?.amount ?? null;

export function sortRows(rows: CatalogRow[], sort: SortKey, currency: PriceCurrency = 'coins') {
  const compare: Record<SortKey, (a: CatalogRow, b: CatalogRow) => number> = {
    newest: (a, b) => compareKnown(a.order, b.order, -1) || byName(a, b),
    oldest: (a, b) => compareKnown(a.order, b.order, 1) || byName(a, b),
    name: byName,
    rarity: (a, b) => (b.rarity ? RARITY_RANK[b.rarity] : -1) - (a.rarity ? RARITY_RANK[a.rarity] : -1) || byName(a, b),
    'price-low': (a, b) => compareKnown(anyPrice(a, currency), anyPrice(b, currency), 1) || byName(a, b),
    'price-high': (a, b) => compareKnown(anyPrice(a, currency), anyPrice(b, currency), -1) || byName(a, b),
    'last-seen': (a, b) => compareKnown(a.lastSeen, b.lastSeen, -1) || byName(a, b),
  };
  return [...rows].sort(compare[sort]);
}

export function applyFilters(rows: readonly CatalogRow[], filters: CosmeticFilters, context: FilterContext = {}) {
  const words = normalizeText(filters.q).split(' ').filter(Boolean);
  return sortRows(rows.filter((row) => matches(row, filters, words, context)), filters.sort, filters.currency);
}

export function pageOf<T>(rows: readonly T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: rows.slice((current - 1) * size, current * size), page: current, pages };
}

/** Page numbers to show, with gaps marked as null: 1 … 4 5 6 … 20. */
export function pageNumbers(page: number, pages: number): Array<number | null> {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: Array<number | null> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push(null);
    result.push(value);
  });
  return result;
}
