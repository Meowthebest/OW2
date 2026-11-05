import { HEROES } from '../../../data/heroes';
import type { CosmeticType } from './types';

/** Lower case, no accents, single spaces: "Lúcio" and "lucio" compare equal. */
export function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`"“”]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const slugify = (text: string) => normalizeText(text).replace(/ /g, '-');

/** FNV-1a. Small, stable and the same in the import scripts and the browser. */
export function hash32(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const HERO_NAMES = new Map<string, string>();
for (const hero of HEROES) {
  HERO_NAMES.set(normalizeText(hero.name), hero.id);
  HERO_NAMES.set(normalizeText(hero.id), hero.id);
}
// Names other sources use for the same hero.
for (const [alias, id] of [
  ['mccree', 'cassidy'],
  ['soldier 76', 'soldier-76'],
  ['soldier76', 'soldier-76'],
  ['dva', 'dva'],
  ['d va', 'dva'],
  ['d mon', 'dmon'],
  ['torb', 'torbjorn'],
  ['wrecking ball', 'wrecking-ball'],
  ['hammond', 'wrecking-ball'],
] as const) {
  HERO_NAMES.set(alias, id);
}

export const heroIdFromName = (name: string | null | undefined) => (name ? HERO_NAMES.get(normalizeText(name)) ?? null : null);

/** A cosmetic's permanent id. Links and saved collections depend on it, so its parts must not change. */
export function cosmeticId(type: CosmeticType, heroId: string | null, name: string) {
  const slug = slugify(name) || `x${hash32(name).toString(36)}`;
  return heroId ? `${type}.${heroId}.${slug}` : `${type}.${slug}`;
}

export const SHARD_COUNT = 64;
export const shardOf = (id: string) => hash32(id) % SHARD_COUNT;
export const shardFile = (shard: number) => `items/${String(shard).padStart(2, '0')}.json`;

/** Only https links from a source reach an href or an image, so a damaged record can't inject anything else. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
