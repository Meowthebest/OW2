// Files every shop listing under one key before anything is built from it.
//
// Past shops carry no item keys, and their ids change between days and sections, so one bundle can arrive as
// "overwatch-shop-2115605", "overwatch-esports-shop-2115605" and "ow:bundle:2115739". Product numbers can't join these
// on their own: the store uses one number for several Mythic bundles, and a bundle and a skin can share one. So one
// name and hero is one item, and each listing's raw record stays on disk, so a better rule can be applied later.

const blank = (value) => value === null || value === undefined || value === '';

/** Oldest first, so a newer value replaces an older one and a blank never replaces anything. */
function mergeRecords(core, rows, name) {
  const merged = { name, kind: null, typeLabel: null, rarity: null, image: null, statedCount: null, url: null, contents: [], firstSeen: null, lastSeen: null };
  for (const { item, typeLabel } of rows) {
    if (!blank(item.kind)) merged.kind = item.kind;
    if (!blank(typeLabel)) merged.typeLabel = typeLabel;
    for (const field of ['rarity', 'image', 'statedCount', 'url']) if (!blank(item[field])) merged[field] = item[field];
    if ((item.contents?.length ?? 0) > 0) merged.contents = item.contents;
    if (item.firstSeen && (!merged.firstSeen || item.firstSeen < merged.firstSeen)) merged.firstSeen = item.firstSeen;
    if (item.lastSeen && (!merged.lastSeen || item.lastSeen > merged.lastSeen)) merged.lastSeen = item.lastSeen;
  }

  const { type, heroName } = core.parseTypeLabel(merged.typeLabel);
  if (rows.some((row) => row.key.startsWith('ow:bundle:')) || /\bbundle\b/i.test(name) || /^bundles?\b/i.test(merged.typeLabel ?? '')) merged.kind = 'bundle';
  else if (type && (!core.HERO_BOUND_TYPES.has(type) || core.heroIdFromName(heroName))) merged.kind = 'cosmetic';
  else merged.kind = 'product';
  return merged;
}

/**
 * The source sometimes leaves out the hero on a bundle's contents. It can be worked out in two cases: a bundle named after
 * one hero sells only that hero's items, and the same picture is the same cosmetic, wherever else it's sold.
 * Anything else stays without a hero rather than being guessed.
 */
function fillContentHeroes(core, items) {
  const needsHero = (content) => {
    const { type, heroName } = core.parseTypeLabel(content.typeLabel ?? null);
    return type && core.HERO_BOUND_TYPES.has(type) && !heroName;
  };
  const statedByPicture = new Map();
  for (const item of Object.values(items)) {
    for (const content of item.contents) {
      const { heroName } = core.parseTypeLabel(content.typeLabel ?? null);
      if (content.image && heroName) statedByPicture.set(content.image, heroName);
    }
  }
  for (const item of Object.values(items)) {
    if (item.kind !== 'bundle') continue;
    const named = core.heroesNamedIn(item.name);
    if (named.length !== 1) continue;
    const stated = item.contents.map((content) => core.parseTypeLabel(content.typeLabel ?? null).heroName).filter(Boolean);
    if (stated.length === 0 || stated.some((name) => core.heroIdFromName(name) !== named[0])) continue;
    for (const content of item.contents) {
      if (needsHero(content) && content.image) statedByPicture.set(content.image, stated[0]);
    }
  }
  for (const item of Object.values(items)) {
    item.contents = item.contents.map((content) => {
      const heroName = needsHero(content) ? statedByPicture.get(content.image) : null;
      return heroName ? { ...content, typeLabel: `${content.typeLabel} · ${heroName}` } : content;
    });
  }
}

/** What's on sale and at what price, which is what makes one shop different from another. */
function onSale(rotation) {
  const parts = new Set();
  for (const section of rotation.sections) {
    if (section.upcoming) continue;
    for (const [key, amount, currency] of section.listings) parts.add(`${key}|${amount ?? ''}|${currency ?? ''}`);
  }
  return [...parts].sort().join('\n');
}

/**
 * Returns the items and rotations with one key per item, and the raw keys it replaced.
 * listingNames corrects a name the source got wrong for a while: { "wrong name": "right name" }.
 */
export function reconcileShop(core, rawItems, rawRotations, { listingNames = {} } = {}) {
  const corrected = new Map(Object.entries(listingNames).map(([wrong, right]) => [core.normalizeText(wrong), right]));
  const rows = Object.entries(rawItems).map(([key, item]) => {
    const { type, heroName } = core.parseTypeLabel(item.typeLabel ?? null);
    return {
      key,
      item,
      name: corrected.get(core.normalizeText(item.name)) ?? item.name,
      type,
      typeLabel: item.typeLabel ?? null,
      hero: core.heroIdFromName(heroName),
      // "Pumpkin", labelled only "Bastion": a skin and a spray can share that name and hero, so it can't join by name.
      heroOnly: !type && Boolean(core.heroIdFromName(item.typeLabel ?? null)),
      number: /-(\d{5,})(?::|$)/.exec(key)?.[1] ?? null,
    };
  });

  // Some listings leave out a hero that the same product states on another day.
  const statedLabels = new Map();
  for (const row of rows) {
    if (row.hero && row.number) statedLabels.set(`${core.slugify(row.name)}#${row.number}`, row.typeLabel);
  }
  for (const row of rows) {
    if (row.hero || row.heroOnly || !row.number) continue;
    if (row.type && !core.HERO_BOUND_TYPES.has(row.type)) continue;
    const label = statedLabels.get(`${core.slugify(row.name)}#${row.number}`);
    if (!label) continue;
    const parsed = core.parseTypeLabel(label);
    row.typeLabel = label;
    row.type = parsed.type;
    row.hero = core.heroIdFromName(parsed.heroName);
  }

  const groups = new Map();
  for (const row of rows) {
    const slug = core.slugify(row.name);
    const id = row.heroOnly || !slug ? `key:${row.key}` : `${slug}${row.hero ? `.${row.hero}` : ''}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }

  const items = {};
  const aliases = new Map();
  for (const [id, group] of groups) {
    const ordered = [...group].sort((a, b) => (a.item.lastSeen ?? '').localeCompare(b.item.lastSeen ?? ''));
    const keyed = ordered.filter((row) => row.key.startsWith('ow:'));
    const loose = ordered.filter((row) => !row.key.startsWith('ow:'));
    // Two source keys stay two items, whatever they're called. Listings with no key join the newest of them.
    const home = keyed.at(-1)?.key ?? (id.startsWith('key:') ? ordered[0].key : `listing:${id}`);
    for (const row of keyed) {
      if (row.key !== home) items[row.key] = mergeRecords(core, [row], row.name);
    }
    for (const row of loose) if (row.key !== home) aliases.set(row.key, home);
    const members = ordered.filter((row) => row.key === home || !row.key.startsWith('ow:'));
    items[home] = mergeRecords(core, members, members.at(-1).name);
  }
  fillContentHeroes(core, items);

  const rewritten = rawRotations.map((rotation) => ({
    ...rotation,
    sections: rotation.sections.map((section) => {
      const seen = new Set();
      const listings = [];
      for (const row of section.listings) {
        const key = aliases.get(row[0]) ?? row[0];
        if (seen.has(key)) continue;
        seen.add(key);
        listings.push([key, ...row.slice(1)]);
      }
      return { ...section, listings };
    }),
  }));

  // A day where nothing on sale changed isn't a new shop. The first read says when it began, and the newest describes it best.
  const readAt = (rotation) => rotation.updatedAt ?? rotation.at;
  const rotations = [];
  for (const rotation of rewritten) {
    const last = rotations.at(-1);
    if (last && onSale(last) === onSale(rotation)) rotations[rotations.length - 1] = { ...(readAt(rotation) >= readAt(last) ? rotation : last), id: last.id, at: last.at };
    else rotations.push(rotation);
  }
  return { items, rotations, aliases };
}
