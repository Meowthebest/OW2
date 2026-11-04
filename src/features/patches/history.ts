import type { Role } from '../../data/heroes';
import { cardGroup, rollupHero, type HeroRollup } from './core/rollup';
import type { BalanceChange, CardGroup, HeroClass, HeroHistoryIndex, PatchFile, PatchMeta, Scope } from './core/types';

export interface SeriesPoint {
  change: BalanceChange;
  patchId: string;
  date: string;
  sourceUrl: string;
  /** False when this point's previous value differs from the last point's new value. Null for the first point. */
  continues: boolean | null;
}

export interface StatSeries {
  key: string;
  heroId: string;
  ability: string | null;
  stat: string;
  scope: Scope;
  unit: string | null;
  points: SeriesPoint[];
}

/**
 * Builds a stat's published history for one hero. Points are only ever published before and after values.
 * A mismatch between neighbours means something unknown happened between them, so the link is marked as a gap.
 */
export function buildSeries(patches: PatchFile[], heroId: string): StatSeries[] {
  const series = new Map<string, StatSeries>();
  for (const patch of [...patches].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const change of patch.changes) {
      if (change.heroId !== heroId || !change.series || change.previous === null || change.next === null) continue;
      let entry = series.get(change.series);
      if (!entry) {
        entry = { key: change.series, heroId, ability: change.ability, stat: change.stat ?? 'Value', scope: change.scope, unit: change.unit, points: [] };
        series.set(change.series, entry);
      }
      const last = entry.points[entry.points.length - 1];
      entry.points.push({
        change,
        patchId: patch.id,
        date: patch.date,
        sourceUrl: patch.sourceUrl,
        continues: last ? last.change.next === change.previous && (last.change.unit ?? null) === (change.unit ?? null) : null,
      });
    }
  }
  return [...series.values()];
}

export interface CumulativeResult {
  from: number;
  to: number;
  unit: string | null;
  percent: number | null;
  patches: number;
  /** Set when the chain breaks, naming the first patch that does not follow from the one before it. */
  brokenAt: string | null;
}

/** Totals a stat's change over a range, but only across values that connect. Nothing in between is inferred. */
export function cumulativeChange(series: Pick<StatSeries, 'points' | 'unit'>, fromIndex: number, toIndex: number): CumulativeResult | null {
  const points = series.points.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
  if (points.length === 0) return null;
  const first = points[0].change;
  const last = points[points.length - 1].change;
  if (first.previous === null || last.next === null) return null;
  const broken = points.slice(1).find((point) => point.continues === false);
  const percent = first.previous !== 0 ? Math.round(((last.next - first.previous) / Math.abs(first.previous)) * 1000) / 10 : null;
  return { from: first.previous, to: last.next, unit: series.unit, percent: broken ? null : percent, patches: points.length, brokenAt: broken?.date ?? null };
}

export interface CompareSide {
  rollup: HeroRollup;
  lines: BalanceChange[];
}

export interface CompareRow {
  heroId: string;
  heroName: string;
  role: Role | null;
  a: CompareSide | null;
  b: CompareSide | null;
  /** Stats that both patches changed, which is where the two can be read side by side. */
  shared: Array<{ series: string; a: BalanceChange; b: BalanceChange }>;
}

export interface PatchComparison {
  rows: CompareRow[];
  onlyA: number;
  onlyB: number;
  both: number;
}

const ROLE_ORDER: Record<string, number> = { tank: 0, damage: 1, support: 2 };

export function comparePatches(a: PatchFile, b: PatchFile, group: CardGroup): PatchComparison {
  const collect = (patch: PatchFile) => {
    const heroes = new Map<string, BalanceChange[]>();
    for (const change of patch.changes) {
      if (cardGroup(change) !== group) continue;
      heroes.set(change.heroId, [...(heroes.get(change.heroId) ?? []), change]);
    }
    return heroes;
  };
  const left = collect(a);
  const right = collect(b);
  const rows: CompareRow[] = [];

  for (const heroId of new Set([...left.keys(), ...right.keys()])) {
    const linesA = left.get(heroId);
    const linesB = right.get(heroId);
    const sample = (linesB ?? linesA) as BalanceChange[];
    const shared: CompareRow['shared'] = [];
    if (linesA && linesB) {
      for (const change of linesA) {
        const other = change.series ? linesB.find((line) => line.series === change.series) : undefined;
        if (other && change.series) shared.push({ series: change.series, a: change, b: other });
      }
    }
    rows.push({
      heroId,
      heroName: sample[0].heroName,
      role: sample[0].role,
      a: linesA ? { rollup: rollupHero(linesA), lines: linesA } : null,
      b: linesB ? { rollup: rollupHero(linesB), lines: linesB } : null,
      shared,
    });
  }

  rows.sort((x, y) => (ROLE_ORDER[x.role ?? ''] ?? 3) - (ROLE_ORDER[y.role ?? ''] ?? 3) || x.heroName.localeCompare(y.heroName));
  return {
    rows,
    onlyA: rows.filter((row) => row.a && !row.b).length,
    onlyB: rows.filter((row) => row.b && !row.a).length,
    both: rows.filter((row) => row.a && row.b).length,
  };
}

export interface RepeatRow {
  heroId: string;
  buffPatches: number;
  nerfPatches: number;
  mixedPatches: number;
  buffLines: number;
  nerfLines: number;
  /** The same result in consecutive changes up to the most recent one, as in "3 nerfs in a row". */
  streak: { direction: HeroClass; length: number } | null;
  lastDate: string;
}

/** Tallies patch-level results per hero, so repeated buffs and nerfs can be seen without loading every patch. */
export function repeatedChanges(history: HeroHistoryIndex, patches: Array<Pick<PatchMeta, 'id'>>, group: CardGroup): RepeatRow[] {
  const allowed = new Set(patches.map((patch) => patch.id));
  const rows: RepeatRow[] = [];
  for (const [heroId, tallies] of Object.entries(history.heroes)) {
    const relevant = tallies.filter((tally) => tally.group === group && allowed.has(tally.patch) && tally.classification !== 'fix').sort((a, b) => a.date.localeCompare(b.date));
    if (relevant.length === 0) continue;
    let streak: RepeatRow['streak'] = null;
    const latest = relevant[relevant.length - 1].classification;
    if (latest === 'buff' || latest === 'nerf') {
      let length = 0;
      for (let index = relevant.length - 1; index >= 0 && relevant[index].classification === latest; index -= 1) length += 1;
      streak = { direction: latest, length };
    }
    rows.push({
      heroId,
      buffPatches: relevant.filter((tally) => tally.classification === 'buff').length,
      nerfPatches: relevant.filter((tally) => tally.classification === 'nerf').length,
      mixedPatches: relevant.filter((tally) => tally.classification === 'mixed').length,
      buffLines: relevant.reduce((sum, tally) => sum + tally.buffs, 0),
      nerfLines: relevant.reduce((sum, tally) => sum + tally.nerfs, 0),
      streak,
      lastDate: relevant[relevant.length - 1].date,
    });
  }
  return rows.sort((a, b) => Math.max(b.buffPatches, b.nerfPatches) - Math.max(a.buffPatches, a.nerfPatches) || b.buffPatches + b.nerfPatches - (a.buffPatches + a.nerfPatches) || a.heroId.localeCompare(b.heroId));
}
