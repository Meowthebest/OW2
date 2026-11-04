import { ROLES, type Role } from '../../data/heroes';
import { cardGroup, rollupHero, type HeroRollup } from './core/rollup';
import type { BalanceChange, CardGroup, HeroNote, PatchFile, PatchIndex, PatchMeta } from './core/types';

export type BalanceFilter = 'all' | 'buff' | 'nerf' | 'mixed' | 'neutral' | 'bugfix' | 'review';
export type FormatFilter = 'all' | '5v5' | '6v6' | 'stadium' | 'limited';
export type KindFilter = 'all' | 'weapon' | 'ability' | 'ultimate' | 'perk' | 'perk-minor' | 'perk-major' | 'power' | 'item' | 'base';
export type StatFilter = 'all' | 'health' | 'armor' | 'damage' | 'healing' | 'cooldown' | 'mobility';
export type QueueFilter = 'all' | 'competitive' | 'quickplay';
export type SortKey = 'newest' | 'name' | 'buffs' | 'nerfs';

export interface PatchFilters {
  hero: string;
  ability: string;
  balance: BalanceFilter;
  role: 'all' | Role;
  /** "latest", "all", or one patch id. */
  patch: string;
  season: string;
  queue: QueueFilter;
  format: FormatFilter;
  kind: KindFilter;
  stat: StatFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: PatchFilters = {
  hero: '',
  ability: '',
  balance: 'all',
  role: 'all',
  patch: 'latest',
  season: 'all',
  queue: 'all',
  format: 'all',
  kind: 'all',
  stat: 'all',
  sort: 'newest',
};

const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => (value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);

const BALANCE: readonly BalanceFilter[] = ['all', 'buff', 'nerf', 'mixed', 'neutral', 'bugfix', 'review'];
const FORMATS: readonly FormatFilter[] = ['all', '5v5', '6v6', 'stadium', 'limited'];
const KINDS: readonly KindFilter[] = ['all', 'weapon', 'ability', 'ultimate', 'perk', 'perk-minor', 'perk-major', 'power', 'item', 'base'];
const STATS: readonly StatFilter[] = ['all', 'health', 'armor', 'damage', 'healing', 'cooldown', 'mobility'];
const QUEUES: readonly QueueFilter[] = ['all', 'competitive', 'quickplay'];
const SORTS: readonly SortKey[] = ['newest', 'name', 'buffs', 'nerfs'];

/** Reads filters from a URL. Anything unrecognized falls back to its default, so old links keep working. */
export function parseFilters(query: string): PatchFilters {
  const params = new URLSearchParams(query);
  const patch = params.get('patch');
  return {
    hero: params.get('hero') ?? '',
    ability: params.get('ability') ?? '',
    balance: oneOf(params.get('balance'), BALANCE, 'all'),
    role: oneOf(params.get('role'), ['all', ...ROLES] as const, 'all'),
    patch: patch && (patch === 'all' || /^\d{4}-\d{2}-\d{2}$/.test(patch)) ? patch : 'latest',
    season: params.get('season') ?? 'all',
    queue: oneOf(params.get('queue'), QUEUES, 'all'),
    format: oneOf(params.get('format'), FORMATS, 'all'),
    kind: oneOf(params.get('type'), KINDS, 'all'),
    stat: oneOf(params.get('stat'), STATS, 'all'),
    sort: oneOf(params.get('sort'), SORTS, 'newest'),
  };
}

export interface DrawerTarget {
  heroId: string;
  /** Patch the panel opens on. Null means the hero's most recent change. */
  patchId: string | null;
}

export function parseDrawer(query: string): DrawerTarget | null {
  const params = new URLSearchParams(query);
  const heroId = params.get('open');
  if (!heroId || !/^[a-z0-9-]+$/.test(heroId)) return null;
  const at = params.get('at');
  return { heroId, patchId: at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : null };
}

/** Writes only what differs from the defaults, so a shared link stays short. */
export function serializeFilters(filters: PatchFilters, drawer: DrawerTarget | null = null) {
  const params = new URLSearchParams();
  const put = (key: string, value: string, fallback: string) => {
    if (value && value !== fallback) params.set(key, value);
  };
  put('hero', filters.hero, '');
  put('ability', filters.ability, '');
  put('balance', filters.balance, 'all');
  put('role', filters.role, 'all');
  put('patch', filters.patch, 'latest');
  put('season', filters.season, 'all');
  put('queue', filters.queue, 'all');
  put('format', filters.format, 'all');
  put('type', filters.kind, 'all');
  put('stat', filters.stat, 'all');
  put('sort', filters.sort, 'newest');
  if (drawer) {
    params.set('open', drawer.heroId);
    if (drawer.patchId) params.set('at', drawer.patchId);
  }
  return params.toString();
}

export const activeFilterCount = (filters: PatchFilters) =>
  (Object.keys(DEFAULT_FILTERS) as Array<keyof PatchFilters>).filter((key) => filters[key] !== DEFAULT_FILTERS[key]).length;

/** The newest patch with hero changes. A later bug fix update does not replace it as the page's headline. */
export function latestBalancePatch(index: Pick<PatchIndex, 'patches'>): PatchMeta | null {
  return (
    index.patches.find((patch) => patch.counts.gameplayChanges + patch.counts.qol + patch.counts.stadiumChanges + patch.counts.limitedChanges > 0) ??
    index.patches[0] ??
    null
  );
}

/** Which patch files a filter needs. A season on its own means everything in that season. */
export function selectPatches(index: Pick<PatchIndex, 'patches'>, filters: Pick<PatchFilters, 'patch' | 'season'>): PatchMeta[] {
  const inSeason = filters.season === 'all' ? index.patches : index.patches.filter((patch) => patch.season?.id === filters.season);
  if (filters.patch === 'all') return inSeason;
  if (filters.patch === 'latest') {
    if (filters.season !== 'all') return inSeason;
    const latest = latestBalancePatch(index);
    return latest ? [latest] : [];
  }
  return inSeason.filter((patch) => patch.id === filters.patch);
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

function matchesFormat(change: BalanceChange, format: FormatFilter) {
  if (format === 'all') return true;
  if (format === '5v5') return change.scope === 'standard';
  return change.scope === format;
}

function matchesKind(change: BalanceChange, kind: KindFilter) {
  if (kind === 'all') return true;
  if (kind === 'perk') return change.kind === 'perk' || change.kind === 'perk-minor' || change.kind === 'perk-major';
  if (kind === 'ability') return change.kind === 'ability' || change.kind === 'passive';
  return change.kind === kind;
}

function matchesLine(change: BalanceChange, filters: PatchFilters, abilityQuery: string) {
  if (!matchesFormat(change, filters.format)) return false;
  if (!matchesKind(change, filters.kind)) return false;
  if (filters.stat !== 'all' && !change.categories.includes(filters.stat)) return false;
  // Lines with no stated queue apply to both queues, so they stay visible under either choice.
  if (filters.queue !== 'all' && change.queue !== 'all' && change.queue !== filters.queue) return false;
  if (filters.balance === 'neutral' && change.direction !== 'neutral' && change.direction !== 'qol') return false;
  if (filters.balance === 'bugfix' && change.direction !== 'bugfix') return false;
  if (filters.balance === 'review' && change.direction !== 'needs-review') return false;
  if (abilityQuery) {
    const haystack = normalize([change.ability, change.stat, change.note].filter(Boolean).join(' '));
    if (!haystack.includes(abilityQuery)) return false;
  }
  return true;
}

export interface HeroCardModel {
  key: string;
  patch: PatchMeta;
  heroId: string;
  heroName: string;
  role: Role | null;
  group: CardGroup;
  /** Every line for this hero, patch and format selection. */
  lines: BalanceChange[];
  /** The lines that match the current filters. */
  shown: BalanceChange[];
  rollup: HeroRollup;
  note: HeroNote | null;
}

/**
 * Builds hero cards for the selected patches. Buff, nerf and mixed describe a hero's overall result.
 * Other filters narrow to individual lines, and each card reports how many lines remain.
 */
export function buildCards(patches: PatchFile[], filters: PatchFilters): HeroCardModel[] {
  const heroQuery = normalize(filters.hero);
  const abilityQuery = normalize(filters.ability);
  const cards: HeroCardModel[] = [];

  for (const patch of patches) {
    const groups = new Map<string, BalanceChange[]>();
    for (const change of patch.changes) {
      if (!matchesFormat(change, filters.format)) continue;
      const key = `${change.heroId}|${cardGroup(change)}`;
      const list = groups.get(key);
      if (list) list.push(change);
      else groups.set(key, [change]);
    }

    for (const [key, lines] of groups) {
      const [heroId, group] = key.split('|') as [string, CardGroup];
      const first = lines[0];
      if (heroQuery && !normalize(first.heroName).includes(heroQuery)) continue;
      if (filters.role !== 'all' && first.role !== filters.role) continue;

      const rollup = rollupHero(lines);
      if (filters.balance === 'buff' && rollup.classification !== 'buff') continue;
      if (filters.balance === 'nerf' && rollup.classification !== 'nerf') continue;
      if (filters.balance === 'mixed' && rollup.classification !== 'mixed') continue;

      const shown = lines.filter((change) => matchesLine(change, filters, abilityQuery));
      if (shown.length === 0) continue;

      cards.push({
        key: `${patch.id}|${key}`,
        patch,
        heroId,
        heroName: first.heroName,
        role: first.role,
        group,
        lines,
        shown,
        rollup,
        note: patch.notes.find((note) => note.heroId === heroId && note.group === group) ?? null,
      });
    }
  }

  return sortCards(cards, filters.sort);
}

const ROLE_ORDER: Record<string, number> = { tank: 0, damage: 1, support: 2 };
const GROUP_ORDER: Record<CardGroup, number> = { standard: 0, stadium: 1, limited: 2 };

export function sortCards(cards: HeroCardModel[], sort: SortKey): HeroCardModel[] {
  const byName = (a: HeroCardModel, b: HeroCardModel) => a.heroName.localeCompare(b.heroName);
  const byDate = (a: HeroCardModel, b: HeroCardModel) => b.patch.date.localeCompare(a.patch.date);
  const byGroup = (a: HeroCardModel, b: HeroCardModel) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
  const byRole = (a: HeroCardModel, b: HeroCardModel) => (ROLE_ORDER[a.role ?? ''] ?? 3) - (ROLE_ORDER[b.role ?? ''] ?? 3);
  const fixOnlyLast = (a: HeroCardModel, b: HeroCardModel) => Number(a.rollup.classification === 'fix') - Number(b.rollup.classification === 'fix');

  const order = {
    newest: [byDate, byGroup, byRole, fixOnlyLast, byName],
    name: [byName, byDate, byGroup],
    buffs: [(a: HeroCardModel, b: HeroCardModel) => b.rollup.buffs - a.rollup.buffs, byDate, byName, byGroup],
    nerfs: [(a: HeroCardModel, b: HeroCardModel) => b.rollup.nerfs - a.rollup.nerfs, byDate, byName, byGroup],
  }[sort];

  return [...cards].sort((a, b) => {
    for (const compare of order) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}

export interface ResultSection {
  key: string;
  patch: PatchMeta | null;
  group: CardGroup;
  cards: HeroCardModel[];
}

/** Groups cards so Stadium and limited modes are never merged with standard play. */
export function buildSections(cards: HeroCardModel[], sort: SortKey, multiplePatches: boolean): ResultSection[] {
  const byPatch = sort === 'newest' && multiplePatches;
  const sections = new Map<string, ResultSection>();
  for (const card of cards) {
    const key = byPatch ? `${card.patch.id}|${card.group}` : card.group;
    let section = sections.get(key);
    if (!section) {
      section = { key, patch: byPatch ? card.patch : null, group: card.group, cards: [] };
      sections.set(key, section);
    }
    section.cards.push(card);
  }
  const list = [...sections.values()];
  return byPatch ? list : list.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);
}

export interface ResultTotals {
  heroes: number;
  lines: number;
  stadiumHeroes: number;
  stadiumLines: number;
  limitedHeroes: number;
  limitedLines: number;
}

/** Unique heroes and change lines per format, so Stadium and limited modes never inflate standard counts. */
export function resultTotals(cards: HeroCardModel[]): ResultTotals {
  const count = (group: CardGroup) => {
    const list = cards.filter((card) => card.group === group);
    return { heroes: new Set(list.map((card) => card.heroId)).size, lines: list.reduce((sum, card) => sum + card.shown.length, 0) };
  };
  const standard = count('standard');
  const stadium = count('stadium');
  const limited = count('limited');
  return { heroes: standard.heroes, lines: standard.lines, stadiumHeroes: stadium.heroes, stadiumLines: stadium.lines, limitedHeroes: limited.heroes, limitedLines: limited.lines };
}
