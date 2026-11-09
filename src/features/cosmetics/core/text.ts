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

/** Every hero a piece of text names in full, such as a bundle's name. */
export function heroesNamedIn(text: string) {
  const words = ` ${normalizeText(text)} `;
  const found = new Set<string>();
  for (const [name, id] of HERO_NAMES) if (words.includes(` ${name} `)) found.add(id);
  return [...found];
}

/** A cosmetic's permanent id. Links and saved collections depend on it, so its parts must not change. */
export function cosmeticId(type: CosmeticType, heroId: string | null, name: string) {
  const slug = slugify(name) || `x${hash32(name).toString(36)}`;
  return heroId ? `${type}.${heroId}.${slug}` : `${type}.${slug}`;
}

// Blizzard's originals run to about 800 KB each. This free resizing service brings a card's image under 50 KB.
// Nothing is stored in this project. If the service fails, the original loads instead, then a placeholder.
const RESIZER = 'https://wsrv.nl/';
// The last one holds the pictures in Blizzard's news articles, which the Events page shows. Some are over 2 MB.
const RESIZABLE_HOSTS = new Set(['catalog.blzstatic.com', 'blz-contentstack-images.akamaized.net', 'bnetcmsus-a.akamaihd.net']);
const WIKI_IMAGES = 'overwatch.weirdgloop.org';

/**
 * The size of an image to load for a space this wide. The wiki makes its own thumbnails, which visitors' browsers load directly,
 * as its staff agreed. A few set sizes mean each one is only ever made once.
 */
export function resizedImage(src: string, width: number) {
  try {
    const url = new URL(src);
    if (url.hostname === WIKI_IMAGES) {
      const original = /^\/images\/([^/]+)$/.exec(url.pathname);
      const poster = /^\/images\/thumb\/([^/]+)\/\d+px--[^/]+\.jpg$/.exec(url.pathname);
      const file = original?.[1] ?? poster?.[1];
      if (!file) return src;
      // A name card is five times wider than it's tall, so it needs more pixels across to fill the same card.
      const size = width > 420 ? 640 : /^NameCard/i.test(file) ? 480 : 240;
      return poster ? `${url.origin}/images/thumb/${file}/${size}px--${file}.jpg` : `${url.origin}/images/thumb/${file}/${size}px-${file}`;
    }
    if (!RESIZABLE_HOSTS.has(url.hostname)) return src;
    return `${RESIZER}?url=${encodeURIComponent(url.host + url.pathname)}&w=${width}&output=webp&q=80`;
  } catch {
    return src;
  }
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
