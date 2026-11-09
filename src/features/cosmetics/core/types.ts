// The shared data model for cosmetics. The import scripts write these shapes and the site reads them.
// See docs/COSMETICS_DATA.md for where each field comes from.

export const COSMETIC_TYPES = [
  { id: 'skin', label: 'Skins', singular: 'Skin' },
  { id: 'weapon-skin', label: 'Weapon Skins', singular: 'Weapon Skin' },
  { id: 'weapon-charm', label: 'Weapon Charms', singular: 'Weapon Charm' },
  { id: 'souvenir', label: 'Souvenirs', singular: 'Souvenir' },
  { id: 'highlight-intro', label: 'Highlight Intros', singular: 'Highlight Intro' },
  { id: 'victory-pose', label: 'Victory Poses', singular: 'Victory Pose' },
  { id: 'emote', label: 'Emotes', singular: 'Emote' },
  { id: 'spray', label: 'Sprays', singular: 'Spray' },
  { id: 'voice-line', label: 'Voice Lines', singular: 'Voice Line' },
  { id: 'name-card', label: 'Name Cards', singular: 'Name Card' },
  { id: 'player-icon', label: 'Player Icons', singular: 'Player Icon' },
  { id: 'player-title', label: 'Player Titles', singular: 'Player Title' },
] as const;

export type CosmeticType = (typeof COSMETIC_TYPES)[number]['id'];

export const RARITIES = [
  { id: 'common', label: 'Common', color: '#bfc4cc' },
  { id: 'rare', label: 'Rare', color: '#3aa0ff' },
  { id: 'epic', label: 'Epic', color: '#b45cf0' },
  { id: 'legendary', label: 'Legendary', color: '#f0a232' },
  { id: 'ultra', label: 'Ultra', color: '#ff7ab8' },
  { id: 'mythic', label: 'Mythic', color: '#e0a3ff' },
] as const;

export type Rarity = (typeof RARITIES)[number]['id'];

export const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3, ultra: 4, mythic: 5 };

export type Currency = 'coins' | 'credits' | 'prisms' | 'competitive-points' | 'league-tokens' | 'usd';

export interface Price {
  amount: number;
  currency: Currency;
}

/** Why a cosmetic can be found under a filter. All of these come from a source, none are guessed. */
export type CosmeticTag = 'shop' | 'battle-pass' | 'event-pass' | 'event' | 'esports' | 'limited' | 'achievement' | 'challenge' | 'twitch' | 'base' | 'gallery' | 'loot-box' | 'mythic-shop' | 'competitive' | 'collab';

export type Availability = 'in-shop' | 'upcoming' | 'gallery' | 'not-listed';

/** One row of the search index: only what filtering, sorting and a card need. */
export interface CatalogRow {
  id: string;
  name: string;
  type: CosmeticType;
  rarity: Rarity | null;
  /** Hero id from src/data/heroes.ts. Null for cosmetics any hero can use. */
  hero: string | null;
  image: string | null;
  season: string | null;
  event: string | null;
  tags: CosmeticTag[];
  /** Loot pool slugs. Many-to-many: a cosmetic can be in several. */
  pools: string[];
  prices: Price[];
  availability: Availability;
  /** Date of the most recent recorded shop appearance. */
  lastSeen: string | null;
  /** Recorded shop appearances. */
  seen: number;
  /** The store's page for just this item, while it's on sale by itself. */
  storeUrl?: string | null;
  /** Higher is newer. Built from the season and the product id, so it's only a rough order within a season. */
  order: number;
}

export interface ShopStay {
  start: string | null;
  end: string | null;
  price: number | null;
  currency: string | null;
  /** Which store section it was in, when known. */
  section: string | null;
  /** The bundle it was sold with, when it wasn't sold alone. */
  bundle: string | null;
  /** That bundle's page, when the bundle is known. */
  bundleId?: string | null;
  /** The whole bundle's price. It isn't a price for this one item, so it's kept apart from price. */
  bundlePrice?: number | null;
  source: 'itemshop-history' | 'recorded';
}

export interface SourceRef {
  source: string;
  title: string;
  url: string | null;
  /** When this project last confirmed the record against the source. */
  checkedAt: string | null;
}

export interface CosmeticDetail extends CatalogRow {
  description: string | null;
  images: string[];
  productIds: number[];
  /** Plain sentences, each traceable to a source. */
  acquisition: string[];
  bundles: string[];
  stays: ShopStay[];
  sources: SourceRef[];
  /** Set for a mythic cosmetic. Points at mythics.json. */
  mythic: string | null;
  /** The official store page, when the shop data gave one. */
  storeUrl: string | null;
}

export interface BundleItem {
  /** Canonical cosmetic id. Null for something that isn't a cosmetic, such as coins or tier skips. */
  id: string | null;
  name: string;
  type: CosmeticType | null;
  typeLabel: string | null;
  rarity: Rarity | null;
  hero: string | null;
  image: string | null;
  quantity: number;
  /** A price for this item alone, when a source lists one. */
  prices: Price[];
  /** The store's page for just this item, while it's on sale by itself. */
  storeUrl?: string | null;
}

export type BundleStatus = 'active' | 'previous';

export interface Bundle {
  id: string;
  /** Its name as a link. A bundle first known by name keeps working here after it gets a product number. */
  slug?: string;
  name: string;
  productId: number | null;
  rarity: Rarity | null;
  image: string | null;
  price: { amount: number | null; currency: string; label: string | null } | null;
  /** Item count stated by the store, which can be higher than the items its data lists. */
  statedCount: number | null;
  items: BundleItem[];
  heroes: string[];
  types: CosmeticType[];
  status: BundleStatus;
  until: string | null;
  badge: string | null;
  url: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  seen: number;
  season: string | null;
  section: string | null;
}

export interface Season {
  id: string;
  label: string;
  era: 'overwatch-2' | 'reign-of-talon';
  number: number;
  start: string | null;
  end: string | null;
  title: string | null;
}

export interface LootPool {
  slug: string;
  name: string;
  description: string;
  /** How the list was decided, in plain words. */
  basis: string;
  sources: SourceRef[];
  /** How many cosmetics are listed. Null when no list can be shown. */
  count: number | null;
  /** True only when a source publishes the pool's full contents. Otherwise the list is related cosmetics, not a promise. */
  confirmed: boolean;
}

export interface MythicOption {
  name: string;
  count: number;
}

/** A color theme a mythic skin can have. */
export interface MythicAspect {
  name: string;
  season: string | null;
  description: string;
  image: string | null;
  sources: SourceRef[];
}

export interface MythicItem {
  id: string;
  cosmeticId: string | null;
  name: string;
  kind: 'skin' | 'weapon';
  hero: string | null;
  season: string | null;
  image: string | null;
  /** Customization groups as the source lists them. */
  options: MythicOption[];
  /** A weapon's upgrade levels, when a source lists them. */
  levels?: { level: number; prisms: number; text: string }[];
  /** Prism cost when a source states it. */
  prisms: number | null;
  /** True when the source says it's in the Mythic Shop right now. */
  note: string | null;
  sources: SourceRef[];
}

export interface PassReward {
  tier: number;
  /** Which part of the pass the tier is in, for passes split into tracks and for prestige tiers. Null for the main run of tiers. */
  part: string | null;
  track: 'free' | 'premium' | 'both';
  name: string;
  /** Canonical cosmetic id, when the reward is a cosmetic in the catalogue. */
  id: string | null;
  type: CosmeticType | null;
  typeLabel: string | null;
  rarity: Rarity | null;
  hero: string | null;
  image: string | null;
  quantity: number | null;
  /** True when the rules for buying a past pass leave this out. */
  notInUnvault?: boolean;
}

/** What it costs to buy a past Battle Pass, and what that leaves out. */
export interface PassRules {
  coins: number;
  /** The season these rules started, when the source says. */
  since: string | null;
  excludes: string[];
  sources: SourceRef[];
}

export interface BattlePass {
  id: string;
  seasonId: string;
  label: string;
  title: string | null;
  start: string | null;
  end: string | null;
  image: string | null;
  tiers: number | null;
  rewardCount: number;
  rewards: PassReward[];
  note: string | null;
  sources: SourceRef[];
}

export interface DropReward {
  id: string;
  name: string;
  /** Minutes of watch time. */
  minutes: number | null;
  type: CosmeticType | null;
  cosmeticId: string | null;
  image: string | null;
  note: string | null;
}

export interface DropCampaign {
  id: string;
  name: string;
  start: string;
  end: string;
  /** Last moment to claim, when the announcement states it. */
  claimUntil: string | null;
  image: string | null;
  channels: { label: string; url: string | null }[];
  /** "Any channel in the Overwatch category", for instance. */
  channelNote: string | null;
  rewards: DropReward[];
  url: string | null;
  sources: SourceRef[];
  /** A caution about the announcement itself, such as dates that don't agree. */
  note?: string | null;
}

export interface SourceStatus {
  id: string;
  name: string;
  url: string | null;
  license: string | null;
  lastSuccess: string | null;
  records: number;
  note: string | null;
  /** True when this source's pictures are shown too. */
  pictures?: boolean;
}

export interface FacetValue {
  id: string;
  label: string;
  count: number;
}

export interface CatalogMeta {
  schema: 1;
  generatedAt: string;
  counts: { cosmetics: number; bundles: number; rotations: number; passes: number; mythics: number; campaigns: number; events?: number };
  sources: SourceStatus[];
  facets: {
    heroes: FacetValue[];
    types: FacetValue[];
    rarities: FacetValue[];
    seasons: FacetValue[];
    events: FacetValue[];
    pools: FacetValue[];
    tags: FacetValue[];
  };
  priceMax: number;
  shardCount: number;
  /** When recorded shop history starts. */
  shopHistoryFrom: string | null;
  /** True once shop history has been read through an itemshop.gg key. */
  shopHistoryComplete: boolean;
}

export interface CatalogStats {
  total: number;
  byType: FacetValue[];
  byRarity: FacetValue[];
  skinsByRarity: FacetValue[];
  byHero: FacetValue[];
  bySeason: FacetValue[];
  origins: FacetValue[];
  mythics: { skins: number; weapons: number };
  bundles: { total: number; active: number; previous: number; averageItems: number | null };
  rotationsByMonth: { month: string; rotations: number; listings: number }[];
  appearancesByType: FacetValue[];
  mostSeen: { id: string; name: string; type: CosmeticType; hero: string | null; seen: number }[];
}

export interface RotationSummary {
  id: string;
  at: string;
  shopDate: string | null;
  count: number;
  added: number;
  removed: number;
  exact: boolean;
}

export interface RotationDetail extends RotationSummary {
  sections: { title: string; endsAt: string | null; listings: RotationListing[] }[];
  addedKeys: string[];
  removedKeys: string[];
}

export interface RotationListing {
  key: string;
  name: string;
  image: string | null;
  amount: number | null;
  currency: string | null;
  bundle: boolean;
  /** Link target on this site, when there is one. */
  href: string | null;
}
