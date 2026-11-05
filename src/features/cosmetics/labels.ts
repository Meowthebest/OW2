import { HEROES } from '../../data/heroes';
import { formatInt } from '../../lib/format';
import { COSMETIC_TYPES, RARITIES, type CosmeticTag, type CosmeticType, type Currency, type Price, type Rarity } from './core/types';

const HERO_BY_ID = new Map(HEROES.map((hero) => [hero.id, hero]));
const TYPE_BY_ID = new Map<string, (typeof COSMETIC_TYPES)[number]>(COSMETIC_TYPES.map((type) => [type.id, type]));
const RARITY_BY_ID = new Map<string, (typeof RARITIES)[number]>(RARITIES.map((rarity) => [rarity.id, rarity]));

export const heroById = (id: string | null | undefined) => (id ? HERO_BY_ID.get(id) ?? null : null);
export const heroLabel = (id: string | null | undefined) => heroById(id)?.name ?? id ?? '';
export const typeLabel = (id: CosmeticType) => TYPE_BY_ID.get(id)?.label ?? id;
export const typeSingular = (id: CosmeticType) => TYPE_BY_ID.get(id)?.singular ?? id;
export const rarityLabel = (id: Rarity) => RARITY_BY_ID.get(id)?.label ?? id;

export const CURRENCY_LABEL: Record<Currency, string> = {
  coins: 'Coins',
  credits: 'Credits',
  prisms: 'Mythic Prisms',
  'competitive-points': 'Competitive Points',
  'league-tokens': 'League Tokens',
  usd: 'USD',
};

export function priceText(price: Price) {
  if (price.currency === 'usd') return `$${price.amount.toFixed(2)}`;
  return `${formatInt(price.amount)} ${CURRENCY_LABEL[price.currency]}`;
}

/** Text for a price as the shop feed writes it: a game currency name or an ISO code. */
export function sourcePriceText(amount: number | null, currency: string | null, label: string | null = null) {
  if (amount === null) return label ?? 'See store for price';
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  return `${formatInt(amount)}${currency ? ` ${currency}` : ''}`;
}

export const TAG_LABEL: Record<CosmeticTag, string> = {
  shop: 'Shop',
  'battle-pass': 'Battle Pass',
  'event-pass': 'Event Pass',
  event: 'Event',
  esports: 'Esports',
  limited: 'Limited-time',
  achievement: 'Achievements',
  challenge: 'Challenge',
  twitch: 'Twitch Drop',
  base: 'Base',
  gallery: 'Hero Gallery',
  'loot-box': 'Loot Box',
  'mythic-shop': 'Mythic Shop',
  competitive: 'Competitive',
  collab: 'Collaboration',
};

const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Nov 3, 2026" from a date or a full time. Read as UTC, so a date never shifts by a day. */
export function dayText(value: string | null | undefined) {
  if (!value) return '';
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(parsed) ? dateFormat.format(parsed) : value;
}

/** Keeps a list page's filters when moving around. */
export const withQuery = (path: string, query: string) => (query ? `${path}?${query}` : path);
