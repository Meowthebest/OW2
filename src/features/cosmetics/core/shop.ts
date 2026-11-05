// Reads itemshop.gg's shop answer. The recording job and the Shop page share this, so both see the same rules.
// https://itemshop.gg/developers
import { cosmeticId, hash32, heroIdFromName, normalizeText, safeUrl, slugify } from './text';
import { COSMETIC_TYPES, RARITY_RANK, type CosmeticType, type Price, type Rarity, type ShopStay } from './types';

export const ITEMSHOP_API = 'https://itemshop.gg/api/v1';
export const ITEMSHOP_PAGE = 'https://itemshop.gg/overwatch';
const STORE_ITEMS = 'https://us.shop.battle.net/en-us/family/overwatch/items';

export class ShopFormatError extends Error {}

const TYPE_WORDS: Record<string, CosmeticType> = {
  skin: 'skin',
  skins: 'skin',
  'weapon skin': 'weapon-skin',
  'weapon skins': 'weapon-skin',
  'weapon charm': 'weapon-charm',
  'weapon charms': 'weapon-charm',
  souvenir: 'souvenir',
  souvenirs: 'souvenir',
  'highlight intro': 'highlight-intro',
  'highlight intros': 'highlight-intro',
  'victory pose': 'victory-pose',
  'victory poses': 'victory-pose',
  emote: 'emote',
  emotes: 'emote',
  spray: 'spray',
  sprays: 'spray',
  'voice line': 'voice-line',
  'voice lines': 'voice-line',
  'name card': 'name-card',
  'name cards': 'name-card',
  'player icon': 'player-icon',
  'player icons': 'player-icon',
  'player title': 'player-title',
  'player titles': 'player-title',
};

/** Types that always belong to one hero. One of these with no hero named can't be linked to a cosmetic. */
export const HERO_BOUND_TYPES: ReadonlySet<string> = new Set(['skin', 'weapon-skin', 'highlight-intro', 'victory-pose', 'emote', 'voice-line']);

/** "Skins · D.Va", "Skin - Illari" and "Weapon Charms" all become a type and, when there is one, a hero. */
export function parseTypeLabel(label: string | null): { type: CosmeticType | null; heroName: string | null } {
  if (!label) return { type: null, heroName: null };
  const match = /^(.+?)\s+[·\-–]\s+(.+)$/.exec(label.trim());
  const word = (match ? match[1] : label).trim().toLowerCase();
  const type = TYPE_WORDS[word] ?? null;
  return { type, heroName: type && match ? match[2].trim() : null };
}

export function rarityFromName(name: unknown): Rarity | null {
  const value = typeof name === 'string' ? name.toLowerCase() : '';
  return value === 'common' || value === 'rare' || value === 'epic' || value === 'legendary' || value === 'ultra' || value === 'mythic' ? value : null;
}

export interface ShopContent {
  key: string | null;
  name: string;
  typeLabel: string | null;
  type: CosmeticType | null;
  hero: string | null;
  rarity: Rarity | null;
  image: string | null;
  quantity: number;
  /** Null for something that isn't a cosmetic, such as tier skips or coins. */
  cosmeticId: string | null;
  /** The store's page for just this item. Null when it can't be bought by itself. */
  url: string | null;
}

export type ListingKind = 'bundle' | 'cosmetic' | 'product';

export interface ShopListing {
  id: string;
  key: string;
  name: string;
  kind: ListingKind;
  typeLabel: string | null;
  type: CosmeticType | null;
  hero: string | null;
  rarity: Rarity | null;
  amount: number | null;
  priceLabel: string | null;
  currency: string;
  regular: number | null;
  image: string | null;
  badge: string | null;
  from: string | null;
  until: string | null;
  /** What happens at `until` when the item stays, like "Sale ends". Null means it leaves. */
  untilLabel: string | null;
  contents: ShopContent[];
  statedCount: number | null;
  soldOut: boolean;
  url: string | null;
  cosmeticId: string | null;
}

export interface ShopSection {
  title: string;
  upcoming: boolean;
  endsAt: string | null;
  listings: ShopListing[];
}

export interface ShopSnapshot {
  shopDate: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  stale: boolean;
  itemCount: number;
  sections: ShopSection[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const time = (value: unknown) => {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
};
const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

/** Store pages only. A link from the feed never sends a visitor anywhere else. */
function storeUrl(value: unknown) {
  const url = safeUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname;
  return host === 'battle.net' || host.endsWith('.battle.net') || host.endsWith('.blizzard.com') ? url : null;
}

/**
 * The store's own page for one item, which works whether it's listed alone or only shown inside a bundle.
 * The feed only links whole listings, but its item keys hold the store's product numbers.
 */
export function itemStoreUrl(key: string | null | undefined, name: string) {
  const product = /^ow:item:(\d+)$/.exec(key ?? '')?.[1];
  if (!product) return null;
  const slug = slugify(name);
  return slug ? `${STORE_ITEMS}/${product}/${slug}` : `${STORE_ITEMS}/${product}`;
}

/** Mythics are unlocked with prisms in the game. Inside a bundle they have no store page of their own. */
export const soldByItself = (type: CosmeticType | null, rarity: Rarity | null) => type !== null && rarity !== 'mythic';

function readContent(raw: unknown): ShopContent | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name);
  if (!name) return null;
  const typeLabel = text(raw.type);
  const { type, heroName } = parseTypeLabel(typeLabel);
  const hero = heroIdFromName(heroName);
  const key = text(raw.itemKey);
  const rarity = rarityFromName(isObject(raw.rarity) ? raw.rarity.name : null);
  return {
    key,
    name,
    typeLabel,
    type,
    hero,
    rarity,
    image: safeUrl(raw.image),
    quantity: amount(raw.quantity) ?? 1,
    cosmeticId: type ? cosmeticId(type, hero, name) : null,
    url: soldByItself(type, rarity) ? itemStoreUrl(key, name) : null,
  };
}

function readListing(raw: unknown): ShopListing {
  if (!isObject(raw)) throw new ShopFormatError('A shop item is not an object');
  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name) throw new ShopFormatError('A shop item has no id or name');

  const typeLabel = text(raw.type);
  // Past shops have no item keys, and the source can use one id for two different items, so the name is part of this.
  const key = text(raw.itemKey) ?? `listing:${id}:${slugify(name)}`;
  const { type, heroName } = parseTypeLabel(typeLabel);
  const contents = Array.isArray(raw.contents) ? raw.contents.map(readContent).filter((item): item is ShopContent => item !== null) : [];
  const bundleLike = key.startsWith('ow:bundle:') || /^bundles?\b/i.test(typeLabel ?? '');
  // A label can be just a hero's name. That says whose it is, but not what kind of cosmetic.
  const hero = heroIdFromName(heroName) ?? (type ? null : heroIdFromName(typeLabel));
  const isCosmetic = type !== null && (hero !== null || !HERO_BOUND_TYPES.has(type));
  const kind: ListingKind = bundleLike ? 'bundle' : isCosmetic ? 'cosmetic' : 'product';
  const stated = /^bundles?\s*(?:[·(]\s*)?(\d+)/i.exec(typeLabel ?? '');
  const price = isObject(raw.price) ? raw.price : {};
  const availability = isObject(raw.availability) ? raw.availability : {};
  const images = isObject(raw.images) ? raw.images : {};
  const label = text(price.label);
  const rarity = rarityFromName(isObject(raw.rarity) ? raw.rarity.name : null);
  // Older records put a dollar price in the label, and still call the currency Coins.
  const dollars = amount(price.amount) === null ? /^US\$\s*(\d+(?:\.\d+)?)$/.exec(label ?? '') : null;

  return {
    id,
    key,
    name,
    kind,
    typeLabel,
    type: kind === 'cosmetic' ? type : null,
    hero,
    rarity,
    amount: dollars ? Number(dollars[1]) : amount(price.amount),
    priceLabel: dollars ? null : label,
    currency: dollars ? 'USD' : text(price.currency) ?? '',
    regular: amount(price.regular),
    image: safeUrl(images.card) ?? safeUrl(images.render),
    badge: text(raw.badge),
    from: time(availability.from),
    until: time(availability.until),
    untilLabel: text(availability.untilLabel),
    contents,
    statedCount: stated ? Number(stated[1]) : null,
    soldOut: raw.soldOut === true,
    url: storeUrl(raw.sourceUrl) ?? (kind === 'cosmetic' && soldByItself(type, rarity) ? itemStoreUrl(key, name) : null),
    cosmeticId: kind === 'cosmetic' && type ? cosmeticId(type, hero, name) : null,
  };
}

/** Throws ShopFormatError on anything unexpected, so a damaged answer can never replace good data. */
export function normalizeShop(answer: unknown): ShopSnapshot {
  const data = isObject(answer) ? answer.data : null;
  if (!isObject(data)) throw new ShopFormatError('The answer has no data');
  if (data.game !== 'overwatch') throw new ShopFormatError('The answer is not for Overwatch');
  if (!Array.isArray(data.sections)) throw new ShopFormatError('The answer has no sections');

  const sections: ShopSection[] = [];
  for (const section of data.sections) {
    if (!isObject(section) || !Array.isArray(section.items)) throw new ShopFormatError('A section has no items');
    // Some records have an empty part after the name, such as "Overwatch Shop · ".
    const title = text(section.title)?.replace(/[\s·–-]+$/, '');
    if (!title) throw new ShopFormatError('A section has no title');
    const upcoming = section.upcoming === true;
    const endsAt = time(section.endsAt);
    const listings = section.items.map(readListing);
    const same = sections.find((other) => other.title === title && other.upcoming === upcoming);
    if (!same) {
      sections.push({ title, upcoming, endsAt, listings });
      continue;
    }
    if (same.endsAt !== endsAt) {
      for (const listing of same.listings) listing.until ??= same.endsAt;
      for (const listing of listings) listing.until ??= endsAt;
      same.endsAt = null;
    }
    same.listings.push(...listings);
  }

  return {
    shopDate: text(data.shopDate),
    updatedAt: time(data.updatedAt),
    expiresAt: time(data.expiresAt),
    stale: data.stale === true,
    itemCount: amount(data.itemCount) ?? sections.reduce((sum, section) => sum + section.listings.length, 0),
    sections,
  };
}

/** A fingerprint of what's on sale and at what price. Refreshed art or a new read time doesn't change it. */
export function shopFingerprint(snapshot: Pick<ShopSnapshot, 'sections'>) {
  const parts: string[] = [];
  for (const section of snapshot.sections) {
    for (const listing of section.listings) parts.push(`${section.title}|${listing.key}|${listing.amount ?? ''}|${listing.currency}|${listing.until ?? ''}`);
  }
  parts.sort();
  return hash32(parts.join('\n')).toString(36);
}

export interface StayRow {
  start: string | null;
  end: string | null;
  price: number | null;
  currency: string | null;
  section: string | null;
  bundles: { name: string; id: string | null; price: number | null }[];
}

/** One time on sale can be in several bundles at once, so this gives one row for each time on sale. */
export function groupStays(stays: readonly ShopStay[]) {
  const rows = new Map<string, StayRow>();
  for (const stay of stays) {
    const key = `${stay.start ?? ''}|${stay.end ?? ''}`;
    const row = rows.get(key) ?? { start: stay.start, end: stay.end, price: null, currency: stay.currency, section: null, bundles: [] };
    rows.set(key, row);
    if (typeof stay.price === 'number') row.price = stay.price;
    row.section ??= stay.section;
    if (stay.bundle && !row.bundles.some((bundle) => bundle.name === stay.bundle)) row.bundles.push({ name: stay.bundle, id: stay.bundleId ?? null, price: stay.bundlePrice ?? null });
  }
  return [...rows.values()];
}

export const sellableListings = (snapshot: Pick<ShopSnapshot, 'sections'>) => snapshot.sections.filter((section) => !section.upcoming).flatMap((section) => section.listings);

/** What changed between two shops, by item key rather than listing, since a returning item can get a new listing id. */
export function diffListings(current: readonly { key: string }[], previous: readonly { key: string }[]) {
  const before = new Set(previous.map((item) => item.key));
  const after = new Set(current.map((item) => item.key));
  return {
    added: [...after].filter((key) => !before.has(key)),
    removed: [...before].filter((key) => !after.has(key)),
  };
}

export type ShopGroup = 'all' | 'bundles' | 'cosmetics' | 'offers' | 'esports' | 'limited' | 'passes';

export const SHOP_GROUPS: { id: ShopGroup; label: string; hint: string }[] = [
  { id: 'all', label: 'Everything', hint: 'Everything the source lists right now.' },
  { id: 'bundles', label: 'Bundles', hint: 'Listings sold as bundles.' },
  { id: 'cosmetics', label: 'Individual Cosmetics', hint: 'Every cosmetic you can buy on its own, including ones that also come in a bundle.' },
  { id: 'offers', label: 'Special Offers', hint: 'Listings with a store discount tag, such as "37% off".' },
  { id: 'esports', label: 'Esports', hint: 'Everything in the Esports section of the shop.' },
  { id: 'limited', label: 'Limited Time', hint: 'Listings with an end time from the source.' },
  { id: 'passes', label: 'Battle Pass & Packs', hint: 'Battle passes, event passes and other products that aren\'t a single cosmetic.' },
];

/** A cosmetic you can buy by itself, whether the store lists it alone or only shows it inside bundles. */
export interface ShopItem {
  key: string;
  /** Canonical cosmetic id, the same field a bundle's items use. */
  id: string | null;
  name: string;
  type: CosmeticType;
  typeLabel: string | null;
  rarity: Rarity | null;
  hero: string | null;
  image: string | null;
  quantity: number;
  /** Only known here when the store lists it alone. The source gives no price for an item inside a bundle. */
  prices: Price[];
  storeUrl: string;
  /** The bundles in this shop that include it. */
  bundles: string[];
}

export interface ShopItemFilters {
  q: string;
  hero: string;
  type: CosmeticType | 'all';
}

const TYPE_ORDER = new Map<string, number>(COSMETIC_TYPES.map((type, index) => [type.id, index]));
const rarityRank = (rarity: Rarity | null) => (rarity ? RARITY_RANK[rarity] : -1);

/**
 * Everything in the shop that can be bought by itself, once each, under the first section that has it.
 * Skips sections that aren't on sale yet and anything listed as sold out, since those have no page to buy from.
 */
export function shopItemGroups<Section extends Pick<ShopSection, 'upcoming' | 'listings'>>(sections: readonly Section[]) {
  const found = new Map<string, ShopItem>();
  const groups: { section: Section; items: ShopItem[] }[] = [];
  for (const section of sections) {
    if (section.upcoming) continue;
    const items: ShopItem[] = [];
    const note = (item: ShopItem) => {
      const known = found.get(item.key);
      if (known) {
        if (known.prices.length === 0) known.prices = item.prices;
        known.bundles.push(...item.bundles.filter((name) => !known.bundles.includes(name)));
        return;
      }
      found.set(item.key, item);
      items.push(item);
    };
    for (const listing of section.listings) {
      if (listing.soldOut) continue;
      if (listing.kind === 'cosmetic' && listing.type && listing.url) {
        const coins = listing.amount !== null && /^coins$/i.test(listing.currency);
        note({ key: listing.key, id: listing.cosmeticId, name: listing.name, type: listing.type, typeLabel: listing.typeLabel, rarity: listing.rarity, hero: listing.hero, image: listing.image, quantity: 1, prices: coins ? [{ amount: listing.amount!, currency: 'coins' }] : [], storeUrl: listing.url, bundles: [] });
      }
      for (const content of listing.contents) {
        if (!content.url || !content.type || !content.key) continue;
        note({ key: content.key, id: content.cosmeticId, name: content.name, type: content.type, typeLabel: content.typeLabel, rarity: content.rarity, hero: content.hero, image: content.image, quantity: content.quantity, prices: [], storeUrl: content.url, bundles: [listing.name] });
      }
    }
    items.sort((a, b) => (TYPE_ORDER.get(a.type) ?? 99) - (TYPE_ORDER.get(b.type) ?? 99) || rarityRank(b.rarity) - rarityRank(a.rarity) || a.name.localeCompare(b.name));
    if (items.length > 0) groups.push({ section, items });
  }
  return groups;
}

/** Searches an item's name, its type and hero as the store labels them, and the bundles it comes in. */
export function matchesShopItem(item: ShopItem, { q, hero, type }: ShopItemFilters) {
  if (type !== 'all' && item.type !== type) return false;
  if (hero !== 'all' && item.hero !== hero) return false;
  const words = normalizeText(q).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const searched = normalizeText([item.name, item.typeLabel ?? '', ...item.bundles].join(' '));
  const joined = searched.replace(/ /g, '');
  return words.every((word) => searched.includes(word) || joined.includes(word));
}

export function matchesShopGroup(listing: ShopListing, section: Pick<ShopSection, 'title' | 'endsAt'>, group: ShopGroup) {
  switch (group) {
    case 'all':
      return true;
    case 'bundles':
      return listing.kind === 'bundle';
    case 'cosmetics':
      return listing.kind === 'cosmetic';
    case 'offers':
      return /\boff\b/i.test(listing.badge ?? '');
    case 'esports':
      return /esports/i.test(section.title);
    case 'limited':
      return Boolean(listing.until ?? section.endsAt);
    case 'passes':
      return listing.kind === 'product' || /\bbattle pass\b|\bevent pass\b|\bstarter pack\b/i.test(listing.name) || /seasonal packs/i.test(section.title);
    default:
      return true;
  }
}

/** Seconds until a time, or null when the source gave no usable time. */
export function secondsUntil(iso: string | null, now: number) {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.round((at - now) / 1000) : null;
}

/** "5d 16h", "3h 12m" or "42s". */
export function formatCountdown(seconds: number) {
  if (seconds <= 0) return 'now';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
