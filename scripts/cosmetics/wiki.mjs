// Imports a hand-made export of the community Overwatch Wiki (https://overwatch.wiki/, CC BY-NC-SA 3.0).
//
// This file makes no network requests, on purpose. The wiki's terms don't allow automated access without
// consent, so a person exports the pages from Special:Export in their own browser and this reads that file.
// See docs/COSMETICS_DATA.md for the steps.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, loadCore, logChange, writeJson } from './common.mjs';

const WIKI_PAGE = 'https://overwatch.wiki/w/';
export const pageUrl = (title) => `${WIKI_PAGE}${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':')}`;

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#039;': "'", '&#39;': "'" };
const decodeXml = (text) => text.replace(/&(?:lt|gt|amp|quot|apos|#0?39);/g, (match) => ENTITIES[match]);

const EXPORT_PAGES = ['Cosmetics', 'Skins', 'Weapon Skins', 'Weapon Charms', 'Souvenirs', 'Sprays', 'Emotes', 'Victory Poses', 'Highlight Intros', 'Voice lines', 'Player Icons', 'Name Cards', 'Player Titles', 'Weapon Variants', 'Mythic Skins', 'Mythic Shop', 'Mythic Prisms', 'Battle Pass', 'Season', 'Season/2026', 'Loot Box', 'Shop', 'Twitch Drops', 'Overwatch Esports', 'Overwatch League', 'Limited-time event', 'Overwatch Coins', 'Credits', 'Competitive Points', 'Challenges', 'Achievements', 'Winter Wonderland', 'Summer Games', 'Lunar New Year', 'Halloween Terror', 'Overwatch Anniversary', 'Archives', 'Stadium'];

/** Links this long or longer have been cut off on the way to a browser, which silently loses pages. */
const MAX_LINK_LENGTH = 1700;

const linkFor = (pages) => `https://overwatch.weirdgloop.org/w/Special:Export?curonly=1&templates=1&wpDownload=1&pages=${encodeURIComponent(pages.join('\n'))}`;

/**
 * The links a person opens in their own browser. Each gives one XML file, with the templates its pages use.
 * The settings come first in the link, so a link cut short still can't lose them, and the pages are split across links.
 */
export function exportLinks(heroNames) {
  const links = [];
  let batch = [];
  const pages = [...heroNames.map((name) => `${name}/Cosmetics`), ...EXPORT_PAGES, ...heroNames.map((name) => `${name}/Quotes`)];
  for (const page of pages) {
    if (batch.length > 0 && linkFor([...batch, page]).length > MAX_LINK_LENGTH) {
      links.push(linkFor(batch));
      batch = [];
    }
    batch.push(page);
  }
  if (batch.length > 0) links.push(linkFor(batch));
  return links;
}

/** Splits a Special:Export file into pages. Plain string work, so a very large file doesn't need an XML tree in memory. */
export function readExport(xml) {
  if (!/<mediawiki[\s>]/.test(xml.slice(0, 4000))) throw new Error('This is not a Special:Export file.');
  const pages = [];
  const sitename = /<sitename>([^<]*)<\/sitename>/.exec(xml)?.[1] ?? null;
  let position = 0;
  for (;;) {
    const start = xml.indexOf('<page>', position);
    if (start === -1) break;
    const end = xml.indexOf('</page>', start);
    if (end === -1) break;
    const block = xml.slice(start, end);
    position = end + 7;
    const title = /<title>([^<]*)<\/title>/.exec(block)?.[1];
    if (!title) continue;
    const text = /<text\b[^>]*>([\s\S]*?)<\/text>/.exec(block)?.[1] ?? '';
    pages.push({ title: decodeXml(title), timestamp: /<timestamp>([^<]*)<\/timestamp>/.exec(block)?.[1] ?? null, text: decodeXml(text) });
  }
  return { sitename, pages };
}

const INVISIBLE = /[‎‏​ㅤ ]/g;

/** Plain text from wiki markup: links keep their label, templates and tags go. */
export function plainText(markup) {
  let text = markup.replace(INVISIBLE, ' ');
  for (let pass = 0; pass < 4 && text.includes('{{'); pass += 1) {
    text = text
      .replace(/\{\{\s*(?:rl|raritylink)\s*\|[^{}]*?\btext\s*=\s*([^|{}]+)[^{}]*\}\}/gi, '$1')
      .replace(/\{\{\s*(?:rl|raritylink)\s*\|[^|{}=]*\|([^|{}=]*)\}\}/gi, '$1')
      .replace(/\{\{[^{}]*\}\}/g, ' ');
  }
  return text
    .replace(/<ref[^>]*\/>/g, ' ')
    .replace(/<ref[\s\S]*?<\/ref>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, ' ')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:[^\s\]]+\s+([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parameters of a template call, with nested templates kept whole: {{CPB|h=Ana Skin|n=Citrine}}. */
export function templateParams(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let index = 0; index < body.length; index += 1) {
    const pair = body.slice(index, index + 2);
    if (pair === '{{' || pair === '[[') {
      depth += 1;
      current += pair;
      index += 1;
    } else if (pair === '}}' || pair === ']]') {
      depth -= 1;
      current += pair;
      index += 1;
    } else if (body[index] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += body[index];
    }
  }
  parts.push(current);
  const named = {};
  for (const part of parts.slice(1)) {
    const mark = part.indexOf('=');
    if (mark > 0) named[part.slice(0, mark).trim().toLowerCase()] = part.slice(mark + 1).trim();
  }
  return { name: parts[0].trim(), named };
}

/** Every top-level {{template}} in order, with where it starts. */
export function topTemplates(text) {
  const found = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('{{', index);
    if (start === -1) break;
    let depth = 0;
    let cursor = start;
    for (; cursor < text.length - 1; cursor += 1) {
      const pair = text.slice(cursor, cursor + 2);
      if (pair === '{{') {
        depth += 1;
        cursor += 1;
      } else if (pair === '}}') {
        depth -= 1;
        cursor += 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break;
    found.push({ start, end: cursor + 1, ...templateParams(text.slice(start + 2, cursor - 1)) });
    index = cursor + 1;
  }
  return found;
}

const RARITY_LETTER = { c: 'common', r: 'rare', e: 'epic', l: 'legendary', u: 'ultra', m: 'mythic' };

const EVENT_NAMES = new Map(
  Object.entries({
    'lunar new year': ['lunar-new-year', 'Lunar New Year'],
    lunar: ['lunar-new-year', 'Lunar New Year'],
    'overwatch anniversary': ['anniversary', 'Anniversary'],
    anniversary: ['anniversary', 'Anniversary'],
    'halloween terror': ['halloween-terror', 'Halloween Terror'],
    halloween: ['halloween-terror', 'Halloween Terror'],
    'winter wonderland': ['winter-wonderland', 'Winter Wonderland'],
    winter: ['winter-wonderland', 'Winter Wonderland'],
    'summer games': ['summer-games', 'Summer Games'],
    summer: ['summer-games', 'Summer Games'],
    archives: ['archives', 'Archives'],
    'overwatch archives': ['archives', 'Archives'],
    stadium: ['stadium', 'Stadium'],
    'gi-joe': ['gi-joe', 'G.I. Joe'],
    'g.i. joe': ['gi-joe', 'G.I. Joe'],
  }),
);

const PRICE_WORDS = [
  ['Credits', 'credits'],
  ['Coins', 'coins'],
  ['Mythic Prisms', 'prisms'],
  ['Competitive Points|Comp Points|CP', 'competitive-points'],
  ['League Tokens?', 'league-tokens'],
];
const PRICE_PATTERNS = PRICE_WORDS.flatMap(([word, currency]) => [
  [new RegExp(`\\{\\{\\s*(?:${word})\\s*\\}\\}\\s*'*\\s*([\\d,]+)`, 'i'), currency],
  [new RegExp(`([\\d,]+)\\s*'*\\s*\\{\\{\\s*(?:${word})\\s*\\}\\}`, 'i'), currency],
]);

/** What a section heading says about the cosmetics under it: rarity, prices, origin and event. */
export function readGroupLabel(raw) {
  const group = { rarity: null, prices: [], tags: [], event: null, eventLabel: null, acquisition: [], limited: false };

  const rarityCall = /\{\{\s*(?:rl|raritylink)\s*\|\s*(?:rarity\s*=\s*)?([crelum])\b[^{}]*\}\}/i.exec(raw) ?? /\{\{\s*(?:rl|raritylink)\s*\|[^{}]*rarity\s*=\s*([crelum])\b[^{}]*\}\}/i.exec(raw);
  if (rarityCall) group.rarity = RARITY_LETTER[rarityCall[1].toLowerCase()];
  else if (/\bcommon\b/i.test(raw)) group.rarity = 'common';

  const labelCall = /\{\{\s*rl\s*\|\s*[crelum]\s*\|\s*([^|{}]+?)\s*\}\}/i.exec(raw);
  const linked = [...raw.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((match) => match[1].trim());
  const labels = [labelCall?.[1], ...linked].filter(Boolean);

  for (const [pattern, currency] of PRICE_PATTERNS) {
    const match = pattern.exec(raw);
    if (match && !group.prices.some((price) => price.currency === currency)) group.prices.push({ amount: Number(match[1].replace(/,/g, '')), currency });
  }
  if (group.prices.some((price) => price.currency === 'credits')) group.tags.push('gallery');
  if (/\(free\)|\bfree\b/i.test(raw)) group.tags.push('base');
  if (/\{\{\s*Locked\s*\}\}/i.test(raw)) group.limited = true;

  for (const label of labels) {
    const key = label.toLowerCase();
    if (key === 'battle pass') group.tags.push('battle-pass');
    else if (key === 'shop') group.tags.push('shop');
    else if (key === 'mythic shop') group.tags.push('mythic-shop');
    else if (key === 'hero gallery') group.tags.push('gallery');
    else if (key === 'progression' || key === 'base') group.tags.push('base');
    else if (key === 'achievements' || key === 'achievement') group.tags.push('achievement');
    else if (key === 'challenges') group.tags.push('challenge');
    else if (/^season\b/.test(key) || /^(?:events?|emotes?|sprays?|skins?|cosmetics?|name cards?|player icons?|voice lines?)$/.test(key)) continue;
    else if (key === 'twitch drops') group.tags.push('twitch');
    else if (/esports|overwatch league|\bowl\b|owcs|contenders|world cup/.test(key)) group.tags.push('esports');
    else if (key.length > 2) {
      const collab = /^overwatch(?: 2)? x (.+)$/i.exec(label);
      const name = (collab ? collab[1] : label).replace(/\s*\(mission\)$/i, '');
      const known = EVENT_NAMES.get(key) ?? EVENT_NAMES.get(name.toLowerCase());
      group.event = known?.[0] ?? name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      group.eventLabel = known?.[1] ?? name;
      group.tags.push('event');
      if (collab) group.tags.push('collab');
      if (/challenge$/.test(key)) group.tags.push('challenge');
      if (key !== 'stadium') group.limited = true;
    }
  }

  const text = plainText(raw);
  if (/\bchallenges?\b/i.test(text)) {
    group.tags.push('challenge');
    group.limited = true;
  }
  if (/^progression\b/i.test(text) || /^default$/i.test(text)) group.tags.push('base');
  if (group.limited) group.tags.push('limited');
  group.tags = [...new Set(group.tags)];

  if (group.prices.length > 0) group.acquisition.push(...group.prices.map((price) => `Listed at ${price.amount.toLocaleString('en-US')} ${price.currency === 'prisms' ? 'Mythic Prisms' : price.currency.replace(/-/g, ' ')}`));
  if (group.eventLabel) group.acquisition.push(`From ${group.eventLabel}`);
  else if (group.tags.includes('battle-pass')) group.acquisition.push('From a Battle Pass');
  else if (group.tags.includes('base')) group.acquisition.push('Available from the start or through progression');
  else if (group.tags.includes('achievement')) group.acquisition.push('From an achievement');
  const challenge = /(?:^|[\s"'])([^"']*?\bchallenges?\b)/i.exec(text.replace(group.eventLabel ?? '', ''));
  if (group.tags.includes('challenge') && challenge) group.acquisition.push(`From the ${challenge[1].replace(/^[\s"']+|[\s"']+$/g, '')}`.replace(/\s+/g, ' '));
  group.text = text;
  return group;
}

/**
 * Reads a hero's cosmetics table. Headers and items sit in rows, and an item belongs to the header above its column:
 *   {{CTS|n=...|c=2}} {{CTS|n=...}}   two headers, side by side
 *   {{CPB|n=Tal|c=2}} {{CPB|n=Cybermedic|c=2}}   one item under each
 */
export function parseCosmeticTable(text, { type, hero, pageTitle }) {
  const records = [];
  const seen = new Set();
  const lines = text.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, '').split('\n');
  let headers = [];
  let headerRowOpen = false;
  let column = 0;
  let width = 4;
  const heroParam = (named) => named.h ?? '';

  // How wide the table is decides when items wrap to the next row.
  let rowWidth = 0;
  let widest = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|-')) {
      widest = Math.max(widest, rowWidth);
      rowWidth = 0;
    } else if (trimmed === '|') {
      rowWidth += 1;
    } else {
      for (const call of topTemplates(trimmed)) {
        if (/^(CPB|CVB)$/i.test(call.name)) rowWidth += Number(call.named.c) || 1;
      }
    }
  }
  width = Math.max(widest, rowWidth, 1);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|-')) {
      headerRowOpen = false;
      column = 0;
      continue;
    }
    if (trimmed === '|') {
      column += 1;
      continue;
    }
    for (const call of topTemplates(trimmed)) {
      if (/^CTS$/i.test(call.name)) {
        if (!headerRowOpen) {
          headers = [];
          headerRowOpen = true;
          column = 0;
        }
        const used = headers.reduce((sum, header) => sum + header.span, 0);
        headers.push({ span: Number(call.named.c) || Math.max(1, width - used), group: readGroupLabel(call.named.n ?? '') });
      } else if (/^(CPB|CVB)$/i.test(call.name)) {
        headerRowOpen = false;
        const span = Number(call.named.c) || 1;
        const name = plainText(call.named.n ?? '');
        if (name) {
          const position = column % width;
          let edge = 0;
          let group = headers[0]?.group ?? null;
          for (const header of headers) {
            edge += header.span;
            if (position < edge) {
              group = header.group;
              break;
            }
          }
          const key = `${type}|${hero ?? ''}|${name.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            const file = heroParam(call.named) ? `${heroParam(call.named)} ${(call.named.l ?? call.named.n).trim()}.${/^CVB$/i.test(call.name) ? 'webm' : 'png'}` : null;
            records.push({
              type,
              hero,
              name,
              rarity: group?.rarity ?? null,
              event: group?.event ?? null,
              eventLabel: group?.eventLabel ?? null,
              tags: group?.tags ?? [],
              prices: group?.prices ?? [],
              acquisition: group?.acquisition ?? [],
              file,
              page: pageUrl(pageTitle),
              pageTitle,
            });
          }
        }
        column += span;
      }
    }
  }
  return records;
}

const SEASON_LINE = /^(?:(\d{4})[:\s]+)?season\s+(\d+)\b/i;

/** Reads pages made of <gallery> blocks under headings, such as Weapon Charms and Souvenirs. */
export function parseGalleries(text, { type, pageTitle, defaults = {} }) {
  const records = [];
  const seen = new Set();
  const context = { heading: '', sub: '', group: null, sectionGroup: null, season: null, era: 'ow2' };
  let inGallery = false;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const eraMark = /<center>\s*'''([^']+)'''/.exec(line);
    if (eraMark && !line.includes('File:')) {
      if (/reign of talon|^\s*overwatch\s*$|2026/i.test(eraMark[1] + line)) context.era = /overwatch 2/i.test(eraMark[1]) ? 'ow2' : '2026';
      else if (/overwatch 2/i.test(eraMark[1])) context.era = 'ow2';
    }
    const heading = /^(={2,6})\s*(.+?)\s*\1$/.exec(line);
    if (heading) {
      context.heading = heading[2];
      context.sectionGroup = readGroupLabel(heading[2]);
      context.group = null;
      context.season = null;
      continue;
    }
    if (line.startsWith(';')) {
      const label = line.slice(1).trim();
      const season = SEASON_LINE.exec(plainText(label));
      if (season) context.season = Number(season[1]) >= 2026 ? `${season[1]}-s${season[2]}` : context.era === '2026' ? `2026-s${season[2]}` : `ow2-s${season[2]}`;
      else context.group = readGroupLabel(label);
      continue;
    }
    if (/can be bought for|cost/i.test(line) && !inGallery && context.sectionGroup) {
      const prices = readGroupLabel(line).prices;
      if (prices.length > 0) context.sectionGroup = { ...context.sectionGroup, prices };
      continue;
    }
    if (/^<gallery\b/i.test(line)) {
      inGallery = true;
      continue;
    }
    if (/^<\/gallery>/i.test(line)) {
      inGallery = false;
      continue;
    }
    if (!inGallery) continue;
    const match = /^(?:File|Image):\s*([^|]+?)\s*\|(.*)$/i.exec(line);
    if (!match) continue;
    const name = plainText(match[2]);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const group = context.group ?? context.sectionGroup;
    const tags = [...new Set([...(defaults.tags ?? []), ...(context.sectionGroup?.tags ?? []), ...(group?.tags ?? [])])];
    records.push({
      type,
      hero: defaults.hero ?? null,
      name,
      rarity: group?.rarity ?? defaults.rarity ?? null,
      event: group?.event ?? context.sectionGroup?.event ?? null,
      eventLabel: group?.eventLabel ?? context.sectionGroup?.eventLabel ?? null,
      season: context.season,
      tags,
      prices: group?.prices?.length ? group.prices : context.sectionGroup?.prices ?? [],
      acquisition: group?.acquisition ?? context.sectionGroup?.acquisition ?? [],
      file: match[1].replace(/_/g, ' '),
      page: pageUrl(pageTitle),
      pageTitle,
    });
  }
  return records;
}

/** Reads the "Title | Requirements | Notes" tables on the Player Titles page. */
export function parseTitles(text, pageTitle) {
  const records = [];
  const seen = new Set();
  for (const table of text.split('{|').slice(1)) {
    const body = table.split('|}')[0];
    if (!/^\s*!\s*Title\b/im.test(body)) continue;
    for (const row of body.split(/\n\|-/).slice(1)) {
      const cells = row
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('|') && !line.startsWith('|-'))
        .map((line) => plainText(line.slice(1)));
      const name = cells[0];
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      records.push({ type: 'player-title', hero: null, name, rarity: null, event: null, eventLabel: null, tags: ['challenge'], prices: [], acquisition: cells[1] ? [cells[1]] : [], file: null, page: pageUrl(pageTitle), pageTitle });
    }
  }
  return records;
}

const seasonFromCell = (cell) => {
  const text = plainText(cell);
  const year = /Season\/(\d{4})|(\d{4})\s*[:\s]\s*Season|\((\d{4})\)/i.exec(cell);
  const number = /(\d+)\s*(?:\(\d{4}\))?\s*$/.exec(text) ?? /Season[_ ](\d+)/i.exec(cell);
  if (!number) return null;
  const when = Number(year?.[1] ?? year?.[2] ?? year?.[3]);
  return when >= 2026 ? `${when}-s${number[1]}` : `ow2-s${number[1]}`;
};

/** Reads the mythic list: season, hero, name, and each customization group with its number of choices. */
export function parseMythics(text, core, pageTitle) {
  const items = [];
  for (const row of text.split(/\n\|-/).slice(1)) {
    const cells = [];
    for (const line of row.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && !trimmed.startsWith('|}') && !trimmed.startsWith('|+')) cells.push(trimmed.slice(1).trim());
      else if (trimmed.startsWith('*') && cells.length > 0) cells[cells.length - 1] += `\n${trimmed}`;
    }
    if (cells.length < 4) continue;
    const hero = core.heroIdFromName(plainText(cells[1]));
    const name = plainText(cells[2]);
    if (!hero || !name) continue;
    const options = [...row.matchAll(/^\s*\*\s*([^\n*-][^\n-]*?)\s*-\s*(\d+)\s*$/gm)].map((match) => ({ name: plainText(match[1]), count: Number(match[2]) }));
    const file = /\[\[File:([^\]|]+)/i.exec(cells[3])?.[1]?.trim() ?? null;
    items.push({
      id: core.slugify(`${hero} ${name}`),
      name,
      kind: 'skin',
      hero,
      season: seasonFromCell(cells[0]),
      file,
      options,
      prisms: null,
      note: null,
      sources: [{ source: 'Overwatch Wiki', title: pageTitle, url: pageUrl(pageTitle), checkedAt: null }],
    });
  }
  return items;
}

const QUOTE_CALL = /\{\{\s*QuoteTranslation\s*\|[^{}]*?\bquote\s*=\s*([^|{}]+)/i;
const TRANSLATION = /\{\{\s*QuoteTranslation\s*\|[^{}]*?\btranslation\s*=\s*([^|{}]+)/i;

const unique = (list) => [...new Set(list)];

/** What an inner cell adds to the group it sits under. */
function combineGroups(outer, inner) {
  if (!inner) return outer;
  if (!outer) return inner;
  return {
    ...outer,
    rarity: outer.rarity ?? inner.rarity,
    event: outer.event ?? inner.event,
    eventLabel: outer.eventLabel ?? inner.eventLabel,
    prices: inner.prices.length > 0 ? inner.prices : outer.prices,
    tags: unique([...outer.tags, ...inner.tags]),
    acquisition: unique([...(inner.prices.length > 0 ? outer.acquisition.filter((line) => !line.startsWith('Listed at')) : outer.acquisition), ...inner.acquisition]),
  };
}

/** "Season 4", "Season 4 (2026)" and "2026: Season 4" all name one season. Returns null for anything else. */
export function seasonFromText(text) {
  const plain = plainText(text);
  const match = /^(?:(\d{4})\s*:\s*)?Season\s+(\d+)(?:\s*\((\d{4})\))?$/i.exec(plain);
  if (!match) return null;
  const year = Number(match[1] ?? match[3]);
  return year >= 2026 ? `${year}-s${match[2]}` : `ow2-s${match[2]}`;
}

/** Reads the Voice Lines table on a hero's Quotes page. A group cell spans the rows under it, and some have a season cell inside. */
export function parseVoiceLines(text, { hero, pageTitle }) {
  const start = text.search(/^={2,4}\s*Voice Lines\s*={2,4}\s*$/im);
  if (start === -1) return [];
  const rest = text.slice(start);
  const lineEnd = rest.indexOf(String.fromCharCode(10));
  const nextHeading = rest.slice(lineEnd).search(/^={2,3}[^=]/m);
  const section = nextHeading === -1 ? rest : rest.slice(0, lineEnd + nextHeading);
  const records = [];
  const seen = new Set();
  let group = null;
  let inner = null;
  let season = null;

  for (const row of section.split(/\n\|-/).slice(1)) {
    const cells = row
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|') && !line.startsWith('|}') && !line.startsWith('|-'))
      .map((line) => line.slice(1).trim());
    let quote = null;
    for (const cell of cells) {
      if (/^\{\{\s*Audio\b/i.test(cell)) continue;
      const span = /^(?:rowspan|colspan)=[^|]*\|\s*(.*)$/i.exec(cell);
      if (span) {
        const label = span[1];
        const namedSeason = seasonFromText(label);
        if (/<big>/i.test(label)) {
          group = readGroupLabel(label);
          inner = null;
          season = null;
        } else if (namedSeason) {
          season = namedSeason;
          inner = null;
        } else {
          inner = readGroupLabel(label);
        }
        continue;
      }
      quote = cell;
    }
    if (!quote) continue;
    const translated = QUOTE_CALL.exec(quote);
    const rawName = plainText(translated ? translated[1] : quote);
    const from = /\s*\((?:from the |from )?([^()]*\bbundle)\)\s*$/i.exec(rawName);
    const name = from ? rawName.slice(0, from.index) : rawName;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const meaning = TRANSLATION.exec(quote);
    const combined = combineGroups(group, inner);
    const acquisition = from ? unique([...(combined?.acquisition ?? []), `Sold with the ${from[1]}`]) : combined?.acquisition ?? [];
    records.push({
      type: 'voice-line',
      hero,
      name,
      rarity: null,
      event: combined?.event ?? null,
      eventLabel: combined?.eventLabel ?? null,
      season,
      tags: combined?.tags ?? [],
      prices: combined?.prices ?? [],
      acquisition,
      description: meaning ? `Means "${plainText(meaning[1])}"` : null,
      file: null,
      page: pageUrl(pageTitle),
      pageTitle,
    });
  }
  return records;
}

/** "Template:Ana Skins" and the like: the hero's name, and which kind of cosmetic the table lists. */
const HERO_TEMPLATE = /^Template:(.+?) (Weapon Skins|Skins|Emotes|VP|Intros|HI|Sprays)$/;
const TEMPLATE_TYPE = { Skins: 'skin', 'Weapon Skins': 'weapon-skin', Emotes: 'emote', VP: 'victory-pose', Intros: 'highlight-intro', HI: 'highlight-intro', Sprays: 'spray' };

const GALLERY_PAGES = {
  'Weapon Charms': { type: 'weapon-charm', defaults: { rarity: 'epic' } },
  Souvenirs: { type: 'souvenir', defaults: { rarity: 'rare' } },
  'Player Icons': { type: 'player-icon', defaults: { rarity: 'rare' } },
  'Name Cards': { type: 'name-card', defaults: { rarity: 'rare' } },
};

/** Skin descriptions from a hero's cosmetics page: ";{{rl|e|Shrike}}" followed by ":text". */
export function parseSkinDescriptions(text) {
  const found = new Map();
  const lines = text.split('\n');
  for (let index = 0; index < lines.length - 1; index += 1) {
    const name = /^;\s*\{\{\s*rl\s*\|\s*[crelum]\s*\|\s*([^|{}]+?)\s*\}\}/i.exec(lines[index].trim());
    if (!name) continue;
    const body = lines[index + 1].trim();
    if (body.startsWith(':')) found.set(name[1].toLowerCase(), plainText(body.slice(1)));
  }
  return found;
}

/** Turns a parsed export into normalized files. Nothing is written if the file doesn't look right. */
export function normalizeExport(exported, core, { heroIds }) {
  const records = [];
  const parsedPages = [];
  const unused = [];
  const descriptions = new Map();
  let mythics = [];

  for (const page of exported.pages) {
    const hero = HERO_TEMPLATE.exec(page.title);
    if (hero) {
      const heroId = core.heroIdFromName(hero[1]);
      if (!heroId || !heroIds.has(heroId)) {
        unused.push(page.title);
        continue;
      }
      const list = parseCosmeticTable(page.text, { type: TEMPLATE_TYPE[hero[2]], hero: heroId, pageTitle: `${hero[1]}/Cosmetics` });
      records.push(...list);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: list.length });
      continue;
    }
    const quotesPage = /^(.+)\/Quotes$/.exec(page.title);
    if (quotesPage) {
      const heroId = core.heroIdFromName(quotesPage[1]);
      if (!heroId || !heroIds.has(heroId)) {
        unused.push(page.title);
        continue;
      }
      const list = parseVoiceLines(page.text, { hero: heroId, pageTitle: page.title });
      records.push(...list);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: list.length });
      continue;
    }
    const cosmeticsPage = /^(.+)\/Cosmetics$/.exec(page.title);
    if (cosmeticsPage) {
      const heroId = core.heroIdFromName(cosmeticsPage[1]);
      if (heroId) for (const [name, text] of parseSkinDescriptions(page.text)) descriptions.set(`${heroId}|${name}`, text);
      continue;
    }
    if (GALLERY_PAGES[page.title]) {
      const { type, defaults } = GALLERY_PAGES[page.title];
      const list = parseGalleries(page.text, { type, pageTitle: page.title, defaults });
      records.push(...list);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: list.length });
      continue;
    }
    if (page.title === 'Player Titles') {
      const list = parseTitles(page.text, page.title);
      records.push(...list);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: list.length });
      continue;
    }
    if (page.title === 'Mythic Skins') {
      mythics = parseMythics(page.text, core, page.title);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: mythics.length });
      continue;
    }
    unused.push(page.title);
  }

  for (const record of records) {
    if (record.type === 'skin' && record.hero) {
      const text = descriptions.get(`${record.hero}|${record.name.toLowerCase()}`);
      if (text) record.description = text;
    }
  }

  // Mythic weapons appear in each hero's weapon skin table.
  for (const record of records) {
    if (record.type === 'weapon-skin' && record.rarity === 'mythic') {
      mythics.push({
        id: core.slugify(`${record.hero} ${record.name} weapon`),
        name: record.name,
        kind: 'weapon',
        hero: record.hero,
        season: null,
        file: record.file,
        options: [],
        prisms: record.prices.find((price) => price.currency === 'prisms')?.amount ?? null,
        note: null,
        sources: [{ source: 'Overwatch Wiki', title: record.pageTitle, url: record.page, checkedAt: null }],
      });
    }
  }
  // A mythic skin's Prism price comes from the hero's skin table.
  const skinPrice = new Map(records.filter((record) => record.type === 'skin' && record.rarity === 'mythic').map((record) => [`${record.hero}|${record.name.toLowerCase()}`, record.prices.find((price) => price.currency === 'prisms')?.amount ?? null]));
  for (const item of mythics) {
    if (item.kind === 'skin') item.prisms = skinPrice.get(`${item.hero}|${item.name.toLowerCase()}`) ?? null;
  }

  const events = new Map();
  for (const record of records) if (record.event) events.set(record.event, record.eventLabel ?? record.event);

  return { records, mythics, parsedPages, unused, events: [...events].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)) };
}

/** Reads one or more export files as one, where a page in a later file replaces the same page in an earlier one. */
export function readExports(files) {
  const pages = new Map();
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`No file at ${file}`);
    for (const page of readExport(fs.readFileSync(file, 'utf8')).pages) pages.set(page.title, page);
  }
  return { pages: [...pages.values()] };
}

export async function importWikiExport(fileOrFiles, { minRecords = 500 } = {}) {
  const files = [fileOrFiles].flat();
  const core = await loadCore();
  const { loadHeroes } = await import('./heroes-list.mjs');
  const { HEROES } = await loadHeroes();
  const exported = readExports(files);
  const normalized = normalizeExport(exported, core, { heroIds: new Set(HEROES.map((hero) => hero.id)) });

  // A partial or wrong export must not replace a good catalogue with a small one.
  if (normalized.records.length < minRecords) {
    throw new Error(`Only ${normalized.records.length} cosmetics were read from ${exported.pages.length} pages, so nothing was changed. Check that this is the full export.`);
  }

  const stamp = new Date(Math.max(...files.map((file) => fs.statSync(file).mtimeMs))).toISOString();
  const dir = path.join(DATA_DIR, 'wiki');
  const sorted = [...normalized.records].sort((a, b) => a.type.localeCompare(b.type) || (a.hero ?? '').localeCompare(b.hero ?? '') || a.name.localeCompare(b.name));
  writeJson(path.join(dir, 'catalog.json'), sorted);
  writeJson(path.join(dir, 'mythics.json'), normalized.mythics);
  writeJson(path.join(dir, 'events.json'), normalized.events);
  writeJson(path.join(dir, 'import.json'), { exportedAt: stamp, pages: exported.pages.length, records: sorted.length, parsedPages: normalized.parsedPages, unusedPages: normalized.unused });
  logChange({ source: 'wiki', action: 'import', pages: exported.pages.length, records: sorted.length, mythics: normalized.mythics.length });
  return { summary: `Read ${exported.pages.length} pages: ${sorted.length} cosmetics, ${normalized.mythics.length} mythics, ${normalized.events.length} events. ${normalized.unused.length} pages weren't used.` };
}
