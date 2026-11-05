// Reads itemshop.gg's shop answer. The recording job and the Shop page share this, so both see the same rules.
// https://itemshop.gg/developers
import { cosmeticId, hash32, heroIdFromName, safeUrl } from './text';
import type { CosmeticType, Rarity } from './types';

export const ITEMSHOP_API = 'https://itemshop.gg/api/v1';
export const ITEMSHOP_PAGE = 'https://itemshop.gg/overwatch';

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

function readContent(raw: unknown): ShopContent | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name);
  if (!name) return null;
  const typeLabel = text(raw.type);
  const { type, heroName } = parseTypeLabel(typeLabel);
  const hero = heroIdFromName(heroName);
  return {
    key: text(raw.itemKey),
    name,
    typeLabel,
    type,
    hero,
    rarity: rarityFromName(isObject(raw.rarity) ? raw.rarity.name : null),
    image: safeUrl(raw.image),
    quantity: amount(raw.quantity) ?? 1,
    cosmeticId: type ? cosmeticId(type, hero, name) : null,
  };
}

function readListing(raw: unknown): ShopListing {
  if (!isObject(raw)) throw new ShopFormatError('A shop item is not an object');
  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name) throw new ShopFormatError('A shop item has no id or name');

  const typeLabel = text(raw.type);
  const key = text(raw.itemKey) ?? `listing:${id}`;
  const { type, heroName } = parseTypeLabel(typeLabel);
  const contents = Array.isArray(raw.contents) ? raw.contents.map(readContent).filter((item): item is ShopContent => item !== null) : [];
  const bundleLike = key.startsWith('ow:bundle:') || /^bundle\b/i.test(typeLabel ?? '');
  const kind: ListingKind = bundleLike ? 'bundle' : type ? 'cosmetic' : 'product';
  const stated = /^bundle\s+(\d+)$/i.exec(typeLabel ?? '');
  const price = isObject(raw.price) ? raw.price : {};
  const availability = isObject(raw.availability) ? raw.availability : {};
  const images = isObject(raw.images) ? raw.images : {};
  const hero = heroIdFromName(heroName);

  return {
    id,
    key,
    name,
    kind,
    typeLabel,
    type: kind === 'cosmetic' ? type : null,
    hero,
    rarity: rarityFromName(isObject(raw.rarity) ? raw.rarity.name : null),
    amount: amount(price.amount),
    priceLabel: text(price.label),
    currency: text(price.currency) ?? '',
    regular: amount(price.regular),
    image: safeUrl(images.card) ?? safeUrl(images.render),
    badge: text(raw.badge),
    from: time(availability.from),
    until: time(availability.until),
    untilLabel: text(availability.untilLabel),
    contents,
    statedCount: stated ? Number(stated[1]) : null,
    soldOut: raw.soldOut === true,
    url: storeUrl(raw.sourceUrl),
    cosmeticId: kind === 'cosmetic' && type ? cosmeticId(type, hero, name) : null,
  };
}

/** Throws ShopFormatError on anything unexpected, so a damaged answer can never replace good data. */
export function normalizeShop(answer: unknown): ShopSnapshot {
  const data = isObject(answer) ? answer.data : null;
  if (!isObject(data)) throw new ShopFormatError('The answer has no data');
  if (data.game !== 'overwatch') throw new ShopFormatError('The answer is not for Overwatch');
  if (!Array.isArray(data.sections)) throw new ShopFormatError('The answer has no sections');

  const sections = data.sections.map((section): ShopSection => {
    if (!isObject(section) || !Array.isArray(section.items)) throw new ShopFormatError('A section has no items');
    const title = text(section.title);
    if (!title) throw new ShopFormatError('A section has no title');
    return { title, upcoming: section.upcoming === true, endsAt: time(section.endsAt), listings: section.items.map(readListing) };
  });

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
  { id: 'cosmetics', label: 'Individual Cosmetics', hint: 'Single cosmetics sold on their own.' },
  { id: 'offers', label: 'Special Offers', hint: 'Listings with a store discount tag, such as "37% off".' },
  { id: 'esports', label: 'Esports', hint: 'Everything in the Esports section of the shop.' },
  { id: 'limited', label: 'Limited Time', hint: 'Listings with an end time from the source.' },
  { id: 'passes', label: 'Battle Pass & Packs', hint: 'Battle passes, event passes and other products that aren\'t a single cosmetic.' },
];

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
