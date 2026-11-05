// Joins every stored source into the normalized files the site reads. It uses no network and gives the same
// result for the same input, so the site can be rebuilt at any time and a correction is just another input.
//
// Sources: data/cosmetics/shop (recorded shop), data/cosmetics/wiki (hand-exported wiki import),
// data/cosmetics/curated (admin-managed, each record with its source), data/cosmetics/corrections.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR, loadCore, OUT_DIR, readJson, ROOT } from './common.mjs';
import { readRotations } from './itemshop.mjs';
import { reconcileShop } from './reconcile.mjs';
import { pageUrl } from './wiki.mjs';

const ITEMSHOP_NAME = 'itemshop.gg';
const WIKI_NAME = 'Overwatch Wiki';
const WIKI_URL = 'https://overwatch.wiki/';
const WIKI_LICENSE = 'CC BY-NC-SA 3.0';

/**
 * Only used if data/cosmetics/config.json turns wiki images on, which the wiki's staff agreed to. Nothing is copied: visitors' browsers
 * load the image from the wiki. Emotes and highlight intros are videos there, so they show the frame the wiki makes for each one.
 */
const wikiImage = (file) => {
  const name = encodeURIComponent(file.replace(/ /g, '_'));
  return /\.webm$/i.test(file) ? `https://overwatch.weirdgloop.org/images/thumb/${name}/640px--${name}.jpg` : `https://overwatch.weirdgloop.org/images/${name}`;
};

const unique = (list) => [...new Set(list)];
const dateOf = (iso) => (iso ? iso.slice(0, 10) : null);

function loadInputs() {
  const curated = (name, fallback) => readJson(path.join(DATA_DIR, 'curated', `${name}.json`), fallback);
  return {
    items: readJson(path.join(DATA_DIR, 'shop/items.json'), {}),
    stays: readJson(path.join(DATA_DIR, 'shop/stays.json'), { fetchedAt: null, items: {} }),
    state: readJson(path.join(DATA_DIR, 'shop/state.json'), {}),
    rotations: readRotations(),
    wiki: readJson(path.join(DATA_DIR, 'wiki/catalog.json'), []),
    wikiImport: readJson(path.join(DATA_DIR, 'wiki/import.json'), null),
    wikiMythics: readJson(path.join(DATA_DIR, 'wiki/mythics.json'), []),
    wikiAspects: readJson(path.join(DATA_DIR, 'wiki/mythic-aspects.json'), []),
    wikiPasses: readJson(path.join(DATA_DIR, 'wiki/battle-passes.json'), []),
    wikiPassRules: readJson(path.join(DATA_DIR, 'wiki/battle-pass-rules.json'), null),
    wikiSeasons: readJson(path.join(DATA_DIR, 'wiki/seasons.json'), []),
    wikiEvents: readJson(path.join(DATA_DIR, 'wiki/events.json'), []),
    seasons: curated('seasons', []),
    drops: curated('twitch-drops', []),
    pools: curated('loot-pools', []),
    events: curated('events', []),
    corrections: readJson(path.join(DATA_DIR, 'corrections.json'), { rename: {}, hide: [], set: {} }),
    config: readJson(path.join(DATA_DIR, 'config.json'), {}),
    patchSeasons: readJson(path.join(ROOT, 'scripts/patches/seasons.json'), []),
  };
}

function blankCosmetic(id, type, hero, name) {
  return { id, name, type, hero, rarity: null, images: [], season: null, event: null, tags: new Set(), pools: new Set(), prices: [], productIds: new Set(), keys: new Set(), description: null, acquisition: [], bundles: new Set(), sources: [], mythic: null };
}

const addPrice = (record, amount, currency) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return;
  if (!record.prices.some((price) => price.currency === currency)) record.prices.push({ amount, currency });
};

const productIdOf = (key) => {
  const match = /^ow:(?:item|bundle):(\d+)$/.exec(key ?? '');
  return match ? Number(match[1]) : null;
};

/** Builds one season list from the stored sources. A season's id never changes once published. */
function buildSeasons(inputs) {
  const byId = new Map();
  for (const season of [...inputs.wikiSeasons, ...inputs.seasons]) byId.set(season.id, { ...byId.get(season.id), ...season });
  for (const season of inputs.patchSeasons) {
    const id = `${season.year}-s${season.number}`;
    if (!byId.has(id)) byId.set(id, { id, label: `${season.year}: Season ${season.number}`, era: 'reign-of-talon', number: season.number, start: season.start, end: null, title: null });
    else if (!byId.get(id).start) byId.get(id).start = season.start;
  }
  const list = [...byId.values()].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.number - b.number);
  list.forEach((season, index) => {
    if (!season.end && list[index + 1]?.start) season.end = list[index + 1].start;
  });
  return list;
}

const nameKey = (core, value) => core.normalizeText(value);

export async function buildCatalog({ dryRun = false, now = new Date(), outDir = OUT_DIR } = {}) {
  const core = await loadCore();
  const inputs = loadInputs();
  const reconciled = reconcileShop(core, inputs.items, inputs.rotations, inputs.corrections);
  inputs.items = reconciled.items;
  inputs.rotations = reconciled.rotations;
  const warnings = [];
  const errors = [];
  const cosmetics = new Map();
  const seasons = buildSeasons(inputs);
  for (const entry of inputs.wiki) {
    const match = /^(ow2|\d{4})-s(\d+)$/.exec(entry.season ?? '');
    if (!match || seasons.some((season) => season.id === entry.season)) continue;
    const number = Number(match[2]);
    seasons.push({ id: entry.season, label: match[1] === 'ow2' ? `Season ${number}` : `${match[1]}: Season ${number}`, era: match[1] === 'ow2' ? 'overwatch-2' : 'reign-of-talon', number, start: null, end: null, title: null });
  }
  seasons.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.number - b.number);
  const seasonStart = new Map(seasons.map((season) => [season.id, season.start]));

  const rename = inputs.corrections.rename ?? {};
  const resolveId = (id) => rename[id] ?? id;

  const byTypeAndName = new Map();
  function ensure(type, hero, name) {
    const id = resolveId(core.cosmeticId(type, hero, name));
    let record = cosmetics.get(id);
    if (!record) {
      record = blankCosmetic(id, type, hero, name);
      cosmetics.set(id, record);
      const key = `${type}|${nameKey(core, name)}`;
      if (!byTypeAndName.has(key)) byTypeAndName.set(key, []);
      byTypeAndName.get(key).push(record);
    }
    return record;
  }

  /**
   * The record for a cosmetic, allowing for sources that disagree about a hero on types not tied to one:
   * a shop can label an icon with a hero while the wiki lists it for everyone, and the other way around.
   */
  function recordFor(type, hero, name) {
    const exact = cosmetics.get(resolveId(core.cosmeticId(type, hero, name)));
    if (exact) return exact;
    if (hero) {
      // The shop can add the hero to a name, such as "Mercy Winged Victory".
      const shorter = withoutHero(name, hero);
      const found = shorter ? cosmetics.get(resolveId(core.cosmeticId(type, hero, shorter))) : null;
      if (found) return found;
      // And it gives voice lines a short title, where the wiki has the whole line.
      if (type === 'voice-line') {
        const words = ` ${nameKey(core, name)} `;
        const fits = [...cosmetics.values()].filter((record) => record.type === type && record.hero === hero && ` ${nameKey(core, record.name)} `.includes(words));
        if (fits.length === 1) return fits[0];
      }
    }
    if (core.HERO_BOUND_TYPES.has(type)) return null;
    const same = byTypeAndName.get(`${type}|${nameKey(core, name)}`) ?? [];
    if (hero) return same.find((record) => !record.hero) ?? null;
    return same.length === 1 ? same[0] : null;
  }

  /** A name with the hero's own name taken off either end, or null if it isn't there. */
  function withoutHero(name, hero) {
    const words = nameKey(core, name).split(' ');
    for (let count = 1; count <= 3 && count < words.length; count += 1) {
      if (core.heroIdFromName(words.slice(0, count).join(' ')) === hero) return words.slice(count).join(' ');
      if (core.heroIdFromName(words.slice(-count).join(' ')) === hero) return words.slice(0, -count).join(' ');
    }
    return null;
  }

  // Which one hero the shop names for something the wiki lists for everyone.
  const shopHeroes = new Map();
  const noteShopHero = ({ name, typeLabel }) => {
    const { type, heroName } = core.parseTypeLabel(typeLabel ?? null);
    const hero = core.heroIdFromName(heroName);
    if (!type || !hero || core.HERO_BOUND_TYPES.has(type)) return;
    const key = `${type}|${nameKey(core, name)}`;
    if (!shopHeroes.has(key)) shopHeroes.set(key, new Set());
    shopHeroes.get(key).add(hero);
  };
  for (const item of Object.values(inputs.items)) {
    noteShopHero(item);
    for (const content of item.contents ?? []) noteShopHero(content);
  }
  const heroForEntry = (entry) => {
    if (entry.hero) return entry.hero;
    const stated = shopHeroes.get(`${entry.type}|${nameKey(core, entry.name)}`);
    return stated?.size === 1 ? [...stated][0] : null;
  };

  // The wiki import is the base catalogue.
  const checkedAt = inputs.wikiImport?.exportedAt ?? null;
  for (const entry of inputs.wiki) {
    const record = ensure(entry.type, heroForEntry(entry), entry.name);
    record.rarity ??= entry.rarity ?? null;
    record.season ??= entry.season ?? null;
    record.event ??= entry.event ?? null;
    record.description ??= entry.description ?? null;
    for (const tag of entry.tags ?? []) record.tags.add(tag);
    for (const price of entry.prices ?? []) addPrice(record, price.amount, price.currency);
    for (const line of entry.acquisition ?? []) if (!record.acquisition.includes(line)) record.acquisition.push(line);
    if (inputs.config.wikiImages && entry.file && !record.images.includes(wikiImage(entry.file))) record.images.push(wikiImage(entry.file));
    const page = entry.page ?? (entry.pageTitle ? pageUrl(entry.pageTitle) : WIKI_URL);
    if (!record.sources.some((source) => source.source === WIKI_NAME && source.url === page)) {
      record.sources.push({ source: WIKI_NAME, title: entry.pageTitle ? `${WIKI_NAME}: ${entry.pageTitle}` : WIKI_NAME, url: page, checkedAt });
    }
  }

  // Everything the shop has listed, whether sold alone or inside a bundle.
  const shopChecked = inputs.state.lastRecorded ?? null;
  const itemsByKey = new Map();
  const noteShopItem = (record, key, { rarity, image, url }) => {
    record.rarity ??= rarity ?? null;
    if (image && !record.images.includes(image)) record.images.unshift(image);
    if (key) {
      record.keys.add(key);
      const product = productIdOf(key);
      if (product) record.productIds.add(product);
      itemsByKey.set(key, record);
    }
    record.tags.add('shop');
    if (!record.sources.some((source) => source.source === ITEMSHOP_NAME)) {
      record.sources.push({ source: ITEMSHOP_NAME, title: 'Data from itemshop.gg', url: core.ITEMSHOP_PAGE, checkedAt: shopChecked });
    }
    if (url && !record.storeUrl) record.storeUrl = url;
    return record;
  };
  // The live Shop page builds ids from the shop's own labels, so an id that joined another record still has to lead there.
  const aliases = new Map();
  const mergeShopItem = (key, item) => {
    const { type, heroName } = core.parseTypeLabel(item.typeLabel);
    if (!type) return null;
    const hero = core.heroIdFromName(heroName);
    if (heroName && !hero) warnings.push(`Unknown hero "${heroName}" on ${item.name}`);
    if (core.HERO_BOUND_TYPES.has(type) && !hero) return null;
    const record = recordFor(type, hero, item.name) ?? ensure(type, hero, item.name);
    const stated = resolveId(core.cosmeticId(type, hero, item.name));
    if (stated !== record.id) aliases.set(stated, record.id);
    return noteShopItem(record, key, item);
  };

  // A listing labelled only with a hero joins the catalogue if exactly one cosmetic fits its hero, name and rarity.
  const byHeroAndName = new Map();
  const heroNameKey = (hero, name) => `${hero}|${nameKey(core, name)}`;
  for (const record of cosmetics.values()) {
    if (!record.hero) continue;
    const key = heroNameKey(record.hero, record.name);
    if (!byHeroAndName.has(key)) byHeroAndName.set(key, []);
    byHeroAndName.get(key).push(record);
  }
  const linkByHero = (key, item) => {
    const hero = core.heroIdFromName(item.typeLabel);
    if (!hero) return;
    const fits = (byHeroAndName.get(heroNameKey(hero, item.name)) ?? []).filter((record) => !item.rarity || !record.rarity || record.rarity === item.rarity);
    if (fits.length === 1) noteShopItem(fits[0], key, item);
  };

  // A past bundle's contents have no item keys, so they're followed by the cosmetic they name.
  const contentKey = (content) => {
    if (content.key) return content.key;
    const { type, heroName } = core.parseTypeLabel(content.typeLabel);
    if (!type) return null;
    const hero = core.heroIdFromName(heroName);
    const record = recordFor(type, hero, content.name);
    return `cosmetic:${record?.id ?? resolveId(core.cosmeticId(type, hero, content.name))}`;
  };
  const bundleIdOf = (key, item) => {
    const product = productIdOf(key);
    return product ? String(product) : core.slugify(item.name);
  };
  const bundleIdByName = new Map();

  // A bundle can leave out one item's hero. If the catalogue lists that name for exactly one hero the bundle doesn't already name, it's that hero's.
  const { HEROES } = await import('./heroes-list.mjs').then((module) => module.loadHeroes());
  const heroName = new Map(HEROES.map((hero) => [hero.id, hero.name]));
  for (const item of Object.values(inputs.items)) {
    item.contents = (item.contents ?? []).map((content) => {
      const { type, heroName: stated } = core.parseTypeLabel(content.typeLabel ?? null);
      if (!type || stated || !core.HERO_BOUND_TYPES.has(type)) return content;
      const named = new Set(item.contents.filter((other) => nameKey(core, other.name) === nameKey(core, content.name)).map((other) => core.heroIdFromName(core.parseTypeLabel(other.typeLabel ?? null).heroName)).filter(Boolean));
      const left = (byTypeAndName.get(`${type}|${nameKey(core, content.name)}`) ?? []).filter((record) => record.hero && !named.has(record.hero));
      return left.length === 1 ? { ...content, typeLabel: `${content.typeLabel} · ${heroName.get(left[0].hero)}` } : content;
    });
  }

  for (const [key, item] of Object.entries(inputs.items)) {
    if (item.kind === 'cosmetic') mergeShopItem(key, item);
    else if (item.kind === 'product') linkByHero(key, item);
    if (item.kind === 'bundle') bundleIdByName.set(nameKey(core, item.name), bundleIdOf(key, item));
    for (const content of item.contents ?? []) mergeShopItem(contentKey(content), content);
  }

  // Corrections are applied last, so a fix keeps working after the next import.
  for (const id of inputs.corrections.hide ?? []) cosmetics.delete(id);

  // Walk the recorded shops in order to get appearances.
  const rotations = inputs.rotations;
  const latest = rotations.at(-1) ?? null;
  const presentKeys = (rotation) => {
    const direct = new Map();
    for (const section of rotation.sections) {
      if (section.upcoming) continue;
      for (const [key, amount, currency, , label, , , until] of section.listings) {
        direct.set(key, { amount, currency, label, section: section.title, until: until ?? section.endsAt ?? null });
      }
    }
    return direct;
  };

  const openStays = new Map();
  const recordedStays = new Map();
  const closeStay = (key, at) => {
    const stay = openStays.get(key);
    if (!stay) return;
    stay.end = at;
    openStays.delete(key);
  };
  for (const rotation of rotations) {
    const direct = presentKeys(rotation);
    const here = new Map();
    for (const [key, info] of direct) {
      here.set(key, { price: info.amount, currency: info.currency, label: info.label, section: info.section, bundle: null, bundleId: null, bundlePrice: null });
      const item = inputs.items[key];
      for (const content of item?.contents ?? []) {
        const ref = contentKey(content);
        if (ref && !here.has(ref)) here.set(ref, { price: null, currency: info.currency, label: null, section: info.section, bundle: item.name, bundleId: item.kind === 'bundle' ? bundleIdOf(key, item) : null, bundlePrice: info.amount });
      }
    }
    for (const key of [...openStays.keys()]) if (!here.has(key)) closeStay(key, rotation.at);
    for (const [key, info] of here) {
      if (openStays.has(key)) continue;
      const stay = { start: rotation.at, end: null, ...info, source: 'recorded' };
      openStays.set(key, stay);
      if (!recordedStays.has(key)) recordedStays.set(key, []);
      recordedStays.get(key).push(stay);
    }
  }
  const inShopKeys = new Set(openStays.keys());

  const historyRead = Boolean(inputs.state.historyRead);
  const latestDate = dateOf([latest?.updatedAt, latest?.at].filter(Boolean).sort().at(-1) ?? null);
  for (const record of cosmetics.values()) {
    const stays = [];
    for (const key of record.keys) {
      const fromSource = inputs.stays.items?.[key];
      if (Array.isArray(fromSource) && fromSource.length > 0) {
        for (const [start, end, price, currency, shop, state] of fromSource) {
          if (state === 'upcoming') continue;
          // The source files a stay under the listing it was sold in. Unless that's the cosmetic itself, the price is the bundle's.
          const alone = !shop || nameKey(core, shop) === nameKey(core, record.name);
          stays.push({
            start,
            end,
            price: alone ? price : null,
            currency: currency ?? 'Coins',
            section: null,
            bundle: alone ? null : shop,
            bundleId: alone ? null : bundleIdByName.get(nameKey(core, shop)) ?? null,
            bundlePrice: alone ? null : price,
            source: 'itemshop-history',
          });
        }
      }
    }
    // An item can show no individual stays because it was only ever sold inside bundles. The recording covers those.
    // It can also start before the source's own dates, and then only that earlier part adds anything.
    const firstFromSource = stays.map((stay) => stay.start).filter(Boolean).sort()[0] ?? null;
    for (const key of record.keys) {
      for (const stay of recordedStays.get(key) ?? []) {
        const covered = stays.some((other) => other.source === 'itemshop-history' && other.start && stay.start && other.start <= stay.start && (!other.end || !stay.end || other.end >= stay.start));
        if (covered) continue;
        const runsInto = firstFromSource && stay.start < firstFromSource && (!stay.end || stay.end > firstFromSource);
        stays.push(runsInto ? { ...stay, end: firstFromSource } : stay);
      }
    }
    stays.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
    record.stays = stays;
    record.inShop = [...record.keys].some((key) => inShopKeys.has(key));
    // A planned end can still be in the future if the item left early, so the latest shop is the limit.
    const lastDate = dateOf(stays.map((stay) => stay.end ?? stay.start).filter(Boolean).sort().at(-1) ?? null);
    record.lastSeen = record.inShop ? latestDate : lastDate && latestDate && lastDate > latestDate ? latestDate : lastDate;
    record.firstSeen = dateOf(stays.map((stay) => stay.start).filter(Boolean).sort()[0] ?? null);
    // One stay can be in several bundles at once. That's still one appearance.
    record.appearances = new Set(stays.map((stay) => dateOf(stay.start) ?? 'unknown')).size;
    for (const stay of stays) {
      if (stay.price !== null && stay.price !== undefined && /^coins$/i.test(stay.currency ?? 'coins')) addPrice(record, stay.price, 'coins');
    }
  }

  // Bundles, with their items as references to the one record of each cosmetic.
  const bundles = [];
  for (const [key, item] of Object.entries(inputs.items)) {
    if (item.kind !== 'bundle') continue;
    const productId = productIdOf(key);
    const id = bundleIdOf(key, item);
    const stays = recordedStays.get(key) ?? [];
    const open = openStays.get(key);
    let listing = null;
    let section = null;
    if (latest) {
      for (const part of latest.sections) {
        const found = part.listings.find((row) => row[0] === key);
        if (found) {
          listing = found;
          section = part;
        }
      }
    }
    const lastStay = stays.at(-1) ?? null;
    const items = (item.contents ?? []).map((content) => {
      const { type, heroName } = core.parseTypeLabel(content.typeLabel);
      const hero = core.heroIdFromName(heroName);
      const record = type ? recordFor(type, hero, content.name) : null;
      if (record) record.bundles.add(id);
      return {
        id: record?.id ?? null,
        name: content.name,
        type,
        typeLabel: content.typeLabel,
        rarity: content.rarity ?? record?.rarity ?? null,
        hero,
        image: content.image ?? record?.images[0] ?? null,
        quantity: content.quantity ?? 1,
        prices: record?.prices ?? [],
      };
    });
    bundles.push({
      id,
      slug: core.slugify(item.name),
      name: item.name,
      productId,
      rarity: item.rarity ?? null,
      image: item.image ?? null,
      price: lastStay || listing ? { amount: listing?.[1] ?? lastStay?.price ?? null, currency: listing?.[2] ?? lastStay?.currency ?? '', label: listing?.[4] ?? lastStay?.label ?? null } : null,
      statedCount: item.statedCount ?? null,
      items,
      heroes: unique(items.map((row) => row.hero).filter(Boolean)),
      types: unique(items.map((row) => row.type).filter(Boolean)),
      status: open ? 'active' : 'previous',
      until: listing?.[7] ?? section?.endsAt ?? null,
      badge: listing?.[5] ?? null,
      url: item.url ?? null,
      firstSeen: dateOf(stays[0]?.start ?? item.firstSeen ?? null),
      lastSeen: open ? dateOf(latest?.updatedAt ?? latest?.at) : dateOf(lastStay?.end ?? item.lastSeen ?? null),
      seen: stays.length,
      season: items.map((row) => (row.id ? cosmetics.get(row.id)?.season : null)).filter(Boolean).sort((a, b) => (seasonStart.get(a) ?? '').localeCompare(seasonStart.get(b) ?? '')).at(-1) ?? null,
      section: section?.title ?? stays.at(-1)?.section ?? null,
    });
  }
  bundles.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || (b.productId ?? 0) - (a.productId ?? 0) || a.name.localeCompare(b.name));

  // Esports shop section marks its cosmetics, since the section is the store's own label.
  for (const rotation of rotations) {
    for (const part of rotation.sections) {
      if (!/esports/i.test(part.title)) continue;
      for (const [key] of part.listings) {
        const item = inputs.items[key];
        if (item) for (const content of item.contents ?? []) itemsByKey.get(content.key)?.tags.add('esports');
        itemsByKey.get(key)?.tags.add('esports');
      }
    }
  }

  // A Battle Pass reward says which season and tier a cosmetic came from. Oldest passes first, so a reward that returned keeps its first season.
  const seasonIndex = new Map(seasons.map((season, index) => [season.id, index]));
  const seasonNamed = new Map(seasons.map((season) => [season.id, season.label]));
  const editDistance = (a, b) => {
    if (Math.abs(a.length - b.length) > 2) return 3;
    let row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const next = [i];
      for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  };
  // Tier lists are typed by hand, so a reward can be a letter or two off the cosmetic's name. One close match is safe, and two aren't.
  const closeRecord = ({ type, hero, name }) => {
    const words = nameKey(core, name);
    if (words.length < 6) return null;
    const fits = [...cosmetics.values()].filter((record) => record.type === type && (!hero || !record.hero || record.hero === hero) && editDistance(words, nameKey(core, record.name)) <= 2);
    return fits.length === 1 ? fits[0] : null;
  };
  // A tier list can shorten or lengthen a name: "Gladiator: LXXVI" is Gladiator. All of one name's words in the other, with one candidate, is safe.
  const looseRecord = ({ type, hero, name }) => {
    if (type === 'voice-line') return null;
    const words = new Set(nameKey(core, name).split(' ').filter((word) => core.heroIdFromName(word) !== hero));
    if (words.size === 0) return null;
    const fits = [...cosmetics.values()].filter((record) => {
      if (record.type !== type || (hero && record.hero && record.hero !== hero)) return false;
      const other = new Set(nameKey(core, record.name).split(' ').filter((word) => core.heroIdFromName(word) !== hero));
      if (other.size === 0) return false;
      const [small, large] = words.size <= other.size ? [words, other] : [other, words];
      return [...small].every((word) => large.has(word));
    });
    return fits.length === 1 ? fits[0] : null;
  };
  const unlinkedRewards = [];
  for (const pass of [...inputs.wikiPasses].sort((a, b) => (seasonIndex.get(a.seasonId) ?? 0) - (seasonIndex.get(b.seasonId) ?? 0))) {
    for (const reward of pass.rewards) {
      if (!reward.type) continue;
      const sameName = byTypeAndName.get(`${reward.type}|${nameKey(core, reward.name)}`) ?? [];
      let record = recordFor(reward.type, reward.hero ?? null, reward.name) ?? (!reward.hero && sameName.length === 1 ? sameName[0] : null) ?? closeRecord(reward) ?? looseRecord(reward);
      // Anything else is a cosmetic the wiki's tables leave out, so it gets a record of its own. Voice lines are the exception:
      // the Quotes pages give the whole line where a tier list gives a title, so a new record could easily be a second copy.
      if (!record && reward.type !== 'voice-line' && (reward.hero || !core.HERO_BOUND_TYPES.has(reward.type))) {
        record = ensure(reward.type, reward.hero ?? null, reward.name);
        record.sources.push({ source: WIKI_NAME, title: pass.sources[0]?.title ? `${WIKI_NAME}: ${pass.sources[0].title}` : WIKI_NAME, url: pass.sources[0]?.url ?? WIKI_URL, checkedAt });
      }
      if (!record) {
        unlinkedRewards.push(`${pass.seasonId}: ${reward.type} ${reward.name}${reward.hero ? ` (${reward.hero})` : ''}`);
        continue;
      }
      reward.recordId = record.id;
      record.tags.add('battle-pass');
      record.season ??= pass.seasonId;
      record.rarity ??= reward.rarity ?? null;
      const track = reward.track === 'both' ? 'free and premium' : reward.track;
      record.acquisition = record.acquisition.filter((line) => line !== 'From a Battle Pass');
      const line = `${seasonNamed.get(pass.seasonId) ?? pass.label} Battle Pass, ${reward.part ? `${reward.part}, ` : ''}tier ${reward.tier} (${track})`;
      if (!record.acquisition.includes(line)) record.acquisition.unshift(line);
    }
  }

  // Loot pools are many-to-many. Membership comes only from each pool's stated rule.
  const pools = [];
  for (const pool of inputs.pools) {
    let count = null;
    if (pool.rule) {
      count = 0;
      for (const record of cosmetics.values()) {
        const tagsOk = !pool.rule.tags || pool.rule.tags.some((tag) => record.tags.has(tag));
        const typesOk = !pool.rule.types || pool.rule.types.includes(record.type);
        const eventOk = !pool.rule.events || pool.rule.events.includes(record.event);
        if (tagsOk && typesOk && eventOk) {
          record.pools.add(pool.slug);
          count += 1;
        }
      }
    }
    if (!pool.sources?.length) errors.push(`Loot pool ${pool.slug} has no source`);
    if (count === 0) count = null;
    pools.push({ slug: pool.slug, name: pool.name, description: pool.description, basis: pool.basis, sources: pool.sources ?? [], count, confirmed: pool.confirmed === true });
  }

  // Newest order: a date from the season or first shop sighting, then the product id, which rises over time.
  const dayNumber = (date) => (date ? Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000) : 0);
  const orderOf = (record) => {
    const date = (record.season && seasonStart.get(record.season)) || record.firstSeen || null;
    const product = Math.max(0, ...record.productIds);
    return dayNumber(date) * 10000000 + (product % 10000000);
  };

  const rows = [];
  const details = new Map();
  for (const record of cosmetics.values()) {
    for (const [field, value] of Object.entries(inputs.corrections.set?.[record.id] ?? {})) record[field] = value;
    const availability = record.inShop ? 'in-shop' : record.tags.has('gallery') ? 'gallery' : 'not-listed';
    const row = {
      id: record.id,
      name: record.name,
      type: record.type,
      rarity: record.rarity,
      hero: record.hero,
      image: record.images[0] ?? null,
      season: record.season,
      event: record.event,
      tags: [...record.tags].sort(),
      pools: [...record.pools].sort(),
      prices: record.prices,
      availability,
      lastSeen: record.lastSeen ?? null,
      seen: record.appearances,
      order: orderOf(record),
    };
    rows.push(row);
    details.set(record.id, {
      ...row,
      description: record.description,
      images: unique(record.images),
      productIds: [...record.productIds].sort((a, b) => a - b),
      acquisition: record.acquisition,
      bundles: [...record.bundles],
      stays: record.stays,
      sources: record.sources,
      mythic: record.mythic,
      storeUrl: record.storeUrl ?? null,
    });
  }
  // Newest first, which is the order most visits ask for, so sorting in the browser has almost nothing to do.
  const rowName = new Intl.Collator('en', { sensitivity: 'base' });
  rows.sort((a, b) => Number(!a.order) - Number(!b.order) || b.order - a.order || rowName.compare(a.name, b.name) || (a.id < b.id ? -1 : 1));

  // Duplicate check: a product id must belong to one cosmetic.
  const productOwner = new Map();
  for (const record of cosmetics.values()) {
    for (const product of record.productIds) {
      if (productOwner.has(product) && productOwner.get(product) !== record.id) warnings.push(`Product ${product} is on both ${productOwner.get(product)} and ${record.id}`);
      productOwner.set(product, record.id);
    }
  }

  // Twitch campaigns, linked to cosmetics by name where the catalogue has them.
  const byName = new Map();
  for (const row of rows) {
    const key = `${row.type}|${nameKey(core, row.name)}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }
  const campaigns = inputs.drops.map((campaign) => {
    if (!campaign.sources?.length) errors.push(`Twitch campaign ${campaign.id} has no source`);
    if (!(Date.parse(campaign.start) < Date.parse(campaign.end))) errors.push(`Twitch campaign ${campaign.id} ends before it starts`);
    return {
      ...campaign,
      rewards: campaign.rewards.map((reward) => {
        if (reward.minutes !== null && !(reward.minutes > 0)) errors.push(`Twitch campaign ${campaign.id}: reward ${reward.id} has a bad watch time`);
        const match = reward.type && reward.lookup ? byName.get(`${reward.type}|${nameKey(core, reward.lookup)}`)?.filter((row) => !reward.hero || row.hero === reward.hero) : null;
        const row = match?.length === 1 ? match[0] : null;
        for (const target of match?.length === 1 ? [cosmetics.get(row.id)] : []) target.tags.add('twitch');
        const { lookup: _lookup, hero: _hero, ...rest } = reward;
        return { ...rest, cosmeticId: row?.id ?? null, image: row?.image ?? reward.image ?? null };
      }),
    };
  });

  // Mythics and passes come from the wiki import, with cosmetic links resolved here.
  const mythics = inputs.wikiMythics.map((item) => {
    const id = resolveId(core.cosmeticId(item.kind === 'weapon' ? 'weapon-skin' : 'skin', item.hero, item.name));
    const record = cosmetics.get(id);
    if (record) {
      details.get(id).mythic = item.id;
      details.get(id).tags = unique([...details.get(id).tags, 'mythic-shop']).sort();
    }
    const { file, ...rest } = item;
    return { ...rest, cosmeticId: record ? id : null, image: record?.images[0] ?? (inputs.config.wikiImages && file ? wikiImage(file) : null) };
  });
  const listedMythics = new Set(mythics.map((item) => item.cosmeticId).filter(Boolean));
  for (const row of rows) {
    if (row.rarity !== 'mythic' || listedMythics.has(row.id) || (row.type !== 'skin' && row.type !== 'weapon-skin')) continue;
    const id = core.slugify(`${row.hero ?? 'any'} ${row.name}${row.type === 'weapon-skin' ? ' weapon' : ''}`);
    mythics.push({ id, cosmeticId: row.id, name: row.name, kind: row.type === 'weapon-skin' ? 'weapon' : 'skin', hero: row.hero, season: row.season, image: row.image, options: [], prisms: row.prices.find((price) => price.currency === 'prisms')?.amount ?? null, note: null, sources: details.get(row.id).sources });
    details.get(row.id).mythic = id;
  }

  // What a past pass leaves out when it's bought later, in the words the rules give.
  const left = inputs.wikiPassRules?.excludes ?? [];
  const leftOut = (reward) =>
    (left.includes('Mythic skins') && reward.rarity === 'mythic') ||
    (left.includes('Mythic Prisms') && reward.typeLabel === 'Mythic Prisms') ||
    (left.includes('Overwatch Coins') && reward.typeLabel === 'Coins') ||
    (left.includes('Player titles') && reward.type === 'player-title') ||
    (left.includes('XP boosts') && reward.typeLabel === 'XP boost');
  const passes = inputs.wikiPasses.map((pass) => {
    const rewards = pass.rewards.map(({ recordId, ...reward }) => {
      const record = recordId ? cosmetics.get(recordId) : null;
      return { ...reward, part: reward.part ?? null, id: record?.id ?? null, rarity: reward.rarity ?? record?.rarity ?? null, image: record?.images[0] ?? reward.image ?? null, notInUnvault: leftOut(reward) };
    });
    return { ...pass, rewards, rewardCount: rewards.length };
  });
  const passArt = new Map();
  const notePassArt = (name, image) => {
    const match = /Premium Battle Pass (\d{4}): Season (\d+)/i.exec(name ?? '');
    if (match && image) passArt.set(`${match[1]}-s${match[2]}`, image);
  };
  for (const item of Object.values(inputs.items)) {
    notePassArt(item.name, item.image);
    for (const content of item.contents ?? []) notePassArt(content.name, content.image);
  }
  for (const season of seasons) {
    const existing = passes.find((pass) => pass.seasonId === season.id);
    if (existing) {
      existing.image ??= passArt.get(season.id) ?? (inputs.config.wikiImages && season.file ? wikiImage(season.file) : null);
      existing.label = season.label;
      existing.title ??= season.title ?? null;
      existing.start ??= season.start ?? null;
      existing.end ??= season.end ?? null;
      continue;
    }
    passes.push({
      id: season.id,
      seasonId: season.id,
      label: season.label,
      title: season.title ?? null,
      start: season.start ?? null,
      end: season.end ?? null,
      image: passArt.get(season.id) ?? null,
      tiers: null,
      rewardCount: 0,
      rewards: [],
      note: null,
      sources: [],
    });
  }
  const passOrder = new Map(seasons.map((season, index) => [season.id, index]));
  passes.sort((a, b) => (passOrder.get(a.seasonId) ?? -1) - (passOrder.get(b.seasonId) ?? -1));

  // Facets and statistics come from the rows above, never from a written-down number.
  const labelOfHero = new Map();
  for (const hero of HEROES) labelOfHero.set(hero.id, hero.name);
  const eventLabels = new Map([...inputs.wikiEvents, ...inputs.events].map((event) => [event.id, event.label]));
  const typeLabels = new Map(core.COSMETIC_TYPES.map((type) => [type.id, type.label]));
  const rarityLabels = new Map(core.RARITIES.map((rarity) => [rarity.id, rarity.label]));
  const seasonLabels = new Map(seasons.map((season) => [season.id, season.label]));
  const tagLabels = { shop: 'Shop', 'battle-pass': 'Battle Pass', 'event-pass': 'Event Pass', event: 'Event', esports: 'Esports', limited: 'Limited-time', achievement: 'Achievements', challenge: 'Challenges', twitch: 'Twitch Drops', base: 'Base', gallery: 'Hero Gallery', 'loot-box': 'Loot Box', 'mythic-shop': 'Mythic Shop', competitive: 'Competitive', collab: 'Collaboration' };

  const countBy = (list, read) => {
    const counts = new Map();
    for (const item of list) {
      for (const value of [read(item)].flat()) {
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return counts;
  };
  const facet = (counts, labels, order = null) =>
    [...counts]
      .map(([id, count]) => ({ id, label: (labels instanceof Map ? labels.get(id) : labels?.[id]) ?? id, count }))
      .sort(order ?? ((a, b) => a.label.localeCompare(b.label)));

  const rarityOrder = (a, b) => core.RARITY_RANK[a.id] - core.RARITY_RANK[b.id];
  const seasonOrder = new Map(seasons.map((season, index) => [season.id, index]));
  const bySeasonOrder = (a, b) => (seasonOrder.get(a.id) ?? 0) - (seasonOrder.get(b.id) ?? 0);
  const typeOrder = new Map(core.COSMETIC_TYPES.map((type, index) => [type.id, index]));

  const rotationSummaries = [];
  let previous = null;
  const rotationDetails = new Map();
  const listingHref = (key) => {
    const product = productIdOf(key);
    const item = inputs.items[key];
    if (item?.kind === 'bundle') return `#/bundles/${product ?? core.slugify(item.name)}`;
    const record = itemsByKey.get(key);
    return record ? `#/cosmetics/${record.id}` : null;
  };
  const describe = (key, row) => {
    const item = inputs.items[key];
    return { key, name: item?.name ?? key, image: item?.image ?? null, amount: row?.[1] ?? null, currency: row?.[2] ?? null, bundle: item?.kind === 'bundle', href: listingHref(key) };
  };
  for (const rotation of rotations) {
    const keys = [...presentKeys(rotation).keys()];
    const diff = previous ? core.diffListings(keys.map((key) => ({ key })), [...presentKeys(previous).keys()].map((key) => ({ key }))) : { added: keys, removed: [] };
    const summary = { id: rotation.id, at: rotation.at, shopDate: rotation.shopDate, count: keys.length, added: previous ? diff.added.length : 0, removed: diff.removed.length, exact: rotation.exact !== false };
    rotationSummaries.push(summary);
    const month = rotation.at.slice(0, 7);
    if (!rotationDetails.has(month)) rotationDetails.set(month, []);
    rotationDetails.get(month).push({
      ...summary,
      sections: rotation.sections.filter((part) => !part.upcoming).map((part) => ({ title: part.title, endsAt: part.endsAt, listings: part.listings.map((row) => describe(row[0], row)) })),
      addedKeys: previous ? diff.added : [],
      removedKeys: diff.removed,
    });
    previous = rotation;
  }

  const shopFile = latest
    ? {
        schema: 1,
        recordedAt: inputs.state.lastRecorded ?? latest.at,
        rotation: rotationSummaries.at(-1),
        snapshot: {
          shopDate: latest.shopDate,
          updatedAt: latest.updatedAt,
          expiresAt: latest.expiresAt,
          stale: false,
          itemCount: [...presentKeys(latest).keys()].length,
          sections: latest.sections.map((part) => ({
            title: part.title,
            upcoming: part.upcoming,
            endsAt: part.endsAt,
            listings: part.listings.map(([key, amount, currency, regular, priceLabel, badge, from, until, untilLabel]) => {
              const item = inputs.items[key] ?? {};
              const { type, heroName } = core.parseTypeLabel(item.typeLabel ?? null);
              const hero = core.heroIdFromName(heroName);
              return {
                id: key,
                key,
                name: item.name ?? key,
                kind: item.kind ?? 'product',
                typeLabel: item.typeLabel ?? null,
                type: item.kind === 'cosmetic' ? type : null,
                hero,
                rarity: item.rarity ?? null,
                amount,
                priceLabel,
                currency,
                regular,
                image: item.image ?? null,
                badge,
                from,
                until,
                untilLabel,
                contents: (item.contents ?? []).map((content) => {
                  const parsed = core.parseTypeLabel(content.typeLabel);
                  const contentHero = core.heroIdFromName(parsed.heroName);
                  return { key: content.key, name: content.name, typeLabel: content.typeLabel, type: parsed.type, hero: contentHero, rarity: content.rarity, image: content.image, quantity: content.quantity ?? 1, cosmeticId: parsed.type ? recordFor(parsed.type, contentHero, content.name)?.id ?? null : null };
                }),
                statedCount: item.statedCount ?? null,
                soldOut: false,
                url: item.url ?? null,
                cosmeticId: item.kind === 'cosmetic' && type ? recordFor(type, hero, item.name)?.id ?? null : itemsByKey.get(key)?.id ?? null,
              };
            }),
          })),
        },
        changes: (() => {
          const details2 = rotationDetails.get(latest.at.slice(0, 7))?.at(-1);
          const previousRotation = rotations.at(-2) ?? null;
          const rowOf = (rotation, key) => rotation.sections.flatMap((part) => part.listings).find((row) => row[0] === key);
          return previousRotation
            ? {
                previousAt: previousRotation.at,
                added: (details2?.addedKeys ?? []).map((key) => describe(key, rowOf(latest, key))),
                removed: (details2?.removedKeys ?? []).map((key) => describe(key, rowOf(previousRotation, key))),
              }
            : null;
        })(),
      }
    : null;

  const monthly = new Map();
  for (const summary of rotationSummaries) {
    const month = summary.at.slice(0, 7);
    const row = monthly.get(month) ?? { month, rotations: 0, listings: 0 };
    row.rotations += 1;
    row.listings += summary.added;
    monthly.set(month, row);
  }

  const seenRows = rows.filter((row) => row.seen > 0);
  const originCount = (tag) => rows.filter((row) => row.tags.includes(tag)).length;
  const activeBundles = bundles.filter((bundle) => bundle.status === 'active').length;
  const stats = {
    total: rows.length,
    byType: facet(countBy(rows, (row) => row.type), typeLabels, (a, b) => typeOrder.get(a.id) - typeOrder.get(b.id)),
    byRarity: facet(countBy(rows, (row) => row.rarity), rarityLabels, rarityOrder),
    skinsByRarity: facet(countBy(rows.filter((row) => row.type === 'skin'), (row) => row.rarity), rarityLabels, rarityOrder),
    byHero: facet(countBy(rows, (row) => row.hero), labelOfHero, (a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    bySeason: facet(countBy(rows, (row) => row.season), seasonLabels, bySeasonOrder),
    origins: [
      { id: 'shop', label: 'Seen in shop data', count: originCount('shop') },
      { id: 'battle-pass', label: 'Battle Pass', count: originCount('battle-pass') },
      { id: 'event', label: 'Events', count: originCount('event') },
      { id: 'esports', label: 'Esports', count: originCount('esports') },
      { id: 'gallery', label: 'Hero Gallery (Credits)', count: originCount('gallery') },
    ].filter((item) => item.count > 0),
    mythics: { skins: mythics.filter((item) => item.kind === 'skin').length, weapons: mythics.filter((item) => item.kind === 'weapon').length },
    bundles: { total: bundles.length, active: activeBundles, previous: bundles.length - activeBundles, averageItems: bundles.length ? Math.round((bundles.reduce((sum, bundle) => sum + bundle.items.length, 0) / bundles.length) * 10) / 10 : null },
    rotationsByMonth: [...monthly.values()],
    appearancesByType: facet(countBy(seenRows, (row) => row.type), typeLabels, (a, b) => b.count - a.count),
    mostSeen: [...seenRows].sort((a, b) => b.seen - a.seen || a.name.localeCompare(b.name)).slice(0, 10).map((row) => ({ id: row.id, name: row.name, type: row.type, hero: row.hero, seen: row.seen })),
  };

  const priceMax = rows.reduce((max, row) => Math.max(max, ...row.prices.filter((price) => price.currency === 'coins').map((price) => price.amount)), 0);

  const meta = {
    schema: 1,
    generatedAt: now.toISOString(),
    counts: { cosmetics: rows.length, bundles: bundles.length, rotations: rotations.length, passes: passes.length, mythics: mythics.length, campaigns: campaigns.length },
    sources: [
      { id: 'itemshop', name: ITEMSHOP_NAME, url: core.ITEMSHOP_PAGE, license: 'Free API, shown with a link back', lastSuccess: inputs.state.lastRecorded ?? null, records: Object.keys(inputs.items).length, note: historyRead ? 'Past shops read through an API key.' : 'History starts from the first recording, because past shops need an API key.' },
      ...(inputs.wikiImport
        ? [{ id: 'wiki', name: WIKI_NAME, url: WIKI_URL, license: WIKI_LICENSE, lastSuccess: inputs.wikiImport.exportedAt ?? null, records: inputs.wiki.length, pictures: Boolean(inputs.config.wikiImages), note: 'Exported by hand and imported offline, so it is only as current as the last export.' }]
        : []),
      ...(campaigns.length ? [{ id: 'blizzard', name: 'Blizzard announcements', url: 'https://us.forums.blizzard.com/en/overwatch/c/announcements/5', license: null, lastSuccess: inputs.drops.map((campaign) => campaign.sources?.[0]?.checkedAt).filter(Boolean).sort().at(-1) ?? null, records: campaigns.length, note: 'Twitch campaigns entered by hand from official posts.' }] : []),
    ],
    facets: {
      heroes: facet(countBy(rows, (row) => row.hero), labelOfHero),
      types: facet(countBy(rows, (row) => row.type), typeLabels, (a, b) => typeOrder.get(a.id) - typeOrder.get(b.id)),
      rarities: facet(countBy(rows, (row) => row.rarity), rarityLabels, rarityOrder),
      seasons: facet(countBy(rows, (row) => row.season), seasonLabels, bySeasonOrder),
      events: facet(countBy(rows, (row) => row.event), eventLabels),
      pools: pools.filter((pool) => pool.count !== null).map((pool) => ({ id: pool.slug, label: pool.name, count: pool.count })),
      tags: facet(countBy(rows, (row) => row.tags), tagLabels),
    },
    priceMax,
    shardCount: core.SHARD_COUNT,
    shopHistoryFrom: inputs.state.historyFrom ?? dateOf(rotations[0]?.at ?? null),
    shopHistoryComplete: historyRead,
  };

  const report = {
    errors,
    warnings: unique(warnings),
    summary: `${rows.length} cosmetics, ${bundles.length} bundles, ${rotations.length} shops, ${mythics.length} mythics, ${passes.length} passes, ${campaigns.length} Twitch campaigns. ${errors.length} errors, ${unique(warnings).length} warnings.`,
  };
  if (dryRun) return report;
  if (errors.length > 0) throw new Error(`The data has problems, so nothing was written:\n  ${errors.join('\n  ')}`);

  // Write to a temporary folder and swap it in, so the site never reads a half-written catalogue.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ow2-cosmetics-out-'));
  const write = (file, value) => {
    const target = path.join(temp, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  write('meta.json', meta);
  write('catalog.json', rows);
  write('bundles.json', bundles);
  write('stats.json', stats);
  write('seasons.json', seasons);
  write('battle-pass-rules.json', inputs.wikiPassRules);
  write('mythics.json', mythics);
  write('mythic-aspects.json', inputs.wikiAspects.map(({ file, ...aspect }) => ({ ...aspect, image: inputs.config.wikiImages && file ? wikiImage(file) : null })));
  write('battle-passes.json', passes.map(({ rewards, ...rest }) => rest));
  for (const pass of passes) write(`battle-passes/${pass.id}.json`, pass);
  write('twitch-drops.json', campaigns);
  write('loot-pools.json', pools);
  write('events.json', [...eventLabels].map(([id, label]) => ({ id, label })));
  write('shop.json', shopFile);
  write('rotations.json', [...rotationSummaries].reverse());
  for (const [month, list] of rotationDetails) write(`rotations/${month}.json`, list);
  const shards = Array.from({ length: core.SHARD_COUNT }, () => ({}));
  for (const [id, detail] of details) shards[core.shardOf(id)][id] = detail;
  for (const [id, target] of aliases) if (!details.has(id) && details.has(target)) shards[core.shardOf(id)][id] = { aliasOf: target };
  shards.forEach((shard, index) => write(core.shardFile(index), shard));

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  fs.cpSync(temp, outDir, { recursive: true });
  fs.rmSync(temp, { recursive: true, force: true });
  return report;
}
