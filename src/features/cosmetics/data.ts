import { useEffect, useState } from 'react';
import { ITEMSHOP_API, normalizeShop, shardFile, shardOf, type ShopSnapshot } from './core';
import type { GameEventsFile } from './core/events';
import type { BattlePass, Bundle, CatalogMeta, CatalogRow, CatalogStats, CosmeticDetail, DropCampaign, LootPool, MythicAspect, MythicItem, PassRules, Price, RotationDetail, RotationSummary, Season } from './core/types';

// Everything here except the live shop check reads JSON that ships with the site. It's built ahead of time from the
// stored sources by scripts/cosmetics/cli.mjs, split so that a visit loads only what its page needs.

const DATA_URL = import.meta.env.VITE_COSMETICS_DATA_URL || `${import.meta.env.BASE_URL}data/cosmetics/`;

export class MissingDataError extends Error {}

const cache = new Map<string, Promise<unknown>>();

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 404) throw new MissingDataError(`Not found: ${url}`);
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  return (await response.json()) as T;
}

/** Remembers a request for the life of the page. A failed one is forgotten, so a retry reads it again. */
function once<T>(key: string, start: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;
  const request = start();
  cache.set(key, request);
  request.catch(() => cache.delete(key));
  return request;
}

/** The small file that says what's published. Every other file is addressed by its build time, so it can be cached. */
export const loadMeta = () => once('meta', () => fetchJson<CatalogMeta>(`${DATA_URL}meta.json`, { cache: 'no-cache' }));

async function load<T>(file: string): Promise<T> {
  const meta = await loadMeta();
  return once(file, () => fetchJson<T>(`${DATA_URL}${file}?v=${encodeURIComponent(meta.generatedAt)}`));
}

export const loadCatalog = () => load<CatalogRow[]>('catalog.json');
export const loadBundles = () => load<Bundle[]>('bundles.json');
export const loadStats = () => load<CatalogStats>('stats.json');
export const loadSeasons = () => load<Season[]>('seasons.json');
export const loadEvents = () => load<{ id: string; label: string }[]>('events.json');
export const loadPools = () => load<LootPool[]>('loot-pools.json');
export const loadMythics = () => load<MythicItem[]>('mythics.json');
export const loadMythicAspects = () => load<MythicAspect[]>('mythic-aspects.json');
export const loadPasses = () => load<Omit<BattlePass, 'rewards'>[]>('battle-passes.json');
export const loadPassRules = () => load<PassRules | null>('battle-pass-rules.json');
export const loadPass = (id: string) => load<BattlePass>(`battle-passes/${encodeURIComponent(id)}.json`);
export const loadDrops = () => load<DropCampaign[]>('twitch-drops.json');
export const loadGameEvents = () => load<GameEventsFile>('game-events.json');
export const loadRotations = () => load<RotationSummary[]>('rotations.json');
export const loadRotationMonth = (month: string) => load<RotationDetail[]>(`rotations/${encodeURIComponent(month)}.json`);

export async function loadCosmetic(id: string): Promise<CosmeticDetail | null> {
  const shard = await load<Record<string, CosmeticDetail | { aliasOf: string }>>(shardFile(shardOf(id)));
  const found = shard[id];
  if (found && 'aliasOf' in found) return loadCosmetic(found.aliasOf);
  return found ?? null;
}

export interface RecordedShop {
  schema: 1;
  recordedAt: string;
  rotation: RotationSummary;
  /** What the live feed can't say about an item: its record in the catalogue and its known prices. */
  items?: Record<string, { id: string; prices: Price[] }>;
  snapshot: ShopSnapshot;
  changes: { previousAt: string; added: RecordedChange[]; removed: RecordedChange[] } | null;
}

export interface RecordedChange {
  key: string;
  name: string;
  image: string | null;
  amount: number | null;
  currency: string | null;
  bundle: boolean;
  href: string | null;
}

export const loadRecordedShop = () => load<RecordedShop | null>('shop.json');

/** Asks itemshop.gg directly, which its documentation allows from a web page. A failure just means the recorded shop is shown. */
export async function loadLiveShop(signal?: AbortSignal): Promise<ShopSnapshot> {
  const timeout = AbortSignal.timeout?.(10000);
  const combined = signal && timeout && 'any' in AbortSignal ? (AbortSignal as unknown as { any(list: AbortSignal[]): AbortSignal }).any([signal, timeout]) : signal ?? timeout;
  const response = await fetch(`${ITEMSHOP_API}/shop/overwatch`, { cache: 'no-cache', signal: combined });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalizeShop(await response.json());
}

/** A clock for countdowns. */
export function useClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
