import { HEROES, type Role } from '../../../data/heroes';
import { classifyLine, normalizeForHash, parseLine, percentChange, seriesStat, slug, statCategories } from './classify';
import { countPatch } from './rollup';
import type { BalanceChange, CardGroup, ChangeKind, HeroNote, OtherItem, PatchFile, PatchType, Scope, SeasonRef } from './types';

/**
 * Reads Blizzard's official patch notes markup into structured facts. Source text is only held in
 * memory: what gets stored is numbers, names, fingerprints and links, so Blizzard's wording stays on their page.
 */

export interface RawBlock {
  title: string | null;
  lines: string[];
}

export interface RawHero {
  name: string;
  heroId: string | null;
  role: Role | null;
  scope: CardGroup;
  forceDirection: 'bugfix' | 'qol' | null;
  hasDeveloperComment: boolean;
  blocks: RawBlock[];
}

export interface RawOther {
  section: OtherItem['section'];
  group: string | null;
  title: string | null;
  lines: string[];
}

export interface RawPatch {
  id: string;
  title: string;
  date: string;
  /** Season number if a section announces the start of one. */
  seasonNumber: number | null;
  isHotfix: boolean;
  heroes: RawHero[];
  other: RawOther[];
}

const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const HERO_LOOKUP = new Map(HEROES.map((hero) => [normalizeName(hero.name), hero]));

export function findHero(name: string) {
  return HERO_LOOKUP.get(normalizeName(name)) ?? null;
}

function roleFromTitle(title: string): Role | null {
  if (/\btank\b/i.test(title)) return 'tank';
  if (/\bdamage\b/i.test(title)) return 'damage';
  if (/\bsupport\b/i.test(title)) return 'support';
  return null;
}

function linesFromList(list: Element): string[] {
  const lines: string[] = [];
  for (const item of list.querySelectorAll(':scope > li')) {
    const nested = item.querySelector(':scope > ul, :scope > ol');
    if (!nested) {
      const line = text(item);
      if (line) lines.push(line);
      continue;
    }
    const clone = item.cloneNode(true) as Element;
    clone.querySelectorAll('ul, ol').forEach((node) => node.remove());
    const own = text(clone);
    const children = linesFromList(nested);
    if (own.length > 0 && own.length <= 40 && !/\d/.test(own)) {
      // A short lead-in such as "Primary Fire:" is part of each sub-line's stat name.
      lines.push(...children.map((child) => `${own.replace(/:$/, '')} ${child.charAt(0).toLowerCase()}${child.slice(1)}`));
    } else {
      if (own) lines.push(own);
      lines.push(...children);
    }
  }
  return lines;
}

/** Walks mixed headers and lists, where each header labels the list after it. */
function blocksFromFlow(container: Element): RawBlock[] {
  const blocks: RawBlock[] = [];
  let title: string | null = null;
  for (const child of container.children) {
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      const lines = linesFromList(child);
      if (lines.length) blocks.push({ title, lines });
    } else {
      const label = text(child);
      if (label) title = label;
    }
  }
  return blocks;
}

function parseHero(node: Element, context: { scope: CardGroup; role: Role | null; force: RawHero['forceDirection'] }): RawHero {
  const name = text(node.querySelector('.PatchNotesHeroUpdate-name'));
  const hero = findHero(name);
  const blocks: RawBlock[] = [];

  const general = node.querySelector('.PatchNotesHeroUpdate-generalUpdates');
  if (general) blocks.push(...blocksFromFlow(general));

  for (const ability of node.querySelectorAll('.PatchNotesAbilityUpdate')) {
    const list = ability.querySelector('.PatchNotesAbilityUpdate-detailList');
    const lines = list ? [...list.querySelectorAll(':scope > ul, :scope > ol')].flatMap(linesFromList) : [];
    const plain = list && lines.length === 0 ? text(list) : '';
    blocks.push({ title: text(ability.querySelector('.PatchNotesAbilityUpdate-name')) || null, lines: plain ? [plain] : lines });
  }

  // Powers and items only exist in Stadium, whatever the surrounding headings say.
  const looksLikeStadium = blocks.some((block) => block.title !== null && /\s[-–—]\s*(.*\bpower\b|.*\bitem\b)/i.test(block.title));

  return {
    name,
    heroId: hero?.id ?? null,
    // The section's role is what Blizzard published at the time, which matters for heroes that moved roles.
    role: context.role ?? hero?.role ?? null,
    scope: looksLikeStadium && context.scope === 'standard' ? 'stadium' : context.scope,
    forceDirection: context.force,
    hasDeveloperComment: Boolean(node.querySelector('.PatchNotesHeroUpdate-dev')),
    blocks,
  };
}

const STRUCTURAL_TITLE = /^(general updates?|general|hero (balance )?(updates?|changes)|heroes? updates?|hero reworks?|stadium updates?|stadium hero updates?|hotfix.*|balance hotfix.*|bug fix.*|tank|damage|support|game client update|patch notes?)\b/i;

function parseOtherSection(section: Element, title: string): RawOther[] {
  const results: RawOther[] = [];
  const generals = [...section.querySelectorAll('.PatchNotesGeneralUpdate')];

  if (/^bug fixes?\b/i.test(title) || /^(general|stadium) bug fix/i.test(title)) {
    const collect = (container: Element, group: string | null) => {
      const blocks = blocksFromFlow(container);
      if (blocks.length) {
        for (const block of blocks) results.push({ section: 'bugfix', group, title: block.title, lines: block.lines });
      } else {
        const plain = text(container);
        if (plain) results.push({ section: 'bugfix', group, title: null, lines: [plain] });
      }
    };
    const description = section.querySelector('.PatchNotes-sectionDescription');
    if (description) collect(description, /stadium/i.test(title) ? 'Stadium' : null);
    for (const general of generals) {
      const body = general.querySelector('.PatchNotesGeneralUpdate-description');
      if (body) collect(body, text(general.querySelector('.PatchNotesGeneralUpdate-title')) || (/stadium/i.test(title) ? 'Stadium' : null));
    }
    return results;
  }

  const kind: OtherItem['section'] = /general|core|competitive|custom|website|item|map|ui\b/i.test(title) ? 'general' : 'event';
  if (title && !STRUCTURAL_TITLE.test(title)) results.push({ section: kind, group: null, title, lines: [] });
  for (const general of generals) {
    const generalTitle = text(general.querySelector('.PatchNotesGeneralUpdate-title'));
    if (generalTitle) results.push({ section: kind === 'event' ? 'general' : kind, group: title && !STRUCTURAL_TITLE.test(title) ? title : null, title: generalTitle, lines: [] });
  }
  return results;
}

/** Sections are flat, so one heading sets the context for the hero sections that follow it. */
export function parseOfficialDocument(document: Document): RawPatch[] {
  const patches: RawPatch[] = [];

  for (const patch of document.querySelectorAll('.PatchNotes-patch')) {
    const id = /patch-(\d{4}-\d{2}-\d{2})/.exec(patch.querySelector('.anchor')?.id ?? '')?.[1];
    if (!id) continue;

    const heroes: RawHero[] = [];
    const other: RawOther[] = [];
    let seasonNumber: number | null = null;
    let isHotfix = false;
    let scope: CardGroup = 'standard';
    let bugFixContext = false;
    let roleHint: Role | null = null;
    let firstGeneric = true;

    for (const section of patch.querySelectorAll('.PatchNotes-section')) {
      const title = text(section.querySelector('.PatchNotes-sectionTitle'));

      if (!section.classList.contains('PatchNotes-section-hero_update')) {
        if (firstGeneric && title) {
          const season = /\bseason\s+(\d+)\b/i.exec(title);
          if (season) seasonNumber = Number(season[1]);
          firstGeneric = false;
        }
        if (/hotfix/i.test(title)) isHotfix = true;

        if (/stadium/i.test(title)) {
          scope = 'stadium';
          bugFixContext = false;
        } else if (/limited[- ]time mode|underwatch|community crafted/i.test(title)) {
          scope = 'limited';
          bugFixContext = false;
        } else if (/^bug fix/i.test(title)) {
          bugFixContext = true;
        } else if (/^(hero (balance )?updates?|heroes? updates?|hero reworks?)\b/i.test(title) && scope !== 'limited') {
          scope = 'standard';
          bugFixContext = false;
        } else if (/^hotfix|^balance hotfix/i.test(title)) {
          scope = 'standard';
          bugFixContext = false;
        }
        // A role heading with its heroes in the next section, untitled.
        roleHint = roleFromTitle(title);
        if (title) other.push(...parseOtherSection(section, title));
        continue;
      }

      const force: RawHero['forceDirection'] = /bug fix/i.test(title) || bugFixContext ? 'bugfix' : /\bui updates\b/i.test(title) ? 'qol' : null;
      const sectionScope: CardGroup = /stadium/i.test(title) ? 'stadium' : /underwatch|community crafted|limited[- ]time/i.test(title) ? 'limited' : scope;
      const role = roleFromTitle(title) ?? (title ? null : roleHint);
      for (const node of section.querySelectorAll('.PatchNotesHeroUpdate')) {
        heroes.push(parseHero(node, { scope: sectionScope, role, force }));
      }
    }

    patches.push({ id, title: text(patch.querySelector('.PatchNotes-patchTitle')), date: id, seasonNumber, isHotfix, heroes, other });
  }

  return patches;
}

export function sourceUrlFor(date: string) {
  const [year, month] = date.split('-');
  return `https://overwatch.blizzard.com/en-us/news/patch-notes/live/${year}/${month}/#patch-${date}`;
}

export interface BlockHead {
  ability: string | null;
  kind: ChangeKind | null;
}

/** Splits headers such as "Overstrike - Major Perk". Hyphenated names like Tri-Shot have no spaces around the dash. */
export function splitBlockTitle(title: string | null): BlockHead {
  if (!title) return { ability: null, kind: null };
  const cleaned = title.replace(/\s+/g, ' ').trim().replace(/\s*\(6v6\)\s*$/i, '');
  if (/^(general|general updates?)$/i.test(cleaned)) return { ability: null, kind: null };
  const match = /^(.*?)\s+[-–—]\s+(.+?)\.?$/.exec(cleaned);
  if (!match) return { ability: cleaned.replace(/:$/, ''), kind: null };
  const [, name, tail] = match;
  if (/^ultimate$/i.test(name)) return { ability: tail, kind: 'ultimate' };
  if (/major perk/i.test(tail)) return { ability: name, kind: 'perk-major' };
  if (/minor perk/i.test(tail)) return { ability: name, kind: 'perk-minor' };
  if (/\bperk\b/i.test(tail)) return { ability: name, kind: 'perk' };
  if (/\bitem\b/i.test(tail)) return { ability: name, kind: 'item' };
  if (/\bpower\b/i.test(tail)) return { ability: name, kind: 'power' };
  if (/\bpassive\b/i.test(tail)) return { ability: name, kind: 'passive' };
  if (/\b(primary|secondary)\s+fire\b/i.test(tail)) return { ability: `${name} (${tail})`, kind: 'weapon' };
  return { ability: cleaned, kind: null };
}

export interface HeroAbilities {
  weapons: string[];
  ultimates: string[];
  passives: string[];
  minorPerks: string[];
  majorPerks: string[];
}

export type AbilityCatalog = Record<string, HeroAbilities>;

function resolveKind(entry: HeroAbilities | undefined, ability: string | null, head: ChangeKind | null, stat: string | null, line: string, scope: CardGroup): ChangeKind {
  const has = (list: string[] | undefined, name: string) => Boolean(list?.some((item) => slug(item) === name));
  if (head && head !== 'perk') return head;
  const name = ability ? slug(ability) : null;

  if (name && has(entry?.majorPerks, name)) return 'perk-major';
  if (name && has(entry?.minorPerks, name)) return 'perk-minor';

  // "Raging Storm perk knockback ..." sits under its ability, so the perk is named in the line.
  const mention = `${stat ?? ''} ${line}`.toLowerCase();
  const names = (list: string[] | undefined) => list?.some((item) => mention.includes(item.toLowerCase()));
  if (/\bperk\b/.test(mention)) {
    if (names(entry?.majorPerks)) return 'perk-major';
    if (names(entry?.minorPerks)) return 'perk-minor';
    return 'perk';
  }
  if (head === 'perk') return 'perk';

  if (!name) return 'base';
  if (has(entry?.ultimates, name)) return 'ultimate';
  if (has(entry?.weapons, name)) return 'weapon';
  if (has(entry?.passives, name)) return 'passive';
  if (scope === 'stadium') return 'power';
  return 'ability';
}

export interface ReviewedChange {
  /** The source line this decision was made against. If the line changes, the decision no longer applies. */
  sourceHash: string;
  direction?: BalanceChange['direction'];
  situational?: boolean;
  summary?: string;
  kind?: ChangeKind;
  stat?: string;
  unit?: string | null;
  qualifier?: string | null;
  note?: string | null;
  previous?: number | null;
  next?: number | null;
  percentChange?: number | null;
  categories?: BalanceChange['categories'];
  series?: string | null;
}

export interface ReviewedOther {
  summary: string;
  sourceHash?: string;
}

export interface PatchReview {
  patchId: string;
  reviewedAt: string;
  forumUrl?: string;
  /** Keyed by "heroId|group". */
  heroes?: Record<string, { summary?: string; devIntent?: string }>;
  changes?: Record<string, ReviewedChange>;
  other?: Record<string, ReviewedOther>;
}

export interface SeasonStart {
  year: number;
  number: number;
  start: string;
}

export function seasonFor(date: string, seasons: SeasonStart[]): SeasonRef | null {
  const season = [...seasons].sort((a, b) => b.start.localeCompare(a.start)).find((item) => item.start <= date);
  return season ? { id: `${season.year}-s${season.number}`, label: `Season ${season.number}`, year: season.year, number: season.number } : null;
}

export interface NormalizeOptions {
  hash: (text: string) => string;
  catalog: AbilityCatalog;
  seasons: SeasonStart[];
  review?: PatchReview | null;
}

export type NormalizedPatch = Omit<PatchFile, 'firstImportedAt' | 'lastVerifiedAt' | 'revisions'>;

export interface NormalizeResult {
  file: NormalizedPatch;
  /** Reviewed entries whose source line changed or vanished. They are not applied and need a fresh look. */
  staleReviews: string[];
}

/** Turns one parsed patch into stored records. A review only applies while its line is unchanged. */
export function normalizePatch(raw: RawPatch, options: NormalizeOptions): NormalizeResult {
  const { hash, catalog, review } = options;
  const changes: BalanceChange[] = [];
  const notes = new Map<string, HeroNote>();
  const stale = new Set(Object.keys(review?.changes ?? {}));
  const counters = new Map<string, number>();

  const applyReview = (change: BalanceChange) => {
    const reviewed = review?.changes?.[change.id];
    if (!reviewed || reviewed.sourceHash !== change.sourceHash) return;
    stale.delete(change.id);
    if (reviewed.direction) change.direction = reviewed.direction;
    if (reviewed.situational !== undefined) change.situational = reviewed.situational;
    if (reviewed.summary) change.summary = reviewed.summary;
    if (reviewed.kind) change.kind = reviewed.kind;
    if (reviewed.stat) change.stat = reviewed.stat;
    if (reviewed.unit !== undefined) change.unit = reviewed.unit;
    if (reviewed.qualifier !== undefined) change.qualifier = reviewed.qualifier;
    if (reviewed.note !== undefined) change.note = reviewed.note;
    if (reviewed.previous !== undefined) change.previous = reviewed.previous;
    if (reviewed.next !== undefined) change.next = reviewed.next;
    if (reviewed.series !== undefined) change.series = reviewed.series;
    if (reviewed.categories) change.categories = reviewed.categories;
    change.percentChange = reviewed.percentChange !== undefined ? reviewed.percentChange : percentChange(change.previous, change.next);
    change.classifiedBy = 'review';
  };

  const pushChange = (hero: { id: string; name: string; role: Role | null }, scope: CardGroup, title: string | null, line: string, force: RawHero['forceDirection'], isFixList: boolean) => {
    // Some patches put the perk's name inside the line rather than in a heading above it.
    const inline = /^(.{2,40}?)\s+[-–—]\s+((?:Minor|Major) Perk)\s+(.+)$/i.exec(line);
    const inlineHead = inline && !title ? `${inline[1]} - ${inline[2]}` : null;
    const rest = inline && !title ? `${inline[3].charAt(0).toUpperCase()}${inline[3].slice(1)}` : line;
    const head = splitBlockTitle(isFixList ? null : inlineHead ?? title);
    const parsed = parseLine(rest);
    const titleIsSixVsSix = !isFixList && title !== null && /\b6v6\b/i.test(title);
    const lineScope: Scope = (parsed.sixVsSix || titleIsSixVsSix) && scope === 'standard' ? '6v6' : scope;
    const abilityKey = isFixList ? 'fix' : head.ability ? slug(head.ability) : 'base';
    const counterKey = `${lineScope}/${hero.id}/${abilityKey}`;
    const index = counters.get(counterKey) ?? 0;
    counters.set(counterKey, index + 1);

    const hasValues = parsed.previous !== null && parsed.next !== null;
    const statKey = !isFixList && parsed.stat ? seriesStat(parsed.stat, head.ability) : null;
    const direction = force ?? classifyLine(parsed, rest);

    const change: BalanceChange = {
      id: `${raw.id}/${counterKey}/${index}`,
      series: statKey && hasValues ? `${lineScope}/${hero.id}/${abilityKey}/${statKey}` : null,
      heroId: hero.id,
      heroName: hero.name,
      role: hero.role,
      scope: lineScope,
      queue: parsed.queue,
      kind: isFixList ? 'fix' : resolveKind(catalog[hero.id], head.ability, head.kind, parsed.stat, line, scope),
      ability: isFixList ? null : head.ability,
      stat: isFixList ? null : parsed.stat,
      categories: isFixList ? [] : statCategories(parsed.stat, head.ability),
      previous: isFixList ? null : parsed.previous,
      next: isFixList ? null : parsed.next,
      changeBy: isFixList ? null : parsed.changeBy,
      unit: isFixList ? null : parsed.unit,
      qualifier: isFixList ? null : parsed.qualifier,
      note: isFixList ? null : parsed.note,
      percentChange: isFixList ? null : percentChange(parsed.previous, parsed.next),
      direction,
      situational: false,
      classifiedBy: direction === 'needs-review' ? 'none' : 'rule',
      summary: null,
      sourceHash: hash(normalizeForHash(line)),
    };
    applyReview(change);
    changes.push(change);
  };

  const noteFor = (heroId: string, group: CardGroup, hasDeveloperComment: boolean) => {
    const key = `${heroId}|${group}`;
    const reviewed = review?.heroes?.[key];
    const existing = notes.get(key);
    notes.set(key, {
      heroId,
      group,
      hasDeveloperComment: hasDeveloperComment || Boolean(existing?.hasDeveloperComment),
      devIntent: reviewed?.devIntent ?? null,
      summary: reviewed?.summary ?? null,
    });
  };

  for (const rawHero of raw.heroes) {
    const known = rawHero.heroId ? HEROES.find((hero) => hero.id === rawHero.heroId) : null;
    const hero = { id: rawHero.heroId ?? slug(rawHero.name), name: known?.name ?? rawHero.name.replace(/\s*\([^)]*\)\s*$/, ''), role: rawHero.role };
    noteFor(hero.id, rawHero.scope, rawHero.hasDeveloperComment);
    for (const block of rawHero.blocks) {
      for (const line of block.lines) pushChange(hero, rawHero.scope, block.title, line, rawHero.forceDirection, false);
    }
  }

  // Fixes listed under a hero's name go on that hero's card. Everything else stays with the patch.
  const other: OtherItem[] = [];
  const seenTitles = new Set<string>();
  const applyOtherReview = (item: OtherItem) => {
    const reviewed = review?.other?.[item.id];
    if (reviewed && (!reviewed.sourceHash || reviewed.sourceHash === item.sourceHash)) item.summary = reviewed.summary;
    return item;
  };
  const fixCounters = new Map<string, number>();
  let otherBugFixes = 0;

  for (const item of raw.other) {
    if (item.section !== 'bugfix') {
      const id = `${raw.id}/${item.section}/${slug(`${item.group ?? ''} ${item.title ?? ''}`)}`;
      if (!item.title || seenTitles.has(id)) continue;
      seenTitles.add(id);
      other.push(applyOtherReview({ id, section: item.section, group: item.group, title: item.title, summary: null, sourceHash: null }));
      continue;
    }

    const heroFromTitle = item.title ? findHero(item.title) : null;
    const isStadium = Boolean(item.group && /stadium/i.test(item.group));
    for (const line of item.lines) {
      if (heroFromTitle) {
        const scope: CardGroup = isStadium ? 'stadium' : 'standard';
        noteFor(heroFromTitle.id, scope, false);
        pushChange({ id: heroFromTitle.id, name: heroFromTitle.name, role: heroFromTitle.role }, scope, null, line, 'bugfix', true);
        continue;
      }
      const key = slug(`${item.group ?? 'general'} ${item.title ?? ''}`);
      const index = fixCounters.get(key) ?? 0;
      fixCounters.set(key, index + 1);
      otherBugFixes += 1;
      other.push(applyOtherReview({ id: `${raw.id}/bugfix/${key}/${index}`, section: 'bugfix', group: item.group, title: item.title, summary: null, sourceHash: hash(normalizeForHash(line)) }));
    }
  }

  const gameplay = changes.filter((change) => change.direction !== 'bugfix');
  const isSeasonStart = options.seasons.some((season) => season.start === raw.date);
  const type: PatchType = isSeasonStart ? 'season' : raw.isHotfix ? 'hotfix' : gameplay.length === 0 ? 'update' : gameplay.every((change) => change.scope === 'limited') ? 'limited' : 'balance';

  // Covers every published line, so any edit to the notes changes this value.
  const contentHash = hash(JSON.stringify({ title: raw.title, changes: changes.map((change) => `${change.id}:${change.sourceHash}`), other: other.map((item) => `${item.id}:${item.sourceHash ?? item.title}`) }));

  return {
    file: {
      schema: 1,
      id: raw.id,
      title: raw.title,
      date: raw.date,
      type,
      season: seasonFor(raw.date, options.seasons),
      sourceUrl: sourceUrlFor(raw.date),
      forumUrl: review?.forumUrl ?? null,
      contentHash,
      reviewedAt: review?.reviewedAt ?? null,
      counts: countPatch(changes, otherBugFixes),
      notes: [...notes.values()],
      changes,
      other,
    },
    staleReviews: [...stale],
  };
}

/** Compares two imports of the same patch, for the edit log. */
export function diffPatches(previous: Pick<PatchFile, 'changes'>, next: Pick<PatchFile, 'changes'>) {
  const before = new Map(previous.changes.map((change) => [change.id, change.sourceHash]));
  const after = new Map(next.changes.map((change) => [change.id, change.sourceHash]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [id, sourceHash] of after) {
    if (!before.has(id)) added += 1;
    else if (before.get(id) !== sourceHash) changed += 1;
  }
  for (const id of before.keys()) if (!after.has(id)) removed += 1;
  return { added, removed, changed };
}

export interface MergeResult {
  file: PatchFile;
  status: 'new' | 'edited' | 'unchanged';
}

/** Combines a fresh import with what is stored, keeping first-seen dates and logging edits. */
export function mergePatch(stored: PatchFile | null, fresh: NormalizedPatch, now: string): MergeResult {
  if (!stored) return { status: 'new', file: { ...fresh, firstImportedAt: now, lastVerifiedAt: now, revisions: [] } };
  if (stored.contentHash === fresh.contentHash) {
    return { status: 'unchanged', file: { ...fresh, firstImportedAt: stored.firstImportedAt, lastVerifiedAt: now, revisions: stored.revisions } };
  }
  const revision = { detectedAt: now, previousHash: stored.contentHash, ...diffPatches(stored, fresh) };
  return { status: 'edited', file: { ...fresh, firstImportedAt: stored.firstImportedAt, lastVerifiedAt: now, revisions: [...stored.revisions, revision] } };
}

/** A sudden drop in published lines usually means the page's markup moved, so stored data is kept instead. */
export function looksDamaged(stored: Pick<PatchFile, 'changes' | 'other'> | null, fresh: Pick<PatchFile, 'changes' | 'other'>): string | null {
  if (!stored) return null;
  const before = stored.changes.length + stored.other.length;
  const after = fresh.changes.length + fresh.other.length;
  if (before >= 4 && after < before * 0.6) return `lines fell from ${before} to ${after}`;
  if (stored.changes.length > 0 && fresh.changes.length === 0) return `hero changes fell from ${stored.changes.length} to 0`;
  return null;
}
