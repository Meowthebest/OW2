// Personal tracking. Every mark is manual: the site can't see what a player really owns in the game.
// Each entry keeps the time it was set, so two devices can merge: the newest change to an entry wins,
// and removing something is kept as a mark too, so the removal reaches the other device.
import type { Bundle, CatalogRow, DropCampaign, MythicItem, BattlePass, PassReward, Rarity, CosmeticType, FacetValue } from './types';

export type EntryKind = 'owned' | 'wishlist' | 'favorite' | 'notify' | 'tier' | 'mythic' | 'drop';

export const ENTRY_KINDS: readonly EntryKind[] = ['owned', 'wishlist', 'favorite', 'notify', 'tier', 'mythic', 'drop'];

/** [1 = set, 0 = removed, time in milliseconds] */
export type Entry = [0 | 1, number];
export type EntryMap = Record<string, Entry>;

export const entryKey = (kind: EntryKind, id: string) => `${kind}:${id}`;

const KEY_PATTERN = /^(owned|wishlist|favorite|notify|tier|mythic|drop):[^\s]{1,200}$/;
export const MAX_ENTRIES = 60000;

export const isSet = (entries: EntryMap, kind: EntryKind, id: string) => entries[entryKey(kind, id)]?.[0] === 1;

export function validEntry(key: string, entry: unknown): entry is Entry {
  return KEY_PATTERN.test(key) && Array.isArray(entry) && entry.length === 2 && (entry[0] === 0 || entry[0] === 1) && typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0;
}

/** Keeps the newest version of each entry. On a tie, set beats removed, so a mark is never lost to a clock tie. */
export function mergeEntries(base: EntryMap, incoming: EntryMap): { merged: EntryMap; changed: string[] } {
  const merged: EntryMap = { ...base };
  const changed: string[] = [];
  for (const [key, entry] of Object.entries(incoming)) {
    if (!validEntry(key, entry)) continue;
    const current = merged[key];
    if (!current || entry[1] > current[1] || (entry[1] === current[1] && entry[0] > current[0])) {
      merged[key] = entry;
      changed.push(key);
    }
  }
  return { merged, changed };
}

export const EXPORT_APP = 'ow2-hero-selector-collection';

export function exportDocument(entries: EntryMap, now = Date.now()) {
  return { app: EXPORT_APP, schema: 1, exportedAt: new Date(now).toISOString(), note: 'Manual tracking from OW2 Hero Selector. This is not in-game ownership data.', entries };
}

export class ImportError extends Error {}

/** Reads an exported file. Anything else is refused rather than half-imported. */
export function parseImport(text: string): EntryMap {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new ImportError('That file is not valid JSON.');
  }
  const record = document as { app?: unknown; schema?: unknown; entries?: unknown } | null;
  if (!record || record.app !== EXPORT_APP || record.schema !== 1 || typeof record.entries !== 'object' || record.entries === null) {
    throw new ImportError('That file is not a collection export from this site.');
  }
  const entries: EntryMap = {};
  const list = Object.entries(record.entries as Record<string, unknown>);
  if (list.length > MAX_ENTRIES) throw new ImportError('That file has too many entries.');
  for (const [key, entry] of list) {
    if (!validEntry(key, entry)) throw new ImportError('That file has an entry this site can\'t read.');
    entries[key] = entry;
  }
  return entries;
}

export function idsOf(entries: EntryMap, kind: EntryKind) {
  const prefix = `${kind}:`;
  const ids: string[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (entry[0] === 1 && key.startsWith(prefix)) ids.push(key.slice(prefix.length));
  }
  return ids;
}

export interface Progress {
  done: number;
  total: number;
  percent: number;
}

export const progress = (done: number, total: number): Progress => ({ done, total, percent: total > 0 ? Math.round((done / total) * 1000) / 10 : 0 });

/** "Collection: 14 / 36 items owned". Only cosmetics count, not coins or tier skips. */
export function bundleProgress(bundle: Pick<Bundle, 'items'>, entries: EntryMap) {
  const cosmetics = bundle.items.filter((item) => item.id);
  return progress(cosmetics.filter((item) => isSet(entries, 'owned', item.id!)).length, cosmetics.length);
}

export const tierId = (passId: string, tier: number | string) => `${passId}/${tier}`;

/** A tier's own key. Tracks each count from 1, so the number alone isn't enough. */
export const rewardTierKey = (reward: Pick<PassReward, 'tier' | 'part'>) => (reward.part ? `${reward.part}/${reward.tier}` : String(reward.tier));

export function passProgress(pass: Pick<BattlePass, 'id' | 'rewards'>, entries: EntryMap) {
  const tiers = [...new Set(pass.rewards.map(rewardTierKey))];
  const tiersDone = tiers.filter((tier) => isSet(entries, 'tier', tierId(pass.id, tier))).length;
  const cosmetics = [...new Set(pass.rewards.filter((reward) => reward.id).map((reward) => reward.id!))];
  const owned = cosmetics.filter((id) => isSet(entries, 'owned', id)).length;
  return { tiers: progress(tiersDone, tiers.length), cosmetics: progress(owned, cosmetics.length), remaining: cosmetics.length - owned };
}

export const mythicOptionId = (mythicId: string, group: string, choice: number) => `${mythicId}/${group}/${choice}`;

/** Everything on a mythic that can be marked as unlocked: each numbered choice, and each level of a weapon. */
export function mythicChoiceIds(item: Pick<MythicItem, 'id' | 'options' | 'levels'>) {
  return [
    ...item.options.flatMap((option) => Array.from({ length: option.count }, (_, index) => mythicOptionId(item.id, option.name, index + 1))),
    ...(item.levels ?? []).map((level) => mythicOptionId(item.id, 'Level', level.level)),
  ];
}

export function mythicProgress(item: Pick<MythicItem, 'id' | 'options' | 'levels'>, entries: EntryMap) {
  const ids = mythicChoiceIds(item);
  return progress(ids.filter((id) => isSet(entries, 'mythic', id)).length, ids.length);
}

export const dropRewardId = (campaignId: string, rewardId: string) => `${campaignId}/${rewardId}`;

export function dropProgress(campaign: Pick<DropCampaign, 'id' | 'rewards'>, entries: EntryMap) {
  return progress(campaign.rewards.filter((reward) => isSet(entries, 'drop', dropRewardId(campaign.id, reward.id))).length, campaign.rewards.length);
}

export interface PersonalStats {
  owned: number;
  wishlist: number;
  favorites: number;
  total: number;
  completion: number;
  byHero: FacetValue[];
  byRarity: FacetValue[];
  byType: FacetValue[];
  /** Owned ids that aren't in the catalogue, such as a cosmetic later renamed. */
  unknown: number;
}

const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

/** Works only from what the player marked. It's a tracker, not a record of in-game ownership. */
export function personalStats(rows: readonly CatalogRow[], entries: EntryMap, labels: { hero: (id: string) => string; rarity: (id: Rarity) => string; type: (id: CosmeticType) => string }): PersonalStats {
  const known = new Map(rows.map((row) => [row.id, row]));
  const owned = idsOf(entries, 'owned');
  const heroes = new Map<string, number>();
  const rarities = new Map<string, number>();
  const types = new Map<string, number>();
  let unknown = 0;
  for (const id of owned) {
    const row = known.get(id);
    if (!row) {
      unknown += 1;
      continue;
    }
    if (row.hero) count(heroes, row.hero);
    if (row.rarity) count(rarities, row.rarity);
    count(types, row.type);
  }
  const facet = (map: Map<string, number>, label: (id: string) => string) => [...map].map(([id, value]) => ({ id, label: label(id), count: value })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const ownedKnown = owned.length - unknown;
  return {
    owned: ownedKnown,
    wishlist: idsOf(entries, 'wishlist').length,
    favorites: idsOf(entries, 'favorite').length,
    total: rows.length,
    completion: rows.length > 0 ? Math.round((ownedKnown / rows.length) * 1000) / 10 : 0,
    byHero: facet(heroes, labels.hero),
    byRarity: facet(rarities, (id) => labels.rarity(id as Rarity)),
    byType: facet(types, (id) => labels.type(id as CosmeticType)),
    unknown,
  };
}
