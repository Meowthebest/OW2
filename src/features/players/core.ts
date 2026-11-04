/** Pure logic for player statistics. Everything here works from recorded readings and never fills in a value. */

export type Sample = [time: number, players: number];
export type HourRow = [hour: number, low: number, average: number, high: number, readings: number];

export interface LatestFile {
  schema: 1;
  appId: number;
  source: string;
  trackingSince: string;
  readings: number;
  current: { players: number; at: string };
  lastAttempt: { at: string; ok: boolean; error: string | null };
  stats: {
    peak24h: { players: number; at: string; coveredHours: number } | null;
    change24h: { percent: number; players: number; comparedTo: { players: number; at: string } } | null;
    average30d: { players: number; hours: number } | null;
    peakRecorded: { players: number; at: string };
    coverage: { hoursOf24: number; daysTracked: number; hoursOf720: number };
  };
  sparkline: Sample[];
}

const HOUR = 3600;
const DAY = 86400;

/** Chart colors, checked with the dataviz palette validator against the panel surface. Canvas can't read CSS variables. */
export const SERIES_COLORS = { players: '#cf7c0c', average: '#3f8ce8', previous: '#c9609f' };

/** Readings arrive about every five minutes, but runs can be late or missed, so "stale" allows for several in a row. */
export const STALE_AFTER_MS = 45 * 60 * 1000;

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Checks the file's shape. A damaged file returns null, so the last good data stays on screen. */
export function parseLatest(value: unknown): LatestFile | null {
  const file = value as LatestFile | null;
  if (!file || file.schema !== 1) return null;
  if (!isCount(file.current?.players) || !Number.isFinite(Date.parse(file.current?.at))) return null;
  if (!Number.isFinite(Date.parse(file.trackingSince))) return null;
  if (!file.stats || !isCount(file.stats.peakRecorded?.players) || !file.stats.coverage) return null;
  return { ...file, sparkline: Array.isArray(file.sparkline) ? file.sparkline : [] };
}

export function parseSamples(value: unknown): Sample[] | null {
  const rows = (value as { samples?: unknown } | null)?.samples;
  if (!Array.isArray(rows)) return null;
  return rows.filter((row): row is Sample => Array.isArray(row) && isCount(row[0]) && isCount(row[1]));
}

export function parseHours(value: unknown): HourRow[] | null {
  const rows = (value as { hours?: unknown } | null)?.hours;
  if (!Array.isArray(rows)) return null;
  return rows.filter((row): row is HourRow => Array.isArray(row) && row.length >= 5 && row.slice(0, 5).every(isCount));
}

export interface Freshness {
  ageMs: number;
  stale: boolean;
  reason: 'old' | 'failed' | null;
}

export function freshness(latest: Pick<LatestFile, 'current' | 'lastAttempt'>, nowMs: number): Freshness {
  const ageMs = Math.max(0, nowMs - Date.parse(latest.current.at));
  const failed = latest.lastAttempt && !latest.lastAttempt.ok;
  if (ageMs > STALE_AFTER_MS) return { ageMs, stale: true, reason: 'old' };
  if (failed) return { ageMs, stale: true, reason: 'failed' };
  return { ageMs, stale: false, reason: null };
}

export type RangeKey = '24h' | '7d' | '30d' | '90d' | '6m' | '1y' | 'all';
export type Resolution = 'raw' | 'hourly' | 'daily';

export interface RangeInfo {
  key: RangeKey;
  label: string;
  short: string;
  seconds: number | null;
  /** Short ranges use every reading. Long ones use hourly rows, so a year stays quick to load, and daily rows once there are enough. */
  resolution: Resolution;
  /** Moving average window for this range. */
  averageSeconds: number;
  averageLabel: string;
}

export const RANGES: RangeInfo[] = [
  { key: '24h', label: 'Last 24 hours', short: '24H', seconds: DAY, resolution: 'raw', averageSeconds: HOUR, averageLabel: '1-hour average' },
  { key: '7d', label: 'Last 7 days', short: '7D', seconds: 7 * DAY, resolution: 'raw', averageSeconds: 6 * HOUR, averageLabel: '6-hour average' },
  { key: '30d', label: 'Last 30 days', short: '30D', seconds: 30 * DAY, resolution: 'hourly', averageSeconds: DAY, averageLabel: '24-hour average' },
  { key: '90d', label: 'Last 90 days', short: '90D', seconds: 90 * DAY, resolution: 'daily', averageSeconds: 7 * DAY, averageLabel: '7-day average' },
  { key: '6m', label: 'Last 6 months', short: '6M', seconds: 182 * DAY, resolution: 'daily', averageSeconds: 7 * DAY, averageLabel: '7-day average' },
  { key: '1y', label: 'Last year', short: '1Y', seconds: 365 * DAY, resolution: 'daily', averageSeconds: 7 * DAY, averageLabel: '7-day average' },
  { key: 'all', label: 'All time', short: 'All', seconds: null, resolution: 'daily', averageSeconds: 7 * DAY, averageLabel: '7-day average' },
];

export const rangeInfo = (key: RangeKey) => RANGES.find((range) => range.key === key) as RangeInfo;

export interface ChartFrame {
  range: RangeKey;
  resolution: Resolution;
  x: number[];
  /** Null marks a gap in recording. The line breaks there instead of joining across it. */
  players: Array<number | null>;
  low: Array<number | null> | null;
  high: Array<number | null> | null;
  /** Earliest and latest time shown. The start is never earlier than the first reading. */
  start: number;
  end: number;
  points: number;
  /** True when recording began after the start of the requested range. */
  shorterThanRange: boolean;
}

/** Gaps longer than this break the line, so nothing is implied about the time between readings. */
const GAP_RAW = 60 * 60;
const GAP_HOURLY = 3 * HOUR;
const GAP_DAILY = 2 * DAY;
/** Daily lines only help once there are months to show. Before that, hours are easier to read. */
const MIN_SECONDS_FOR_DAILY = 60 * DAY;
/** A day with fewer recorded hours would skew its average toward whatever time of day was recorded. */
const MIN_HOURS_FOR_DAY = 12;

/** One row per UTC day with enough recorded hours: [day, low, average, high, recorded hours]. */
export function dailyRows(hours: HourRow[]): HourRow[] {
  const days = new Map<number, HourRow[]>();
  for (const row of hours) {
    const day = row[0] - (row[0] % DAY);
    const list = days.get(day);
    if (list) list.push(row);
    else days.set(day, [row]);
  }
  return [...days.entries()]
    .filter(([, list]) => list.length >= MIN_HOURS_FOR_DAY)
    .sort((a, b) => a[0] - b[0])
    .map(([day, list]) => [day, Math.min(...list.map((row) => row[1])), Math.round(list.reduce((sum, row) => sum + row[2], 0) / list.length), Math.max(...list.map((row) => row[3])), list.length]);
}

/** Builds the series for a range, stopping at the first real reading. */
export function buildFrame(rangeKey: RangeKey, source: { samples?: Sample[] | null; hours?: HourRow[] | null }, now: number, options: { forceHourly?: boolean } = {}): ChartFrame | null {
  const range = rangeInfo(rangeKey);
  const from = range.seconds === null ? -Infinity : now - range.seconds;
  const x: number[] = [];
  const players: Array<number | null> = [];
  let low: Array<number | null> | null = null;
  let high: Array<number | null> | null = null;
  let points = 0;

  if (range.resolution === 'raw' && !options.forceHourly) {
    const rows = (source.samples ?? []).filter(([time]) => time >= from && time <= now);
    if (rows.length === 0) return null;
    rows.forEach(([time, value], index) => {
      if (index > 0 && time - rows[index - 1][0] > GAP_RAW) {
        x.push(rows[index - 1][0] + 1);
        players.push(null);
      }
      x.push(time);
      players.push(value);
      points += 1;
    });
    return { range: rangeKey, resolution: 'raw', x, players, low, high, start: rows[0][0], end: rows[rows.length - 1][0], points, shorterThanRange: range.seconds !== null && rows[0][0] > from + range.seconds * 0.02 };
  }

  const allHours = source.hours ?? [];
  const useDaily = range.resolution === 'daily' && allHours.length > 0 && now - allHours[0][0] >= MIN_SECONDS_FOR_DAILY;
  const gap = useDaily ? GAP_DAILY : GAP_HOURLY;
  const rows = (useDaily ? dailyRows(allHours) : allHours).filter(([hour]) => hour >= from - (useDaily ? DAY : HOUR) && hour <= now);
  if (rows.length === 0) return null;
  low = [];
  high = [];
  rows.forEach((row, index) => {
    if (index > 0 && row[0] - rows[index - 1][0] > gap) {
      x.push(rows[index - 1][0] + 1);
      players.push(null);
      (low as Array<number | null>).push(null);
      (high as Array<number | null>).push(null);
    }
    x.push(row[0]);
    players.push(row[2]);
    (low as Array<number | null>).push(row[1]);
    (high as Array<number | null>).push(row[3]);
    points += 1;
  });
  return { range: rangeKey, resolution: useDaily ? 'daily' : 'hourly', x, players, low, high, start: rows[0][0], end: rows[rows.length - 1][0], points, shorterThanRange: range.seconds !== null && rows[0][0] > from + range.seconds * 0.02 };
}

/**
 * A trailing average over real readings. Blank until a full window of data exists, and again after a gap
 * until at least half the window has readings, so it never implies more than was recorded.
 */
export function movingAverage(x: number[], values: Array<number | null>, windowSeconds: number, stepSeconds: number): Array<number | null> {
  const needed = Math.max(1, Math.floor((windowSeconds / stepSeconds) * 0.5));
  const output: Array<number | null> = new Array(x.length).fill(null);
  const first = x.find((_, index) => values[index] !== null);
  if (first === undefined) return output;
  let start = 0;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < x.length; index += 1) {
    const value = values[index];
    if (value !== null) {
      sum += value;
      count += 1;
    }
    while (x[start] < x[index] - windowSeconds) {
      const leaving = values[start];
      if (leaving !== null) {
        sum -= leaving;
        count -= 1;
      }
      start += 1;
    }
    if (value !== null && count >= needed && x[index] - first >= windowSeconds) output[index] = Math.round(sum / count);
  }
  return output;
}

/** The same moment one period earlier, for each point. Blank where no reading exists close enough. */
export function previousPeriod(x: number[], values: Array<number | null>, period: number, source: Array<[number, number]>, tolerance: number): Array<number | null> {
  let cursor = 0;
  return x.map((time, index) => {
    if (values[index] === null) return null;
    const target = time - period;
    while (cursor < source.length - 1 && Math.abs(source[cursor + 1][0] - target) <= Math.abs(source[cursor][0] - target)) cursor += 1;
    const nearest = source[cursor];
    return nearest && Math.abs(nearest[0] - target) <= tolerance ? nearest[1] : null;
  });
}

export interface Extreme {
  time: number;
  players: number;
}

/** The highest and lowest readings inside a visible range. Separate high and low series count when a line shows averages. */
export function extremes(x: number[], values: Array<number | null>, from: number, to: number, highs?: Array<number | null> | null, lows?: Array<number | null> | null): { high: Extreme; low: Extreme } | null {
  let high: Extreme | null = null;
  let low: Extreme | null = null;
  for (let index = 0; index < x.length; index += 1) {
    if (x[index] < from || x[index] > to) continue;
    const top = highs?.[index] ?? values[index];
    const bottom = lows?.[index] ?? values[index];
    if (top !== null && top !== undefined && (!high || top > high.players)) high = { time: x[index], players: top };
    if (bottom !== null && bottom !== undefined && (!low || bottom < low.players)) low = { time: x[index], players: bottom };
  }
  return high && low ? { high, low } : null;
}

export interface WindowSummary {
  average: number;
  peak: number;
  low: number;
  hours: number;
}

/** Summarizes hourly rows in [from, to). Null when too few hours were recorded for the result to mean anything. */
export function summarizeWindow(hours: HourRow[], from: number, to: number, minShare: number): WindowSummary | null {
  const rows = hours.filter(([hour]) => hour >= from && hour < to);
  const expected = (to - from) / HOUR;
  if (rows.length === 0 || rows.length < expected * minShare) return null;
  return {
    average: Math.round(rows.reduce((sum, row) => sum + row[2], 0) / rows.length),
    peak: Math.max(...rows.map((row) => row[3])),
    low: Math.min(...rows.map((row) => row[1])),
    hours: rows.length,
  };
}

const percentBetween = (before: number, after: number) => (before > 0 ? Math.round(((after - before) / before) * 1000) / 10 : null);

export interface PeriodComparison {
  current: WindowSummary;
  previous: WindowSummary;
  averageChange: number | null;
  peakChange: number | null;
}

/** Compares the most recent stretch of time with the one right before it. */
export function comparePeriods(hours: HourRow[], now: number, seconds: number): PeriodComparison | null {
  const end = now - (now % HOUR);
  const current = summarizeWindow(hours, end - seconds, end, 0.8);
  const previous = summarizeWindow(hours, end - 2 * seconds, end - seconds, 0.8);
  if (!current || !previous) return null;
  return { current, previous, averageChange: percentBetween(previous.average, current.average), peakChange: percentBetween(previous.peak, current.peak) };
}

export const dayStart = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

export interface PatchWindow {
  days: number;
  before: WindowSummary | null;
  after: WindowSummary | null;
  averageChange: number | null;
  peakChange: number | null;
}

/**
 * Sampled activity either side of a patch. The release day itself is left out, because only the
 * date is recorded and not the hour, so a reading that day could fall on either side.
 */
export function patchWindow(date: string, hours: HourRow[], days: number, now: number): PatchWindow {
  const released = dayStart(date);
  const before = summarizeWindow(hours, released - days * DAY, released, 0.6);
  const afterStart = released + DAY;
  const afterEnd = afterStart + days * DAY;
  const after = afterEnd <= now ? summarizeWindow(hours, afterStart, afterEnd, 0.6) : null;
  return {
    days,
    before,
    after,
    averageChange: before && after ? percentBetween(before.average, after.average) : null,
    peakChange: before && after ? percentBetween(before.peak, after.peak) : null,
  };
}

export interface TableRow {
  time: number;
  average: number;
  low: number;
  high: number;
  readings: number;
}

/** Rows for the table view: hourly for a day or less on screen, otherwise daily. Newest first. */
export function tableRows(hours: HourRow[], from: number, to: number): { unit: 'hour' | 'day'; rows: TableRow[] } {
  const inRange = hours.filter(([hour]) => hour + HOUR > from && hour <= to);
  if (to - from <= 2 * DAY) {
    return { unit: 'hour', rows: inRange.map(([time, low, average, high, readings]) => ({ time, low, average, high, readings })).reverse() };
  }
  const days = new Map<number, HourRow[]>();
  for (const row of inRange) {
    const day = row[0] - (row[0] % DAY);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  const rows = [...days.entries()].map(([time, list]) => ({
    time,
    low: Math.min(...list.map((row) => row[1])),
    high: Math.max(...list.map((row) => row[3])),
    average: Math.round(list.reduce((sum, row) => sum + row[2], 0) / list.length),
    readings: list.reduce((sum, row) => sum + row[4], 0),
  }));
  return { unit: 'day', rows: rows.reverse() };
}

/** Round axis top so the y scale starts at zero and the size of a change reads honestly. */
export function niceMax(value: number) {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((candidate) => candidate * magnitude >= value * 1.04) ?? 10;
  return step * magnitude;
}

export function formatCompactCount(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return String(Math.round(value));
}

export interface PlayerOptions {
  range: RangeKey;
  average: boolean;
  compare: boolean;
  patches: boolean;
}

export const DEFAULT_OPTIONS: PlayerOptions = { range: '24h', average: false, compare: false, patches: true };

export function parseOptions(query: string): PlayerOptions {
  const params = new URLSearchParams(query);
  const range = params.get('range');
  return {
    range: RANGES.some((item) => item.key === range) ? (range as RangeKey) : DEFAULT_OPTIONS.range,
    average: params.get('average') === '1',
    compare: params.get('compare') === '1',
    patches: params.get('patches') !== '0',
  };
}

export function serializeOptions(options: PlayerOptions) {
  const params = new URLSearchParams();
  if (options.range !== DEFAULT_OPTIONS.range) params.set('range', options.range);
  if (options.average) params.set('average', '1');
  if (options.compare) params.set('compare', '1');
  if (!options.patches) params.set('patches', '0');
  return params.toString();
}

/** Only daily and weekly views have a period to compare with. */
export const comparePeriodFor = (range: RangeKey) => (range === '24h' ? DAY : range === '7d' ? 7 * DAY : null);
