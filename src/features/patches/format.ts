import type { HeroRollup } from './core/rollup';
import type { BalanceChange, ChangeKind, HeroClass, Scope } from './core/types';

const MINUS = '−';

function trimNumber(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

/** One published value with its unit. */
export function formatValue(value: number, unit: string | null) {
  const number = trimNumber(value);
  switch (unit) {
    case 's':
    case '%':
    case 'm':
    case '°':
    case '%/s':
    case '/s':
      return `${number}${unit}`;
    case 'm/s':
      return `${number} m/s`;
    default:
      return number;
  }
}

export function signed(value: number, digits = 1) {
  const rounded = Math.round(Math.abs(value) * 10 ** digits) / 10 ** digits;
  return `${value < 0 ? MINUS : value > 0 ? '+' : ''}${rounded}`;
}

export const usesPercentPoints = (unit: string | null) => unit === '%' || unit === '%/s';

/**
 * The difference shown beside a change. It only uses published numbers. A percent appears when both
 * values exist and a ratio means something, and percent stats also show their point difference.
 */
export function formatDifference(change: Pick<BalanceChange, 'previous' | 'next' | 'unit' | 'percentChange' | 'changeBy'>): string | null {
  const { previous, next, unit, percentChange, changeBy } = change;
  if (previous !== null && next !== null) {
    const delta = next - previous;
    if (usesPercentPoints(unit)) {
      const points = `${signed(delta, 2)} pts`;
      return percentChange !== null ? `${points} (${signed(percentChange)}%)` : points;
    }
    if (percentChange !== null) return `${signed(percentChange)}%`;
    return `${signed(delta, 2)}${unit && unit !== 'm/s' ? unit : ''}`;
  }
  if (changeBy !== null) return `${signed(changeBy, 2)}${unit ?? ''}`;
  return null;
}

export interface ValueParts {
  previous: string | null;
  next: string | null;
  qualifier: string | null;
}

export function valueParts(change: Pick<BalanceChange, 'previous' | 'next' | 'unit' | 'qualifier'>): ValueParts {
  return {
    previous: change.previous !== null ? formatValue(change.previous, change.unit) : null,
    next: change.next !== null ? formatValue(change.next, change.unit) : null,
    qualifier: change.qualifier,
  };
}

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** The name of what changed, in a form that reads well beside its ability. */
export function changeLabel(change: Pick<BalanceChange, 'stat' | 'note' | 'kind' | 'summary'>): string | null {
  if (change.stat) return capitalize(change.stat);
  if (change.kind === 'fix' && change.summary) return change.summary;
  return change.note ?? change.summary;
}

export const hasPublishedValues = (change: Pick<BalanceChange, 'previous' | 'next' | 'changeBy'>) => change.previous !== null || change.next !== null || change.changeBy !== null;

export const KIND_LABEL: Record<ChangeKind, string> = {
  base: 'Base',
  weapon: 'Weapon',
  ability: 'Ability',
  ultimate: 'Ultimate',
  passive: 'Passive',
  'perk-minor': 'Minor Perk',
  'perk-major': 'Major Perk',
  perk: 'Perk',
  power: 'Stadium Power',
  item: 'Stadium Item',
  fix: 'Fix',
};

export const SCOPE_LABEL: Record<Scope, string> = {
  standard: '5v5',
  '6v6': '6v6',
  stadium: 'Stadium',
  limited: 'Limited mode',
};

export const DIRECTION_LABEL: Record<BalanceChange['direction'], string> = {
  buff: 'Buff',
  nerf: 'Nerf',
  neutral: 'Neutral',
  qol: 'Quality of life',
  bugfix: 'Bug fix',
  'needs-review': 'Needs review',
};

export const CLASS_LABEL: Record<HeroClass, string> = {
  buff: 'Buffed',
  nerf: 'Nerfed',
  mixed: 'Mixed',
  neutral: 'Neutral',
  fix: 'Bug fix',
  'needs-review': 'Needs review',
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Explains a mixed result from the counts. Labeled as analysis wherever it is shown. */
export function leanText(rollup: HeroRollup): string | null {
  if (rollup.classification !== 'mixed') return null;
  const buffs = rollup.buffs - rollup.situationalBuffs;
  const nerfs = rollup.nerfs - rollup.situationalNerfs;
  const part = (direct: number, situational: number, word: string) =>
    [direct ? plural(direct, word) : null, situational ? plural(situational, `situational ${word}`) : null].filter(Boolean).join(' and ');
  const buffText = part(buffs, rollup.situationalBuffs, 'buff');
  const nerfText = part(nerfs, rollup.situationalNerfs, 'nerf');
  const unknown = rollup.review > 0 ? ` This does not count ${rollup.review} ${rollup.review === 1 ? 'line' : 'lines'} still needing review.` : '';
  if (rollup.lean === 'nerf') return `${nerfText} against ${buffText}, so the overall result leans toward nerfs.${unknown}`;
  if (rollup.lean === 'buff') return `${buffText} against ${nerfText}, so the overall result leans toward buffs.${unknown}`;
  return `${buffText} and ${nerfText}, with no clear lean either way.${unknown}`;
}

/** The label for lines with no ability: base stats if they name a stat, otherwise general notes on the hero. */
export function abilityName(change: Pick<BalanceChange, 'ability' | 'stat' | 'kind'>) {
  if (change.ability) return change.ability;
  if (change.kind === 'fix') return 'Bug fix';
  return change.stat ? 'Base stats' : 'General';
}

export type ChangeRowItem = { type: 'line'; change: BalanceChange } | { type: 'unworded'; key: string; first: BalanceChange; count: number };

/**
 * Lines with no numbers and no review have nothing to show except that they exist, so runs of them under
 * one ability become a single entry pointing at Blizzard's wording.
 */
export function collapseUnworded(changes: BalanceChange[]): ChangeRowItem[] {
  const items: ChangeRowItem[] = [];
  const seen = new Map<string, Extract<ChangeRowItem, { type: 'unworded' }>>();
  for (const change of changes) {
    if (changeLabel(change) || hasPublishedValues(change)) {
      items.push({ type: 'line', change });
      continue;
    }
    const key = `${change.scope}|${change.direction}|${change.ability ?? ''}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      const item: Extract<ChangeRowItem, { type: 'unworded' }> = { type: 'unworded', key: change.id, first: change, count: 1 };
      seen.set(key, item);
      items.push(item);
    }
  }
  return items;
}

const listNames = (names: string[]) => {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** A plain description built from the facts, for patches without a written summary. */
export function automaticSummary(changes: BalanceChange[]): string {
  const gameplay = changes.filter((change) => change.direction !== 'bugfix');
  if (gameplay.length === 0) return changes.length === 1 ? 'One bug fix.' : `${changes.length} bug fixes.`;
  const names = [...new Set(gameplay.map((change) => change.ability ?? 'base stats'))];
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  const subject = more > 0 ? `${shown.join(', ')} and ${more} more` : listNames(shown);
  return `${plural(gameplay.length, 'change')} to ${subject}.`;
}

export function formatPatchDate(date: string, style: 'long' | 'short' = 'long') {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatMonth(month: string) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
}
