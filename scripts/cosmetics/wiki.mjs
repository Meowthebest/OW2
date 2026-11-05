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

const EXPORT_PAGES = ['Cosmetics', 'Skins', 'Weapon Skins', 'Weapon Charms', 'Souvenirs', 'Sprays', 'Emotes', 'Victory Poses', 'Highlight Intros', 'Voice lines', 'Player Icons', 'Name Cards', 'Player Titles', 'Weapon Variants', 'Mythic Skins', 'Mythic Shop', 'Mythic Prisms', 'Battle Pass', 'List of previous Battle Passes/2022-2026', 'List of previous Battle Passes/2026', 'Season', 'Season/2022-2026', 'Season/2026', 'Loot Box', 'Shop', 'Twitch Drops', 'Overwatch Esports', 'Overwatch Esports Skins', 'OWL Skins (Overwatch 1)', 'OWL Skins (Overwatch 2)', 'Overwatch League', 'Limited-time event', 'Seasonal events', 'List of Limited-Time Events/Overwatch', 'Overwatch Coins', 'Credits', 'Competitive Points', 'Challenges', 'Achievements', 'Winter Wonderland', 'Summer Games', 'Lunar New Year', 'Halloween Terror', 'Overwatch Anniversary', 'Archives', 'Stadium'];

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

const unique = (list) => [...new Set(list)];

/** Link targets for the same event, however a page spells them. */
const SAME_EVENTS = [
  [['lunar new year', 'lunar'], 'lunar-new-year', 'Lunar New Year'],
  [['overwatch anniversary', 'overwach anniversary', 'anniversary'], 'anniversary', 'Anniversary'],
  [['halloween terror', 'halloween'], 'halloween-terror', 'Halloween Terror'],
  [['winter wonderland', 'winter'], 'winter-wonderland', 'Winter Wonderland'],
  [['summer games', 'summer'], 'summer-games', 'Summer Games'],
  [['archives', 'overwatch archives'], 'archives', 'Archives'],
  [['stadium'], 'stadium', 'Stadium'],
  [['gi-joe', 'g.i. joe'], 'gi-joe', 'G.I. Joe'],
  [['hero mastery', 'hero mastery (event)', 'hero mastery gauntlet'], 'hero-mastery', 'Hero Mastery'],
  [['pachimarchi', 'pachimari event'], 'pachimarchi', 'PachiMarchi'],
  [['starwatch', 'starwatch: galactic rescue'], 'starwatch', 'Starwatch'],
  [['blizzcon', 'blizzconline'], 'blizzcon', 'BlizzCon'],
  [['bcrf charity event'], 'bcrf-charity-event', 'BCRF Charity Event'],
  [['celebrate pride'], 'celebrate-pride', 'Celebrate Pride'],
];
const EVENT_NAMES = new Map(SAME_EVENTS.flatMap(([names, id, label]) => names.map((name) => [name, [id, label]])));

/** Link targets that say how a cosmetic was sold, rather than which event it belongs to. */
const TAG_LABELS = new Map(
  Object.entries({
    'battle pass': 'battle-pass',
    'shop': 'shop',
    'mythic shop': 'mythic-shop',
    'hero gallery': 'gallery',
    progression: 'base',
    base: 'base',
    achievements: 'achievement',
    achievement: 'achievement',
    challenges: 'challenge',
    'hero challenges': 'challenge',
    'twitch drops': 'twitch',
    'twitch rewards': 'twitch',
    'loot box': 'loot-box',
    'loot boxes': 'loot-box',
    competitive: 'competitive',
    'competitive play': 'competitive',
  }),
);
const HOW_TO_GET = new Map(
  Object.entries({
    'origins edition': 'From the Origins Edition',
    'overwatch: origins edition': 'From the Origins Edition',
    'season 10 reward': 'A Season 10 reward',
    'story mission': 'From a Story Mission',
    'story missions': 'From a Story Mission',
    'support a streamer': 'From Support a Streamer',
  }),
);
const IGNORED_LABEL = /^(?:seasons?|season\/.*|reign of talon.*|events?|emotes?|sprays?|skins?|weapon skins?|cosmetics?|name cards?|player icons?|voice lines?|mythics?|mythic skins?|special|universal emote|overwatch|overwatch 2|heroes|hero|trivia)$/;
const ESPORTS_LABEL = /esports|overwatch league|\bowl\b|owcs|overwatch champions series|contenders|world cup|calling all heroes|collegiate/;

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

/** A link target without its anchor or underscores, so "Overwatch_League#Skins" reads as "Overwatch League". */
const normalizeLabel = (label) => label.replace(/_/g, ' ').replace(/#.*$/, '').replace(/^[a-z]{2,4}:/, '').replace(/\s*\(mission\)$/i, '').trim();

const eventFromLabel = (label) => {
  const key = label.toLowerCase();
  if (/^blizzcon\b/.test(key)) return { id: 'blizzcon', label: 'BlizzCon', collab: false };
  const collab = /^overwatch(?: 2)? x (.+)$/i.exec(label) ?? /^(.+?) x overwatch(?: 2)?$/i.exec(label);
  const name = collab ? collab[1] : label;
  const known = EVENT_NAMES.get(key) ?? EVENT_NAMES.get(name.toLowerCase());
  if (known) return { id: known[0], label: known[1], collab: Boolean(collab) };
  return { id: name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label: name, collab: Boolean(collab) };
};

/** What a section heading says about the cosmetics under it: rarity, prices, origin and event. */
export function readGroupLabel(raw) {
  const group = { rarity: null, prices: [], tags: [], event: null, eventLabel: null, acquisition: [], limited: false };
  const text = plainText(raw);

  const rarityCall = /\{\{\s*(?:rl|raritylink)\s*\|\s*(?:rarity\s*=\s*)?([crelum])\b[^{}]*\}\}/i.exec(raw) ?? /\{\{\s*(?:rl|raritylink)\s*\|[^{}]*rarity\s*=\s*([crelum])\b[^{}]*\}\}/i.exec(raw);
  const rarityWord = /^(common|rare|epic|legendary|ultra|mythic)\b/i.exec(text);
  if (rarityCall) group.rarity = RARITY_LETTER[rarityCall[1].toLowerCase()];
  else if (rarityWord) group.rarity = rarityWord[1].toLowerCase();
  else if (/\bcommon\b/i.test(raw)) group.rarity = 'common';

  const labelCall = /\{\{\s*rl\s*\|\s*[crelum]\s*\|\s*([^|{}]+?)\s*\}\}/i.exec(raw);
  const linked = [...raw.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((match) => match[1].trim()).filter((target) => !/^:?(?:file|image|category):/i.test(target));
  const labels = [labelCall?.[1], ...linked].filter(Boolean).map(normalizeLabel).filter(Boolean);

  for (const [pattern, currency] of PRICE_PATTERNS) {
    const match = pattern.exec(raw);
    if (match && !group.prices.some((price) => price.currency === currency)) group.prices.push({ amount: Number(match[1].replace(/,/g, '')), currency });
  }
  if (group.prices.some((price) => price.currency === 'credits')) group.tags.push('gallery');
  if (/\(free\)|\bfree\b/i.test(raw)) group.tags.push('base');
  if (/\{\{\s*Locked\s*\}\}/i.test(raw)) group.limited = true;
  if (/\{\{\s*Esports Icon\s*\}\}/i.test(raw)) group.tags.push('esports');

  for (const label of labels) {
    const key = label.toLowerCase();
    if (TAG_LABELS.has(key)) group.tags.push(TAG_LABELS.get(key));
    else if (/^list of previous battle passes/.test(key)) group.tags.push('battle-pass');
    else if (/^list of .*challenges$/.test(key)) group.tags.push('challenge');
    else if (HOW_TO_GET.has(key)) group.acquisition.push(HOW_TO_GET.get(key));
    else if (IGNORED_LABEL.test(key)) continue;
    else if (key === 'limited-time event' || /^seasonal events?$/.test(key)) {
      group.tags.push('event');
      group.limited = true;
    } else if (ESPORTS_LABEL.test(key)) group.tags.push('esports');
    else if (/challen/.test(key)) {
      group.tags.push('challenge');
      group.limited = true;
      group.acquisition.push(`From the ${label}`);
    } else if (key.length > 2) {
      const event = eventFromLabel(label);
      group.event = event.id;
      group.eventLabel = event.label;
      group.tags.push('event');
      if (event.collab) group.tags.push('collab');
      if (event.id !== 'stadium') group.limited = true;
    }
  }

  if (labels.length === 0) {
    const plain = text.toLowerCase();
    if (TAG_LABELS.has(plain)) group.tags.push(TAG_LABELS.get(plain));
    else if (plain === 'competitive rewards') group.tags.push('competitive');
    else if (/^(?:events|seasonal|seasonal events|limited-time events?)$/.test(plain)) {
      group.tags.push('event');
      group.limited = true;
    } else if (EVENT_NAMES.has(plain)) {
      const event = eventFromLabel(text);
      group.event = event.id;
      group.eventLabel = event.label;
      group.tags.push('event');
      if (event.id !== 'stadium') group.limited = true;
    }
  }
  if (/\bchallen\w*/i.test(text)) {
    group.tags.push('challenge');
    group.limited = true;
  }
  if (/^progression\b/i.test(text) || /^default\b/i.test(text)) group.tags.push('base');
  if (group.limited) group.tags.push('limited');
  group.tags = unique(group.tags);

  if (group.prices.length > 0) group.acquisition.unshift(...group.prices.map((price) => `Listed at ${price.amount.toLocaleString('en-US')} ${price.currency === 'prisms' ? 'Mythic Prisms' : price.currency.replace(/-/g, ' ')}`));
  if (group.eventLabel) group.acquisition.push(`From ${group.eventLabel}`);
  else if (group.tags.includes('battle-pass')) group.acquisition.push('From a Battle Pass');
  else if (group.tags.includes('base')) group.acquisition.push('Available from the start or through progression');
  else if (group.tags.includes('achievement')) group.acquisition.push('From an achievement');
  else if (group.tags.includes('loot-box')) group.acquisition.push('From a Loot Box');
  else if (group.tags.includes('twitch')) group.acquisition.push('From Twitch Drops');
  else if (group.tags.includes('competitive')) group.acquisition.push('From Competitive play');
  const challenge = /(?:^|[\s"'])([^"']*?\bchallenges?\b)/i.exec(text.replace(group.eventLabel ?? '', ''));
  if (group.tags.includes('challenge') && challenge && !group.acquisition.some((line) => /challen/i.test(line))) group.acquisition.push(`From the ${challenge[1].replace(/^[\s"']+|[\s"']+$/g, '')}`.replace(/\s+/g, ' '));
  group.acquisition = unique(group.acquisition);
  group.text = text;
  return group;
}

/** What a template or page says about everything on it, combined with what a heading says about part of it. */
function withDefaults(defaults, group) {
  if (!defaults) return group;
  if (!group) return defaults;
  const eventDiffers = group.event && defaults.event && group.event !== defaults.event;
  const defaultLines = (defaults.acquisition ?? []).filter((line) => !(eventDiffers && line === `From ${defaults.eventLabel}`));
  return {
    ...defaults,
    ...group,
    rarity: group.rarity ?? defaults.rarity ?? null,
    event: group.event ?? defaults.event ?? null,
    eventLabel: group.eventLabel ?? defaults.eventLabel ?? null,
    prices: group.prices?.length ? group.prices : defaults.prices ?? [],
    tags: unique([...(defaults.tags ?? []), ...(group.tags ?? [])]),
    acquisition: unique([...(group.acquisition ?? []), ...defaultLines]),
  };
}

/** Which season a heading or link names: "Season 4", "2026: Season 4", "Reign of Talon Season 3: Into the Tiger's Den". */
export function seasonFromLabel(raw, { era = 'ow2' } = {}) {
  const plain = plainText(raw).replace(/\s+battle pass$/i, '').trim();
  const match = /^(reign of talon\s*:?\s*|(\d{4})\s*:\s*)?season\s+(\d+)(?:\s*:[^()]*)?(?:\s*\((?:reign of talon|(\d{4}))\))?$/i.exec(plain);
  if (!match) return null;
  const year = Number(match[2] ?? match[4]);
  const isNew = /^reign/i.test(match[1] ?? '') || /reign of talon/i.test(plain) || year >= 2026 || /\/2026#|\bSeason\/2026\b/.test(raw) || (!year && era === '2026');
  return isNew ? `${year >= 2026 ? year : 2026}-s${match[3]}` : `ow2-s${match[3]}`;
}

/** "Season 4", "Season 4 (2026)" and "2026: Season 4" all name one season. Returns null for anything else. */
export const seasonFromText = (text) => seasonFromLabel(text);

/** Which hero a table cell's file prefix belongs to: "Spray Cassidy", "Genji Skin", "S76 Skin Away". */
function heroFromCell(prefix, core) {
  const spray = /^Spray\s+(.+)$/i.exec(prefix.trim());
  const base = spray ? spray[1] : prefix.replace(/\s*(?:Weapon Skin|Skin|Spray)\b.*$/i, '').trim();
  if (!base) return null;
  return core.heroIdFromName(base === 'S76' ? 'Soldier: 76' : base);
}

/**
 * Reads a cosmetics table. Headers and items sit in rows, and an item belongs to the header above its column:
 *   {{CTS|n=...|c=2}} {{CTS|n=...}}   two headers, side by side
 *   {{CPB|n=Tal|c=2}} {{CPB|n=Cybermedic|c=2}}   one item under each
 * A header without a width fills the row, so the next one replaces it. A header naming a season holds until the next.
 * Without a fixed hero, each item's hero comes from its file prefix, such as "Spray Cassidy".
 */
export function parseCosmeticTable(text, { type, hero = null, pageTitle, core = null, defaults = null, nameFor = null }) {
  const records = [];
  const seen = new Set();
  const lines = text.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, '').split('\n');
  let headers = [];
  let headerRowOpen = false;
  let column = 0;
  let width = 4;
  let season = null;
  let era = 'ow2';

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
      if (/^CTH$/i.test(call.name)) {
        if (/reign of talon|season\/2026/i.test(call.named.t ?? '')) era = '2026';
      } else if (/^CTS$/i.test(call.name)) {
        const raw = call.named.n ?? '';
        const named = seasonFromLabel(raw, { era });
        if (named) {
          season = named;
          headers = [];
          headerRowOpen = false;
          column = 0;
          continue;
        }
        if (/^\d{4}$/.test(raw.trim())) {
          season = null;
          headers = [];
          headerRowOpen = false;
          column = 0;
          continue;
        }
        let used = headers.reduce((sum, header) => sum + header.span, 0);
        if (!headerRowOpen || used >= width) {
          headers = [];
          used = 0;
          headerRowOpen = true;
          column = 0;
        }
        headers.push({ span: Number(call.named.c) || Math.max(1, width - used), group: readGroupLabel(raw) });
      } else if (/^(CPB|CVB)$/i.test(call.name)) {
        headerRowOpen = false;
        const span = Number(call.named.c) || 1;
        const prefix = call.named.h ?? '';
        const cellHero = hero ?? (core ? heroFromCell(prefix, core) : null);
        let name = plainText(call.named.n ?? '');
        const note = /^(.*?)\s*\(([^()]+)\)$/.exec(name);
        if (note && core?.heroIdFromName(note[2])) name = note[1];
        if (nameFor) name = nameFor(call, name) ?? name;
        if (name) {
          const position = column % width;
          let edge = 0;
          let header = headers[0]?.group ?? null;
          for (const candidate of headers) {
            edge += candidate.span;
            if (position < edge) {
              header = candidate.group;
              break;
            }
          }
          const group = withDefaults(defaults, header);
          const key = `${type}|${cellHero ?? ''}|${name.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            const extension = call.named.e || (/^CVB$/i.test(call.name) ? 'webm' : 'png');
            records.push({
              type,
              hero: cellHero,
              name,
              rarity: group?.rarity ?? null,
              event: group?.event ?? null,
              eventLabel: group?.eventLabel ?? null,
              season,
              tags: group?.tags ?? [],
              prices: group?.prices ?? [],
              acquisition: group?.acquisition ?? [],
              file: prefix ? `${prefix} ${(call.named.l ?? name).trim()}.${extension}` : null,
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

/** Which kind of cosmetic a heading's section lists, on pages that mix them. */
function typeFromHeading(heading) {
  const text = plainText(heading).toLowerCase();
  if (/\bweapon charms?\b/.test(text)) return 'weapon-charm';
  if (/\bsouvenirs?\b/.test(text)) return 'souvenir';
  if (/\bname cards?\b/.test(text)) return 'name-card';
  if (/\bicons?\b/.test(text)) return 'player-icon';
  if (/\bsprays?\b/.test(text)) return 'spray';
  if (/\bskins?\b/.test(text)) return 'skin';
  return null;
}

/**
 * Reads pages made of <gallery> blocks under headings, such as Weapon Charms and Souvenirs.
 * Without a type, each section's heading says what it lists, and sections that list nothing it reads are skipped.
 */
export function parseGalleries(text, { type = null, pageTitle, defaults = {}, core = null }) {
  const records = [];
  const seen = new Set();
  const context = { group: null, sectionGroup: null, season: null, era: 'ow2' };
  const typeAtLevel = [];
  let sectionType = null;
  let inGallery = false;

  for (const raw of text.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, '').split('\n')) {
    const line = raw.replace(/<\/?onlyinclude>/g, '').trim();
    const eraMark = /<center>\s*'''([^']+)'''/.exec(line);
    if (eraMark && !line.includes('File:')) {
      if (/reign of talon|^\s*overwatch\s*$|2026/i.test(eraMark[1] + line)) context.era = /overwatch 2/i.test(eraMark[1]) ? 'ow2' : '2026';
      else if (/overwatch 2/i.test(eraMark[1])) context.era = 'ow2';
    }
    const heading = /^(={2,6})\s*(.+?)\s*\1$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      typeAtLevel[level] = typeFromHeading(heading[2]);
      typeAtLevel.length = level + 1;
      sectionType = typeAtLevel[level] ?? (level > 2 ? typeAtLevel.slice(0, level).filter(Boolean).at(-1) ?? null : null);
      // A heading deeper down that names something else, like "Twitch Emotes", isn't what its parent lists.
      if (!typeAtLevel[level] && /\b(?:emotes?|poses?|intros?|voice lines?|badges?|videos?|gallery)\b/i.test(heading[2])) sectionType = null;
      context.sectionGroup = readGroupLabel(heading[2]);
      context.group = null;
      context.season = seasonFromLabel(heading[2], { era: context.era });
      continue;
    }
    if (line.startsWith(';')) {
      const label = line.slice(1).trim();
      const season = seasonFromLabel(label, { era: context.era });
      if (season) context.season = season;
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
    const rowType = type ?? sectionType;
    if (!rowType) continue;
    const match = /^(?:File|Image):\s*([^|]+?)\s*\|(.*)$/i.exec(line);
    if (!match) continue;
    let name = plainText(match[2]).replace(/^[|\s]+/, '');
    if (!name) continue;
    const icon = core ? /\[\[File:Icon-([^.|\]]+)/i.exec(match[2])?.[1] : null;
    const prefix = core && !icon ? /^(.+?) (?:Weapon )?Skin /.exec(match[1])?.[1] : null;
    let hero = defaults.hero ?? (icon || prefix ? core.heroIdFromName((icon ?? prefix).replace(/_/g, ' ')) : null);
    const note = core ? /^(.*\S)\s*\(([^()]+)\)$/.exec(name) : null;
    if (note && core.heroIdFromName(note[2])) {
      hero ??= core.heroIdFromName(note[2]);
      name = note[1];
    }
    if (rowType === 'skin' && !hero) continue;
    const key = `${hero ?? ''}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const letter = /\{\{\s*rl\s*\|\s*([crelum])\b/i.exec(match[2])?.[1];
    const group = withDefaults(defaults, withDefaults(context.sectionGroup, context.group));
    records.push({
      type: rowType,
      hero,
      name,
      rarity: (letter ? RARITY_LETTER[letter.toLowerCase()] : null) ?? group?.rarity ?? defaults.rarity ?? null,
      event: group?.event ?? null,
      eventLabel: group?.eventLabel ?? null,
      season: context.season,
      tags: group?.tags ?? [],
      prices: group?.prices ?? [],
      acquisition: group?.acquisition ?? [],
      file: match[1].replace(/_/g, ' '),
      pageTitle,
    });
  }
  return records;
}

/** A table cell without its attributes, such as rowspan="8". */
const cellValue = (cell) => cell.replace(/^\s*(?:(?:rowspan|colspan|style|width|align|class|bgcolor)\s*=\s*(?:"[^"]*"|\S+)\s*)+\|/i, '').trim();

/** The rows of every table on a page, as lists of cells. A cell can run over several lines. */
function tableRows(text) {
  const rows = [];
  let cells = [];
  let open = false;
  const flush = () => {
    if (cells.length > 0) rows.push(cells);
    cells = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('{|')) {
      flush();
      open = true;
    } else if (line.startsWith('|}')) {
      flush();
      open = false;
      rows.push(null);
    } else if (!open) {
      if (line.startsWith(';') || /^={2,6}/.test(line)) rows.push(line);
    } else if (line.startsWith('|-')) {
      flush();
    } else if (line.startsWith('|+') || line.startsWith('!')) {
      continue;
    } else if (line.startsWith('|')) {
      cells.push(line.slice(1));
    } else if (cells.length > 0) {
      cells[cells.length - 1] += `\n${line}`;
    }
  }
  flush();
  return rows;
}

/** Tags a note in a table can add: "Was available in the Shop". */
function tagsFromNote(note) {
  const tags = [];
  if (/\bshop\b/i.test(note)) tags.push('shop');
  if (/\bchallenges?\b/i.test(note)) tags.push('challenge');
  if (/\btwitch\b/i.test(note)) tags.push('twitch');
  if (/\bevent pass\b/i.test(note)) tags.push('event-pass');
  if (/\bbattle pass\b/i.test(note)) tags.push('battle-pass');
  return tags;
}

/** Reads name card tables: an optional group cell, then name, image and notes. */
export function parseNameCards(text, { pageTitle, core, defaults = null, plainGroups = false }) {
  const records = [];
  const seen = new Set();
  let season = null;
  let group = null;
  let groupHero = null;

  const setGroup = (cell) => {
    const named = seasonFromLabel(cell);
    if (named) {
      season = named;
      group = null;
      groupHero = null;
      return;
    }
    groupHero = core.heroIdFromName(plainText(cell));
    group = groupHero ? null : readGroupLabel(cell);
    if (group && plainGroups) group = { ...group, event: null, eventLabel: null, limited: false, tags: group.tags.filter((tag) => tag !== 'event' && tag !== 'limited'), acquisition: group.acquisition.filter((line) => !line.startsWith('From ')) };
  };

  for (const row of tableRows(text.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, ''))) {
    if (row === null) continue;
    if (typeof row === 'string') {
      if (row.startsWith(';')) setGroup(row.slice(1).trim());
      continue;
    }
    const cells = row.map(cellValue);
    const imageAt = cells.findIndex((cell) => /\[\[\s*File:/i.test(cell));
    if (imageAt < 1) continue;
    if (imageAt >= 2) setGroup(cells[imageAt - 2]);
    let name = plainText(cells[imageAt - 1]);
    let hero = groupHero;
    const stated = /^(.*\S)\s*(?:\(([^()]+)\)|\s-\s+([^-]+))$/.exec(name);
    const statedHero = stated ? core.heroIdFromName((stated[2] ?? stated[3]).trim()) : null;
    if (statedHero) {
      name = stated[1];
      hero = statedHero;
    }
    if (groupHero && !statedHero && !plainText(cells[imageAt - 1]).toLowerCase().includes(plainText(groupHero).toLowerCase())) {
      const label = /NameCard[ _]*(.+?)\.png/i.exec(cells[imageAt])?.[1]?.replace(/_/g, ' ');
      if (label) name = label;
    }
    if (!name) continue;
    const key = `${hero ?? ''}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const note = plainText(cells[imageAt + 1] ?? '');
    const combined = withDefaults(defaults, group);
    records.push({
      type: 'name-card',
      hero,
      name,
      rarity: combined?.rarity ?? null,
      event: combined?.event ?? null,
      eventLabel: combined?.eventLabel ?? null,
      season,
      tags: unique([...(combined?.tags ?? []), ...tagsFromNote(note)]),
      prices: combined?.prices ?? [],
      acquisition: unique([...(combined?.acquisition ?? []), ...(/[a-z]/i.test(note) && note.length <= 180 ? [note] : [])]),
      file: /\[\[\s*File:\s*([^|\]]+)/i.exec(cells[imageAt])?.[1]?.replace(/_/g, ' ').trim() ?? null,
      pageTitle,
    });
  }
  return records;
}

/** What a heading on the Player Titles page says about the titles under it. */
const TITLE_SECTIONS = {
  overwatch: { tags: ['challenge'] },
  competitive: { tags: ['competitive', 'challenge'] },
  'battle pass': { tags: ['battle-pass'] },
  stadium: { tags: ['event', 'challenge'], event: 'stadium', eventLabel: 'Stadium' },
  events: { tags: ['event', 'challenge'] },
  'web events': { tags: ['event', 'limited'] },
};

/** Reads the "Title | Requirements | Notes" tables on the Player Titles page. */
export function parseTitles(text, pageTitle) {
  const records = [];
  const seen = new Set();
  const parts = text.split(/^(?===[^=])/m);
  for (const part of parts) {
    const heading = /^==\s*([^=]+?)\s*==/.exec(part)?.[1]?.toLowerCase() ?? '';
    const section = TITLE_SECTIONS[heading] ?? { tags: ['challenge'] };
    for (const table of part.split('{|').slice(1)) {
      const body = table.split('|}')[0];
      if (!/^\s*!\s*Title\b/im.test(body)) continue;
      for (const row of body.split(/\n\|-/).slice(1)) {
        const cells = row
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('|') && !line.startsWith('|-') && !line.startsWith('|+'))
          .map((line) => plainText(line.slice(1)));
        const name = cells[0];
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        const season = /Battle Pass (?:Reign of Talon )?Season (\d+)/i.exec(cells[1] ?? '');
        records.push({
          type: 'player-title',
          hero: null,
          name,
          rarity: null,
          event: section.event ?? null,
          eventLabel: section.eventLabel ?? null,
          season: season ? (/reign of talon|\b2026\b/i.test(cells[1]) ? `2026-s${season[1]}` : `ow2-s${season[1]}`) : null,
          tags: section.tags,
          prices: [],
          acquisition: cells[1] ? [cells[1]] : [],
          file: null,
          pageTitle,
        });
      }
    }
  }
  return records;
}

/** One section of a page, from its heading to the next heading of the same level or higher. */
function sectionOf(text, title) {
  const heading = new RegExp(`^(={2,6})\\s*${title}\\s*\\1\\s*$`, 'mi').exec(text);
  if (!heading) return null;
  const rest = text.slice(heading.index + heading[0].length);
  const next = new RegExp(`^={2,${heading[1].length}}[^=]`, 'm').exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const seasonFromCell = (cell, era = 'ow2') => {
  const text = plainText(cell);
  const year = /Season\/(\d{4})|(\d{4})\s*[:\s]\s*Season|\((\d{4})\)/i.exec(cell);
  const number = /(\d+)\s*(?:\(\d{4}\))?\s*$/.exec(text) ?? /Season[_ ](\d+)/i.exec(cell);
  if (!number) return null;
  const when = Number(year?.[1] ?? year?.[2] ?? year?.[3]);
  return when >= 2026 || (!when && era === '2026') ? `${when >= 2026 ? when : 2026}-s${number[1]}` : `ow2-s${number[1]}`;
};

/** Reads the mythic lists: season, hero, name, each skin's customization groups and each weapon's levels. */
export function parseMythics(text, core, pageTitle) {
  const items = [];
  const source = { source: 'Overwatch Wiki', title: pageTitle, url: pageUrl(pageTitle), checkedAt: null };
  const skins = sectionOf(text, 'List of Mythic Skins') ?? text;
  let lastSeason = null;
  for (const row of tableRows(skins)) {
    if (!Array.isArray(row)) continue;
    const cells = row.map(cellValue);
    const heroAt = cells.findIndex((cell) => core.heroIdFromName(plainText(cell)));
    if (heroAt < 0 || heroAt > 1 || cells.length < heroAt + 3) continue;
    if (heroAt === 1) lastSeason = seasonFromCell(cells[0]);
    const hero = core.heroIdFromName(plainText(cells[heroAt]));
    const name = plainText(cells[heroAt + 1]);
    if (!name) continue;
    const details = cells.slice(heroAt + 3).join('\n');
    const options = [...details.matchAll(/^\s*\*\s*([^\n*-][^\n-]*?)\s*-\s*(\d+)\s*$/gm)].map((match) => ({ name: plainText(match[1]), count: Number(match[2]) }));
    items.push({
      id: core.slugify(`${hero} ${name}`),
      name,
      kind: 'skin',
      hero,
      season: lastSeason,
      file: /\[\[File:([^\]|]+)/i.exec(cells[heroAt + 2])?.[1]?.replace(/_/g, ' ').trim() ?? null,
      options,
      levels: [],
      prisms: null,
      note: null,
      sources: [source],
    });
  }

  const weapons = sectionOf(text, 'List of Mythic Weapons');
  if (weapons) {
    let era = 'ow2';
    for (const row of tableRows(weapons)) {
      if (typeof row === 'string') {
        if (/reign of talon/i.test(row)) era = '2026';
        else if (/overwatch 2/i.test(row)) era = 'ow2';
        continue;
      }
      if (!Array.isArray(row) || row.length < 3) continue;
      const cells = row.map(cellValue);
      const heroName = /Icon-([^.|\]]+)/.exec(cells[1])?.[1]?.replace(/_/g, ' ');
      const hero = heroName ? core.heroIdFromName(heroName) : null;
      const file = /\[\[File:([^\]|]+)/i.exec(cells[2])?.[1]?.replace(/_/g, ' ').trim() ?? null;
      const name = plainText(cells[2]);
      if (!hero || !name) continue;
      const levels = [...(cells[3] ?? '').matchAll(/'''Level (\d+)'''\s*\(\{\{\s*Mythic Prisms\s*\}\}\s*(\d+)\)\s*:\s*(.+)/g)].map((match) => ({ level: Number(match[1]), prisms: Number(match[2]), text: plainText(match[3]) }));
      items.push({
        id: core.slugify(`${hero} ${name} weapon`),
        name,
        kind: 'weapon',
        hero,
        season: seasonFromCell(cells[0], era),
        file,
        options: [],
        levels,
        prisms: levels[0]?.prisms ?? null,
        note: null,
        sources: [source],
      });
    }
  }
  return items;
}

/** Reads the Mythic Aspects table: color themes a mythic skin can have. */
export function parseMythicAspects(text, pageTitle) {
  const part = sectionOf(text, 'List of Mythic Aspects');
  if (!part) return [];
  const aspects = [];
  for (const row of tableRows(part)) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const cells = row.map(cellValue);
    const name = plainText(cells[1]);
    if (!name) continue;
    aspects.push({
      name,
      season: seasonFromCell(cells[0].replace(/\s*\(Reign of Talon\)/i, ' (2026)')),
      description: plainText(cells.slice(4).join(' ')),
      file: /\[\[File:([^\]|]+)/i.exec(cells[3])?.[1]?.replace(/_/g, ' ').trim() ?? null,
      sources: [{ source: 'Overwatch Wiki', title: pageTitle, url: pageUrl(pageTitle), checkedAt: null }],
    });
  }
  return aspects;
}

/** Reads the Legendary and collaboration weapon skins on the Weapon Skins page. Mythic ones come from the Mythic Skins page. */
export function parseWeaponSkins(text, { core, pageTitle }) {
  const part = sectionOf(text, 'List of Weapon Skins');
  if (!part) return [];
  const records = [];
  const seen = new Set();
  let collab = false;
  let group = null;
  for (const raw of part.split('\n')) {
    const line = raw.trim();
    const heading = /^={3,4}\s*(.+?)\s*=+$/.exec(line);
    if (heading) {
      if (/^mythic/i.test(heading[1])) break;
      collab = /collab/i.test(heading[1]);
      continue;
    }
    if (line.startsWith(';')) {
      const theme = plainText(line.slice(1));
      group = collab ? readGroupLabel(`[[${theme}]]`) : null;
      if (group) group.tags = unique([...group.tags, 'collab']);
      continue;
    }
    for (const call of topTemplates(line)) {
      if (!/^CPB$/i.test(call.name)) continue;
      const hero = heroFromCell(call.named.h ?? '', core);
      const name = plainText(call.named.n ?? '');
      if (!hero || !name || seen.has(`${hero}|${name.toLowerCase()}`)) continue;
      seen.add(`${hero}|${name.toLowerCase()}`);
      records.push({
        type: 'weapon-skin',
        hero,
        name,
        rarity: 'legendary',
        event: group?.event ?? null,
        eventLabel: group?.eventLabel ?? null,
        season: null,
        tags: group?.tags ?? ['shop'],
        prices: collab ? [] : [{ amount: 1200, currency: 'coins' }],
        acquisition: group?.acquisition ?? ['Listed at 1,200 coins'],
        file: `${call.named.h} ${(call.named.l ?? name).trim()}.png`,
        pageTitle,
      });
    }
  }
  return records;
}

const REWARD_TYPES = Object.entries({
  'player-icon': ['icon', 'pi', 'player icon'],
  'name-card': ['card', 'nc', 'name card'],
  'player-title': ['title', 'pt', 'player title'],
  skin: ['skin'],
  'weapon-skin': ['weapon skin'],
  emote: ['e', 'emote'],
  souvenir: ['souvenir'],
  'weapon-charm': ['charm', 'wc', 'weapon charm'],
  'victory-pose': ['pose', 'vp', 'victory pose'],
  'voice-line': ['voice', 'vl', 'voice line'],
  spray: ['spray'],
  'highlight-intro': ['intro', 'highlight', 'hi', 'highlight intro'],
}).flatMap(([type, words]) => words.map((word) => [word, type]));
const REWARD_TYPE = new Map(REWARD_TYPES);
const RARITY_WORD = { c: 'common', common: 'common', r: 'rare', rare: 'rare', e: 'epic', epic: 'epic', l: 'legendary', legendary: 'legendary', u: 'ultra', ultra: 'ultra', m: 'mythic', mythic: 'mythic' };
const CURRENCY_LABEL = { credits: 'Credits', coins: 'Coins', 'mythic prisms': 'Mythic Prisms' };

/** What one tier's cell gives. A cell can hold several rewards, one to a line. */
export function parseRewardCell(cell, core) {
  const rewards = [];
  for (const raw of cellValue(cell).split(/\n|<br\s*\/?>/i)) {
    const line = raw.trim();
    if (!line) continue;
    let found = false;
    for (const match of line.matchAll(/\{\{\s*(?:rl|raritylink)\s*\|([^{}]*)\}\}/gi)) {
      const named = {};
      const positional = [];
      for (const part of match[1].split('|').map((value) => value.trim())) {
        const pair = /^(text|rarity|type|hero)\s*=\s*(.*)$/i.exec(part);
        if (pair) named[pair[1].toLowerCase()] = pair[2];
        else positional.push(part);
      }
      let name = plainText(named.text ?? positional[1] ?? '');
      if (!name) continue;
      found = true;
      let type = REWARD_TYPE.get((named.type ?? positional[2] ?? '').toLowerCase()) ?? null;
      const inName = /^(.+?)\s+-\s+([a-z ]+)$/i.exec(name);
      if (!type && inName && REWARD_TYPE.has(inName[2].toLowerCase())) {
        type = REWARD_TYPE.get(inName[2].toLowerCase());
        name = inName[1];
      }
      const heroName = named.hero ?? positional[3] ?? null;
      rewards.push({
        name,
        type,
        typeLabel: type ? null : /loot box/i.test(name) ? 'Loot Box' : null,
        hero: heroName ? core.heroIdFromName(heroName) : null,
        rarity: RARITY_WORD[(named.rarity ?? positional[0] ?? '').toLowerCase()] ?? null,
      });
    }
    for (const match of line.matchAll(/\{\{\s*(credits|coins|mythic prisms)\s*\}\}\s*'*\s*([\d,]+)|([\d,]+)\s*'*\s*\{\{\s*(credits|coins|mythic prisms)\s*\}\}/gi)) {
      found = true;
      const label = CURRENCY_LABEL[(match[1] ?? match[4]).toLowerCase()];
      rewards.push({ name: `${match[2] ?? match[3]} ${label}`, type: null, typeLabel: label, hero: null, rarity: null });
    }
    if (found) continue;
    const text = plainText(line);
    if (!/[a-z]/i.test(text)) continue;
    rewards.push({ name: text, type: null, typeLabel: /^unlock\b/i.test(text) ? 'Hero' : /\bxp\b/i.test(text) ? 'XP boost' : /loot box/i.test(text) ? 'Loot Box' : /tier skip/i.test(text) ? 'Tier skips' : null, hero: null, rarity: null });
  }
  return rewards;
}

/** The tier tables of one season: a row per tier, with free and premium cells. Later passes split into numbered tracks. */
function readTierTables(section, core) {
  const rewards = [];
  let part = null;
  let cells = [];
  const flush = () => {
    const row = cells;
    cells = [];
    const tier = /^\s*(\d+)\s*$/.exec(cellValue(row[0] ?? ''));
    if (!tier || row.length < 2) return;
    const both = row.length === 2 || /colspan\s*=\s*"?2/i.test(row[1]);
    const add = (cell, track) => {
      for (const reward of parseRewardCell(cell, core)) rewards.push({ tier: Number(tier[1]), part, track, ...reward, quantity: null });
    };
    if (both) add(row[1], 'both');
    else {
      add(row[1], 'free');
      add(row[2] ?? '', 'premium');
    }
  };
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('{|') || line.startsWith('|}') || line.startsWith('|-')) {
      flush();
    } else if (line.startsWith('!')) {
      flush();
      const title = plainText(line.replace(/^!\s*(?:(?:colspan|style|width)\s*=\s*(?:"[^"]*"|\S+)\s*)*\|?/i, ''));
      const track = /\((\d+|mythic)\)\s*$/i.exec(title);
      if (/^prestige/i.test(title)) part = 'Prestige';
      else if (track) part = /mythic/i.test(track[1]) ? 'Mythic track' : `Track ${track[1]}`;
    } else if (line.startsWith('|')) {
      cells.push(line.slice(1));
    } else if (cells.length > 0) {
      cells[cells.length - 1] += `\n${line}`;
    }
  }
  flush();
  return rewards;
}

/** Reads each season's Battle Pass from a page with "==Season 1: Conquest==" sections. */
export function parseBattlePasses(text, { era, pageTitle, core }) {
  const passes = [];
  for (const heading of text.matchAll(/^==\s*Season\s+(\d+)(?:\s*:\s*([^=]*?))?\s*==\s*$/gm)) {
    const rest = text.slice(heading.index + heading[0].length);
    const next = /^==[^=]/m.exec(rest);
    const rewards = readTierTables(next ? rest.slice(0, next.index) : rest, core);
    if (rewards.length === 0) continue;
    const number = Number(heading[1]);
    const id = era === '2026' ? `2026-s${number}` : `ow2-s${number}`;
    const tracks = rewards.some((reward) => /^Track /.test(reward.part ?? ''));
    passes.push({
      id,
      seasonId: id,
      label: era === '2026' ? `2026: Season ${number}` : `Season ${number}`,
      title: heading[2]?.trim() || null,
      start: null,
      end: null,
      image: null,
      tiers: new Set(rewards.filter((reward) => reward.part !== 'Prestige').map((reward) => `${reward.part}|${reward.tier}`)).size,
      rewards,
      note: tracks ? 'This pass is split into tracks. After the first track, the rest can be completed in any order.' : null,
      sources: [{ source: 'Overwatch Wiki', title: pageTitle, url: pageUrl(pageTitle), checkedAt: null }],
    });
  }
  return passes;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "4 October 2022" or "December 9, 2025" as a date. A date with no day, like "February 2027", gives null. */
export function parseDay(text) {
  const dayFirst = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(text.trim());
  const monthFirst = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text.trim());
  const [day, month, year] = dayFirst ? [dayFirst[1], dayFirst[2], dayFirst[3]] : monthFirst ? [monthFirst[2], monthFirst[1], monthFirst[3]] : [];
  const index = month ? MONTHS.indexOf(month.toLowerCase()) : -1;
  if (index === -1) return null;
  return `${year}-${String(index + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Reads the season list: "===Season 6: Invasion===", then "(10 August 2023 - 10 October 2023)". */
export function parseSeasonList(text, { era }) {
  const seasons = [];
  const headings = [...text.matchAll(/^===\s*Season\s+(\d+)(?::\s*(.*?))?\s*(?:<span[^>]*>\s*<\/span>)?\s*===\s*$/gm)];
  headings.forEach((heading, index) => {
    const title = heading[2]?.trim() || null;
    if (title && /^tba$/i.test(title)) return;
    const body = text.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? heading.index + 2000);
    // The start can leave out the year: "(April 22 - June 24, 2025)".
    const dates = /\(\s*([^()]*?)\s*[-–—]\s*([^()]*?(\d{4}))\s*\)/.exec(body);
    const number = Number(heading[1]);
    seasons.push({
      id: era === '2026' ? `2026-s${number}` : `ow2-s${number}`,
      label: era === '2026' ? `2026: Season ${number}` : `Season ${number}`,
      era: era === '2026' ? 'reign-of-talon' : 'overwatch-2',
      number,
      start: dates ? parseDay(/\d{4}$/.test(dates[1]) ? dates[1] : `${dates[1]} ${dates[3]}`) : null,
      end: dates ? parseDay(dates[2]) : null,
      title,
    });
  });
  return seasons;
}

/** What the Battle Pass page says about buying a past pass. Null if it says nothing the site can state exactly. */
export function parseUnvaultRules(text, pageTitle) {
  const section = sectionOf(text, 'Unvaulted Battle Passes');
  if (!section) return null;
  const coins = /costs?\s+([\d,]+)\s*\{\{\s*Coins\s*\}\}/i.exec(section);
  if (!coins) return null;
  const words = plainText(section).toLowerCase();
  const excludes = [
    [/mythic skin/, 'Mythic skins'],
    [/mythic prisms/, 'Mythic Prisms'],
    [/overwatch coins/, 'Overwatch Coins'],
    [/player titles/, 'Player titles'],
    [/xp boosts/, 'XP boosts'],
  ].filter(([pattern]) => pattern.test(words)).map(([, label]) => label);
  const since = /reign of talon season (\d+)/i.exec(words);
  return { coins: Number(coins[1].replace(/,/g, '')), since: since ? `2026-s${since[1]}` : null, excludes, sources: [{ source: 'Overwatch Wiki', title: pageTitle, url: pageUrl(pageTitle), checkedAt: null }] };
}

const QUOTE_CALL = /\{\{\s*QuoteTranslation\s*\|[^{}]*?\bquote\s*=\s*([^|{}]+)/i;
const TRANSLATION = /\{\{\s*QuoteTranslation\s*\|[^{}]*?\btranslation\s*=\s*([^|{}]+)/i;

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

/** Reads the Voice Lines table on a hero's Quotes page. A group cell spans the rows under it, and some have a season cell inside. */
export function parseVoiceLines(text, { hero, pageTitle }) {
  const start = text.search(/^={2,4}\s*Voice Lines\s*={2,4}\s*$/im);
  if (start === -1) return [];
  const rest = text.slice(start);
  const lineEnd = rest.indexOf('\n');
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
        const namedSeason = seasonFromLabel(label);
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
      pageTitle,
    });
  }
  return records;
}

/** "Template:Ana Skins" and the like: the hero's name, and which kind of cosmetic the table lists. */
const HERO_TEMPLATE = /^Template:(.+?) (Weapon Skins|Skins|Emotes|VP|Intros|HI|Sprays|Overwatch League)$/;
const TEMPLATE_TYPE = { Skins: 'skin', 'Weapon Skins': 'weapon-skin', Emotes: 'emote', VP: 'victory-pose', Intros: 'highlight-intro', HI: 'highlight-intro', Sprays: 'spray', 'Overwatch League': 'skin' };

const GALLERY_PAGES = {
  'Weapon Charms': { type: 'weapon-charm', defaults: { rarity: 'epic' } },
  Souvenirs: { type: 'souvenir', defaults: { rarity: 'rare' } },
  'Player Icons': { type: 'player-icon', defaults: { rarity: 'rare' } },
};

const eventDefaults = (link, extra = {}) => {
  const group = readGroupLabel(`[[${link}]]`);
  return { ...group, ...extra, tags: unique([...group.tags, ...(extra.tags ?? [])]), acquisition: unique([...group.acquisition, ...(extra.acquisition ?? [])]) };
};
const tagDefaults = (tags, acquisition = [], extra = {}) => ({ rarity: null, prices: [], tags, event: null, eventLabel: null, acquisition, ...extra });
const esports = () => tagDefaults(['esports']);

/** Spray tables that aren't one hero's. Each item's hero, if it has one, comes from its row. */
function sprayDefaults(name) {
  if (name === 'General') return tagDefaults([]);
  if (name === 'Overwatch League' || name === 'Overwatch Esports') return esports();
  if (name === 'Competitive') return tagDefaults(['competitive', 'limited'], ['From Competitive play in the original Overwatch']);
  if (/^Battle Pass Sprays? \d+$/.test(`${name} Sprays`) || /^Battle Pass$/.test(name)) return tagDefaults(['battle-pass'], ['From a Battle Pass']);
  if (name === 'Hero Mastery') return eventDefaults('Hero Mastery');
  if (name === 'Overwatch Archives') return eventDefaults('Overwatch Archives');
  if (name === 'Balanced Overwatch' || name === 'Limited-Time Event') return tagDefaults(['event', 'limited']);
  if (name === 'China Exclusive') return tagDefaults(['limited'], ['Only in China']);
  const seasonal = /^OW[12] (.+)$/.exec(name);
  if (seasonal) return eventDefaults(seasonal[1]);
  return null;
}
const NUMBERED_SPRAY_TEMPLATE = /^Template:(Battle Pass|Shop) Sprays (\d+)$/;

const ICON_TEMPLATES = {
  'Unlockable Player Icons': () => tagDefaults(['gallery'], ['Listed at 75 credits'], { prices: [{ amount: 75, currency: 'credits' }], rarity: 'rare' }),
  'Overwatch Player Icons': () => tagDefaults(['loot-box'], ['From a Loot Box'], { rarity: 'rare' }),
  'Progression Player Icons': () => tagDefaults(['challenge'], ['From Hero Challenges'], { rarity: 'rare' }),
  'Battle Pass Player Icons': () => tagDefaults(['battle-pass'], ['From a Battle Pass'], { rarity: 'rare' }),
  'Shop Player Icons': () => tagDefaults(['shop'], [], { rarity: 'rare' }),
  'Limited-Time Event Player Icons': () => tagDefaults(['event', 'limited'], [], { rarity: 'rare' }),
  'Blizzard Player Icons': () => tagDefaults(['limited'], [], { rarity: 'rare' }),
  'OW1 Competitive Player Icons': () => tagDefaults(['competitive', 'limited'], ['From Competitive play in the original Overwatch'], { rarity: 'rare' }),
  'Stadium Player Icons': () => ({ ...eventDefaults('Stadium'), rarity: 'rare' }),
  'Hero Mastery Player Icons': () => ({ ...eventDefaults('Hero Mastery'), rarity: 'rare' }),
  'China Exclusive Player Icons': () => tagDefaults(['limited'], ['Only in China'], { rarity: 'rare' }),
  'Overwatch Esports Player Icons': () => tagDefaults(['esports'], [], { rarity: 'rare' }),
};

const NAME_CARD_TEMPLATES = {
  'Seasons Name Cards': () => ({}),
  'Seasonal Events Name Cards': () => ({ defaults: tagDefaults(['event', 'limited']) }),
  'Limited-Time Events Name Cards': () => ({ defaults: tagDefaults(['event', 'limited']) }),
  'Collaboration Events Name Cards': () => ({ defaults: tagDefaults(['event', 'collab', 'limited']) }),
  'Stadium Name Cards': () => ({ defaults: eventDefaults('Stadium'), plainGroups: true }),
  'Overwatch Esports Name Cards': () => ({ defaults: esports(), plainGroups: true }),
  'Pride Name Cards': () => ({ defaults: eventDefaults('Celebrate Pride'), plainGroups: true }),
  'Hero Mastery Name Cards': () => ({ defaults: eventDefaults('Hero Mastery'), plainGroups: true }),
  'Progression Name Cards': () => ({ defaults: tagDefaults(['challenge'], ['From Hero Challenges']) }),
  'China Exclusive Name Cards': () => ({ defaults: tagDefaults(['limited'], ['Only in China']) }),
};

/** Pages whose sections each list a kind of cosmetic, with what the page says about all of them. */
const SECTION_PAGES = {
  'Halloween Terror cosmetics': () => ({ ...eventDefaults('Halloween Terror'), rarity: 'rare' }),
  'Lunar New Year cosmetics': () => ({ ...eventDefaults('Lunar New Year'), rarity: 'rare' }),
  'Overwatch Anniversary cosmetics': () => ({ ...eventDefaults('Overwatch Anniversary'), rarity: 'rare' }),
  'Overwatch Archives cosmetics': () => ({ ...eventDefaults('Overwatch Archives'), rarity: 'rare' }),
  'Summer Games cosmetics': () => ({ ...eventDefaults('Summer Games'), rarity: 'rare' }),
  'Winter Wonderland cosmetics': () => ({ ...eventDefaults('Winter Wonderland'), rarity: 'rare' }),
  'Celebrate Pride': () => eventDefaults('Celebrate Pride'),
  'Overwatch Esports': esports,
  'Overwatch League': esports,
  'Overwatch Champions Series': esports,
  'Overwatch Champions Series/Cosmetics': esports,
};

/** The esports tables list one skin per hero, and each item is named after its hero, so the skin's name comes from here. */
const TEAM_SKIN_TEMPLATES = { 'Template:OWCS Skins': 'OWCS', 'Template:OWWC Skins': 'Overwatch World Cup', 'Template:OW1 Contenders Skins': 'Contenders', 'Template:OW2 Contenders Skins': 'Overwatch 2 Contenders' };

/** Skin descriptions from a hero's cosmetics page: ";{{rl|e|Shrike}}" followed by ":text". Two skins can share one. */
export function parseSkinDescriptions(text) {
  const found = new Map();
  const lines = text.split('\n');
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith(';')) continue;
    const body = lines[index + 1].trim();
    if (!body.startsWith(':')) continue;
    for (const match of line.matchAll(/\{\{\s*rl\s*\|\s*[crelum]\s*\|\s*([^|{}]+?)\s*\}\}/gi)) found.set(match[1].toLowerCase(), plainText(body.slice(1)));
  }
  return found;
}

const ONE_RARITY = { spray: 'common', 'player-icon': 'rare', 'weapon-charm': 'epic', souvenir: 'rare', 'highlight-intro': 'epic' };

/** Several pages can list one cosmetic. Together they know more than any of them alone. */
function mergeRecords(records, core) {
  const merged = new Map();
  for (const record of records) {
    if (/^tba$/i.test(record.name)) continue;
    const key = `${record.type}|${record.hero ?? ''}|${core.slugify(record.name) || record.name}`;
    const known = merged.get(key);
    if (!known) {
      merged.set(key, { ...record, tags: [...(record.tags ?? [])], prices: [...(record.prices ?? [])], acquisition: [...(record.acquisition ?? [])] });
      continue;
    }
    for (const field of ['rarity', 'event', 'eventLabel', 'season', 'description', 'file']) known[field] ??= record[field] ?? null;
    known.tags = unique([...known.tags, ...(record.tags ?? [])]);
    known.acquisition = unique([...known.acquisition, ...(record.acquisition ?? [])]);
    for (const price of record.prices ?? []) if (!known.prices.some((other) => other.currency === price.currency)) known.prices.push(price);
  }
  return [...merged.values()];
}

/** Turns a parsed export into normalized files. Nothing is written if the file doesn't look right. */
export function normalizeExport(exported, core, { heroIds }) {
  const records = [];
  const parsedPages = [];
  const unused = [];
  const descriptions = new Map();
  let mythics = [];
  let aspects = [];
  const passes = new Map();
  const seasons = new Map();
  let unvault = null;
  const pageByTitle = new Map(exported.pages.map((page) => [page.title, page]));
  const add = (page, list) => {
    records.push(...list);
    parsedPages.push({ title: page.title, timestamp: page.timestamp, records: list.length });
  };

  for (const page of exported.pages) {
    const teamSkin = TEAM_SKIN_TEMPLATES[page.title];
    if (teamSkin) {
      const nameFor = (call) => `${teamSkin}${/ Away$/i.test(call.named.h ?? '') ? ' Away' : ''}`;
      add(page, parseCosmeticTable(page.text, { type: 'skin', pageTitle: 'Overwatch Esports Skins', core, defaults: esports(), nameFor }));
      continue;
    }
    if (page.title === 'Template:Legendary OWL Skins') {
      add(page, parseCosmeticTable(page.text, { type: 'skin', pageTitle: 'Overwatch League', core, defaults: tagDefaults(['esports'], [], { rarity: 'legendary' }) }));
      continue;
    }
    const numberedSprays = NUMBERED_SPRAY_TEMPLATE.exec(page.title);
    if (numberedSprays) {
      const defaults = numberedSprays[1] === 'Shop' ? tagDefaults(['shop']) : tagDefaults(['battle-pass'], ['From a Battle Pass']);
      add(page, parseCosmeticTable(page.text, { type: 'spray', pageTitle: 'Sprays', core, defaults: { ...defaults, rarity: 'common' } }));
      continue;
    }
    const hero = HERO_TEMPLATE.exec(page.title);
    if (hero) {
      const heroId = core.heroIdFromName(hero[1]);
      if (heroId && heroIds.has(heroId)) {
        add(page, parseCosmeticTable(page.text, { type: TEMPLATE_TYPE[hero[2]], hero: heroId, pageTitle: `${hero[1]}/Cosmetics` }));
        continue;
      }
      const sprays = hero[2] === 'Sprays' ? sprayDefaults(hero[1]) : null;
      if (sprays) {
        add(page, parseCosmeticTable(page.text, { type: 'spray', pageTitle: 'Sprays', core, defaults: { ...sprays, rarity: 'common' } }));
        continue;
      }
      unused.push(page.title);
      continue;
    }
    const quotesPage = /^(.+)\/Quotes$/.exec(page.title);
    if (quotesPage) {
      const heroId = core.heroIdFromName(quotesPage[1]);
      if (!heroId || !heroIds.has(heroId)) {
        unused.push(page.title);
        continue;
      }
      add(page, parseVoiceLines(page.text, { hero: heroId, pageTitle: page.title }));
      continue;
    }
    if (SECTION_PAGES[page.title]) {
      add(page, parseGalleries(page.text, { pageTitle: page.title, core, defaults: SECTION_PAGES[page.title]() }));
      continue;
    }
    const cosmeticsPage = /^(.+)\/Cosmetics$/.exec(page.title);
    if (cosmeticsPage) {
      const heroId = core.heroIdFromName(cosmeticsPage[1]);
      if (heroId) for (const [name, text] of parseSkinDescriptions(page.text)) descriptions.set(`${heroId}|${name}`, text);
      // League skins are written once, and each hero's page fills in the hero.
      const league = heroId ? /\{\{\s*(OWLSkinsHero2?)\s*\|\s*h\s*=\s*([^|}]+)/.exec(page.text) : null;
      const template = league ? pageByTitle.get(`Template:${league[1]}`) : null;
      if (template) {
        const filled = template.text.replaceAll('{{{h}}}', league[2].trim()).replace(/\{\{\{[^{}]*\}\}\}/g, '');
        add(page, parseCosmeticTable(filled, { type: 'skin', hero: heroId, pageTitle: page.title }));
      }
      continue;
    }
    if (GALLERY_PAGES[page.title]) {
      const { type, defaults } = GALLERY_PAGES[page.title];
      add(page, parseGalleries(page.text, { type, pageTitle: page.title, defaults, core }));
      continue;
    }
    const iconTemplate = /^Template:(.+ Player Icons)$/.exec(page.title);
    if (iconTemplate && ICON_TEMPLATES[iconTemplate[1]]) {
      add(page, parseGalleries(page.text, { type: 'player-icon', pageTitle: 'Player Icons', defaults: ICON_TEMPLATES[iconTemplate[1]](), core }));
      continue;
    }
    const cardTemplate = /^Template:(.+ Name Cards)$/.exec(page.title);
    if (cardTemplate && NAME_CARD_TEMPLATES[cardTemplate[1]]) {
      add(page, parseNameCards(page.text, { pageTitle: 'Name Cards', core, ...NAME_CARD_TEMPLATES[cardTemplate[1]]() }));
      continue;
    }
    if (page.title === 'Name Cards') {
      add(page, parseNameCards(page.text, { pageTitle: page.title, core }));
      continue;
    }
    if (page.title === 'Weapon Skins') {
      add(page, parseWeaponSkins(page.text, { core, pageTitle: page.title }));
      continue;
    }
    const passList = /^(?:List of previous Battle Passes\/(2022-2026|2026)|Battle Pass)$/.exec(page.title);
    if (passList) {
      const found = parseBattlePasses(page.text, { era: passList[1] === '2022-2026' ? 'ow2' : '2026', pageTitle: page.title, core });
      for (const pass of found) passes.set(pass.id, pass);
      if (page.title === 'Battle Pass') unvault = parseUnvaultRules(page.text, page.title);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: found.reduce((sum, pass) => sum + pass.rewards.length, 0) });
      continue;
    }
    const seasonList = /^Season\/(2022-2026|2026)$/.exec(page.title);
    if (seasonList) {
      const found = parseSeasonList(page.text, { era: seasonList[1] === '2026' ? '2026' : 'ow2' });
      for (const season of found) seasons.set(season.id, season);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: found.length });
      continue;
    }
    if (page.title === 'Player Titles') {
      add(page, parseTitles(page.text, page.title));
      continue;
    }
    if (page.title === 'Mythic Skins') {
      mythics = parseMythics(page.text, core, page.title);
      aspects = parseMythicAspects(page.text, page.title);
      parsedPages.push({ title: page.title, timestamp: page.timestamp, records: mythics.length });
      continue;
    }
    unused.push(page.title);
  }

  const cosmetics = mergeRecords(records, core);
  for (const record of cosmetics) {
    if (record.type === 'skin' && record.hero) {
      const text = descriptions.get(`${record.hero}|${record.name.toLowerCase()}`);
      if (text) record.description = text;
    }
    // The wiki's cosmetics pages state one rarity for these types, and a heading only sometimes repeats it.
    if (ONE_RARITY[record.type]) record.rarity ??= ONE_RARITY[record.type];
  }

  // The mythic list can name each weapon of a pair, where the hero's table has one name for both.
  for (const item of mythics) {
    if (item.kind !== 'weapon') continue;
    const name = item.name.toLowerCase();
    const known = cosmetics.find((record) => record.type === 'weapon-skin' && record.hero === item.hero && name.startsWith(record.name.toLowerCase()));
    if (known) {
      item.name = known.name;
      item.id = core.slugify(`${item.hero} ${known.name} weapon`);
      known.rarity ??= 'mythic';
    }
  }
  // A mythic the hero's table leaves out still belongs in the catalogue.
  const inTables = new Set(cosmetics.map((record) => `${record.type}|${record.hero}|${record.name.toLowerCase()}`));
  for (const item of mythics) {
    const type = item.kind === 'weapon' ? 'weapon-skin' : 'skin';
    if (inTables.has(`${type}|${item.hero}|${item.name.toLowerCase()}`)) continue;
    cosmetics.push({
      type,
      hero: item.hero,
      name: item.name,
      rarity: 'mythic',
      event: null,
      eventLabel: null,
      season: item.season,
      tags: ['mythic-shop'],
      prices: item.prisms === null ? [] : [{ amount: item.prisms, currency: 'prisms' }],
      acquisition: item.prisms === null ? [] : [`Listed at ${item.prisms} Mythic Prisms`],
      file: item.file,
      pageTitle: 'Mythic Skins',
    });
  }

  // Mythic weapons also appear in each hero's weapon skin table, and a few may only be there.
  const listed = new Set(mythics.map((item) => `${item.kind}|${item.hero}|${item.name.toLowerCase()}`));
  for (const record of cosmetics) {
    if (record.type === 'weapon-skin' && record.rarity === 'mythic' && !listed.has(`weapon|${record.hero}|${record.name.toLowerCase()}`)) {
      mythics.push({
        id: core.slugify(`${record.hero} ${record.name} weapon`),
        name: record.name,
        kind: 'weapon',
        hero: record.hero,
        season: null,
        file: record.file,
        options: [],
        levels: [],
        prisms: record.prices.find((price) => price.currency === 'prisms')?.amount ?? null,
        note: null,
        sources: [{ source: 'Overwatch Wiki', title: record.pageTitle, url: pageUrl(record.pageTitle), checkedAt: null }],
      });
    }
  }
  // A mythic's Prism price comes from the hero's table, and its table gets the mythic's season.
  const byMythic = new Map(cosmetics.filter((record) => (record.type === 'skin' || record.type === 'weapon-skin') && record.rarity === 'mythic').map((record) => [`${record.type === 'skin' ? 'skin' : 'weapon'}|${record.hero}|${record.name.toLowerCase()}`, record]));
  for (const item of mythics) {
    const record = byMythic.get(`${item.kind}|${item.hero}|${item.name.toLowerCase()}`);
    if (!record) continue;
    item.prisms ??= record.prices.find((price) => price.currency === 'prisms')?.amount ?? null;
    record.season ??= item.season;
  }

  const events = new Map();
  for (const record of cosmetics) if (record.event) events.set(record.event, record.eventLabel ?? record.event);

  return { records: cosmetics, mythics, aspects, passes: [...passes.values()], seasons: [...seasons.values()], unvault, parsedPages, unused, events: [...events].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)) };
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

/** One record per line, with blank fields left out, so the file stays small and a new import shows as a readable change. */
function writeRecords(file, records) {
  const lines = records.map((record) => {
    const kept = {};
    for (const [field, value] of Object.entries(record)) {
      if (value === null || value === undefined || field === 'eventLabel') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      kept[field] = value;
    }
    return JSON.stringify(kept);
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `[\n${lines.join(',\n')}\n]\n`);
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
  writeRecords(path.join(dir, 'catalog.json'), sorted);
  writeJson(path.join(dir, 'mythics.json'), normalized.mythics);
  writeJson(path.join(dir, 'mythic-aspects.json'), normalized.aspects);
  writeRecords(path.join(dir, 'battle-passes.json'), normalized.passes);
  writeJson(path.join(dir, 'seasons.json'), normalized.seasons);
  writeJson(path.join(dir, 'battle-pass-rules.json'), normalized.unvault);
  writeJson(path.join(dir, 'events.json'), normalized.events);
  writeJson(path.join(dir, 'import.json'), { exportedAt: stamp, pages: exported.pages.length, records: sorted.length, parsedPages: normalized.parsedPages, unusedPages: normalized.unused });
  logChange({ source: 'wiki', action: 'import', pages: exported.pages.length, records: sorted.length, mythics: normalized.mythics.length, passes: normalized.passes.length });
  return { summary: `Read ${exported.pages.length} pages: ${sorted.length} cosmetics, ${normalized.mythics.length} mythics, ${normalized.passes.length} Battle Passes, ${normalized.seasons.length} seasons, ${normalized.events.length} events. ${normalized.unused.length} pages weren't used.` };
}
