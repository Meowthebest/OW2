import { HERO_BY_ID, type Role } from '../../data/heroes';
import { formatCompact, formatDecimal, formatDuration, formatDurationShort, formatInt, formatPercent, formatRatio } from '../../lib/format';
import type { StatsBlock, StatsSummary } from './api/types';

export interface HeroRow {
  key: string;
  name: string;
  /** Undefined for a hero this build's roster does not know about yet. */
  role?: Role;
  stats: StatsBlock;
}

function titleCase(key: string) {
  return key.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function heroName(key: string) {
  return HERO_BY_ID[key]?.name ?? titleCase(key);
}

export function heroRows(stats: StatsSummary | undefined): HeroRow[] {
  return Object.entries(stats?.heroes ?? {})
    .filter((pair): pair is [string, StatsBlock] => Boolean(pair[1]))
    .map(([key, block]) => ({ key, name: heroName(key), role: HERO_BY_ID[key]?.role, stats: block }));
}

export interface Metric {
  id: string;
  label: string;
  short: string;
  get: (stats: StatsBlock) => number | null | undefined;
  format: (value: number | null | undefined) => string;
}

export const METRICS: Metric[] = [
  { id: 'time', label: 'Time played', short: 'Time', get: (s) => s.time_played, format: formatDurationShort },
  { id: 'games', label: 'Games played', short: 'Games', get: (s) => s.games_played, format: formatInt },
  { id: 'wins', label: 'Games won', short: 'Won', get: (s) => s.games_won, format: formatInt },
  { id: 'losses', label: 'Games lost', short: 'Lost', get: (s) => s.games_lost, format: formatInt },
  { id: 'winrate', label: 'Win rate', short: 'Win %', get: (s) => s.winrate, format: formatPercent },
  { id: 'kda', label: 'KDA', short: 'KDA', get: (s) => s.kda, format: formatRatio },
  { id: 'elims10', label: 'Eliminations per 10 min', short: 'Elims/10', get: (s) => s.average?.eliminations, format: formatDecimal },
  { id: 'deaths10', label: 'Deaths per 10 min', short: 'Deaths/10', get: (s) => s.average?.deaths, format: formatDecimal },
  { id: 'assists10', label: 'Assists per 10 min', short: 'Assists/10', get: (s) => s.average?.assists, format: formatDecimal },
  { id: 'damage10', label: 'Damage per 10 min', short: 'Dmg/10', get: (s) => s.average?.damage, format: formatCompact },
  { id: 'healing10', label: 'Healing per 10 min', short: 'Heal/10', get: (s) => s.average?.healing, format: formatCompact },
  { id: 'elims', label: 'Total eliminations', short: 'Elims', get: (s) => s.total?.eliminations, format: formatCompact },
  { id: 'deaths', label: 'Total deaths', short: 'Deaths', get: (s) => s.total?.deaths, format: formatCompact },
  { id: 'assists', label: 'Total assists', short: 'Assists', get: (s) => s.total?.assists, format: formatCompact },
  { id: 'damage', label: 'Total damage', short: 'Damage', get: (s) => s.total?.damage, format: formatCompact },
  { id: 'healing', label: 'Total healing', short: 'Healing', get: (s) => s.total?.healing, format: formatCompact },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((metric) => [metric.id, metric])) as Record<string, Metric>;

const CATEGORY_LABELS: Record<string, string> = {
  hero_specific: 'Hero specific',
  game: 'Game',
  combat: 'Combat',
  assists: 'Assists',
  best: 'Best in a game',
  average: 'Average per 10 min',
  match_awards: 'Match awards',
};

const CATEGORY_ORDER = ['game', 'combat', 'hero_specific', 'assists', 'average', 'best', 'match_awards'];

export function categoryLabel(key: string) {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

export function sortCategories(keys: string[]) {
  const rank = (key: string) => {
    const index = CATEGORY_ORDER.indexOf(key);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

/** "eliminations_avg_per_10_min" to "Eliminations". The category heading carries the rest. */
export function statLabel(key: string) {
  const label = key
    .replace(/_avg_per_10_min$/, '')
    .replace(/_most_in_game$/, '')
    .replace(/_best_in_game$/, '')
    .replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The API reports durations in seconds and accuracy as a whole percent. */
export function formatStat(key: string, value: number | null | undefined) {
  if (/(^|_)time(_|$)/.test(key)) return formatDuration(value);
  if (/accuracy|percentage/.test(key)) return formatPercent(value);
  if (typeof value === 'number' && !Number.isInteger(value)) return formatRatio(value);
  return formatInt(value);
}

export const DIVISION_LABEL: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  emerald: 'Emerald',
  diamond: 'Diamond',
  master: 'Master',
  grandmaster: 'Grandmaster',
  ultimate: 'Champion',
};
