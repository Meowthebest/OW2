// In-game events: what each record holds, when an event is on, and the checks a hand-kept record must pass.
// Records live in data/cosmetics/curated/game-events.json. Each one comes from a Blizzard announcement and links to it.
import { formatCountdown } from './shop';
import type { Availability, BundleStatus, CosmeticType, Price, Rarity, SourceRef } from './types';

export const GAME_EVENT_KINDS = {
  seasonal: 'Seasonal event',
  event: 'Event',
  mode: 'Limited-time mode',
  challenge: 'Challenges',
  collab: 'Collaboration',
  collection: 'Skin collection',
  shop: 'Shop sale',
  competitive: 'Competitive',
  esports: 'Esports',
} as const;

export type GameEventKind = keyof typeof GAME_EVENT_KINDS;

export interface GameEventReward {
  name: string;
  rarity?: Rarity | null;
  /** The Event Pass track, when the announcement says. */
  track?: 'free' | 'premium' | null;
  note?: string | null;
  cosmeticId?: string | null;
}

export interface GameEventChallenge {
  task: string;
  reward: string;
}

export interface GameEventMode {
  name: string;
  about: string;
}

export interface GameEventPass {
  tiers: number | null;
  price: Price | null;
  note: string | null;
}

/** One event as kept by hand. Dates are as Blizzard states them: a day, or an exact time when one is given. */
export interface GameEventRecord {
  id: string;
  name: string;
  kind: GameEventKind;
  start: string;
  /** Null when no end has been announced. */
  end: string | null;
  summary: string;
  image: { url: string; credit: string } | null;
  modes?: GameEventMode[];
  challenges?: GameEventChallenge[];
  rewards?: GameEventReward[];
  /** Said when the announcement names only some of the rewards. */
  rewardsNote?: string | null;
  pass?: GameEventPass | null;
  notes?: string[];
  /** Cosmetics the event is about, such as a collaboration's skins. */
  cosmetics?: string[];
  /** The catalogue's event tag, so the page can link to every cosmetic from it. */
  cosmeticsEvent?: string | null;
  links?: { label: string; href: string }[];
  sources: SourceRef[];
}

export interface EventCosmetic {
  id: string;
  name: string;
  type: CosmeticType;
  rarity: Rarity | null;
  hero: string | null;
  image: string | null;
  availability: Availability;
}

export interface EventBundle {
  id: string;
  name: string;
  status: BundleStatus;
  image: string | null;
}

/** A record as published, joined to the catalogue and the recorded shop by the build, with every list filled in. */
export interface GameEvent extends GameEventRecord {
  modes: GameEventMode[];
  challenges: GameEventChallenge[];
  rewards: GameEventReward[];
  rewardsNote: string | null;
  pass: GameEventPass | null;
  notes: string[];
  cosmetics: string[];
  cosmeticsEvent: string | null;
  links: { label: string; href: string }[];
  featured: EventCosmetic[];
  bundles: EventBundle[];
  catalogue: { event: string; label: string; count: number } | null;
}

export interface GameEventsFile {
  schema: 1;
  /** When the list was last checked against Blizzard's news. */
  checkedAt: string | null;
  /** The first day the list covers. Nothing earlier was recorded. */
  recordedFrom: string | null;
  events: GameEvent[];
}

const DAY_MS = 86400000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EXACT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const dateParts = (date: string) => date.split('-').map(Number) as [number, number, number];

/** The day of the month of a weekday on or after a date, as in "the second Sunday in March". */
function sundayOnOrAfter(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return day + ((7 - weekday) % 7);
}

/**
 * Hours that US Pacific time is behind UTC at a moment: 7 in daylight time, otherwise 8. Blizzard's dates are Pacific.
 * This follows the US rule in force since 2007, from 2 AM on the second Sunday in March to 2 AM on the first Sunday in November.
 */
export function pacificOffsetAt(time: number) {
  const year = new Date(time).getUTCFullYear();
  const starts = Date.UTC(year, 2, sundayOnOrAfter(year, 2, 8), 10);
  const ends = Date.UTC(year, 10, sundayOnOrAfter(year, 10, 1), 9);
  return time >= starts && time < ends ? 7 : 8;
}

/** The moment a Pacific calendar day begins. */
export function pacificDayStart(date: string) {
  const [year, month, day] = dateParts(date);
  // Pacific midnight is 07:00 or 08:00 UTC, and only the offset in force at that hour matters.
  return Date.UTC(year, month - 1, day, pacificOffsetAt(Date.UTC(year, month - 1, day, 7)));
}

/** Today's date in US Pacific time, as YYYY-MM-DD. */
export function pacificDate(time: number) {
  return new Date(time - pacificOffsetAt(time) * 3600000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map((date) => {
    const [year, month, day] = dateParts(date);
    return Date.UTC(year, month - 1, day);
  });
  return Math.round((b - a) / DAY_MS);
}

export const isDateOnly = (value: string | null | undefined): value is string => typeof value === 'string' && DATE_ONLY.test(value);

/**
 * When an event runs, in milliseconds. A day with no time covers that whole Pacific day, so "to December 7" lasts
 * through December 7. `exact` is true only when the announcement gave times, which is when a ticking countdown is honest.
 */
export function gameEventSpan(event: Pick<GameEventRecord, 'start' | 'end'>) {
  const start = isDateOnly(event.start) ? pacificDayStart(event.start) : Date.parse(event.start);
  const end = event.end === null ? null : isDateOnly(event.end) ? pacificDayStart(addDays(event.end, 1)) : Date.parse(event.end);
  return { start, end, exactStart: !isDateOnly(event.start), exactEnd: event.end !== null && !isDateOnly(event.end) };
}

export type GameEventState = 'live' | 'upcoming' | 'ended';

export function gameEventState(event: Pick<GameEventRecord, 'start' | 'end'>, now: number): GameEventState {
  const span = gameEventSpan(event);
  if (now < span.start) return 'upcoming';
  if (span.end !== null && now >= span.end) return 'ended';
  return 'live';
}

export interface GameEventTiming {
  state: GameEventState;
  /** "Ends in 27 days", "Last day", "Starts tomorrow", "No end date announced". Null once it has ended. */
  text: string | null;
  /** The live or upcoming edge is within two days. */
  soon: boolean;
}

/** What the countdown says. Whole days unless Blizzard gave a time, since a made-up hour would be a guess. */
export function gameEventTiming(event: Pick<GameEventRecord, 'start' | 'end'>, now: number): GameEventTiming {
  const state = gameEventState(event, now);
  const span = gameEventSpan(event);
  const today = pacificDate(now);
  if (state === 'ended') return { state, text: null, soon: false };
  if (state === 'live') {
    if (span.end === null || event.end === null) return { state, text: 'No end date announced', soon: false };
    if (span.exactEnd) {
      const seconds = Math.round((span.end - now) / 1000);
      return { state, text: `Ends in ${formatCountdown(seconds)}`, soon: seconds < 2 * 86400 };
    }
    const days = daysBetween(today, event.end);
    return { state, text: days <= 0 ? 'Last day' : days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`, soon: days <= 2 };
  }
  if (span.exactStart) {
    const seconds = Math.round((span.start - now) / 1000);
    return { state, text: `Starts in ${formatCountdown(seconds)}`, soon: seconds < 2 * 86400 };
  }
  const days = daysBetween(today, event.start);
  return { state, text: days <= 0 ? 'Starts today' : days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`, soon: days <= 2 };
}

/** Running now, coming up, ended within `recentDays`, and everything older. Each list is in the order a visitor needs. */
export function groupGameEvents<T extends Pick<GameEventRecord, 'start' | 'end'>>(events: T[], now: number, recentDays = 45) {
  const live: T[] = [];
  const upcoming: T[] = [];
  const recent: T[] = [];
  const earlier: T[] = [];
  for (const event of events) {
    const state = gameEventState(event, now);
    if (state === 'live') live.push(event);
    else if (state === 'upcoming') upcoming.push(event);
    else if (now - (gameEventSpan(event).end ?? now) <= recentDays * DAY_MS) recent.push(event);
    else earlier.push(event);
  }
  const endOf = (event: T) => gameEventSpan(event).end ?? Number.POSITIVE_INFINITY;
  const startOf = (event: T) => gameEventSpan(event).start;
  live.sort((a, b) => endOf(a) - endOf(b) || startOf(a) - startOf(b));
  upcoming.sort((a, b) => startOf(a) - startOf(b) || endOf(a) - endOf(b));
  recent.sort((a, b) => endOf(b) - endOf(a));
  earlier.sort((a, b) => endOf(b) - endOf(a));
  return { live, upcoming, recent, earlier };
}

const LONGEST_TEXT = 220;
const httpsUrl = (value: unknown) => typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value);

/**
 * Problems with one hand-kept record. Text stays short, in this project's own words, so no announcement is copied.
 * `knownCosmetic` and `knownTag` come from the catalogue, so a typo in an id is caught before it's published.
 */
export function checkGameEvent(record: GameEventRecord, context: { knownCosmetic: (id: string) => boolean; knownTag: (id: string) => boolean }) {
  const problems: string[] = [];
  const where = `event ${record?.id ?? '(no id)'}`;
  if (!record || typeof record !== 'object') return [`${where}: not a record`];
  if (typeof record.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(record.id)) problems.push(`${where}: the id should be lowercase words joined by hyphens`);
  if (typeof record.name !== 'string' || !record.name.trim() || record.name.length > 80) problems.push(`${where}: needs a name of up to 80 characters`);
  if (!Object.prototype.hasOwnProperty.call(GAME_EVENT_KINDS, record.kind)) problems.push(`${where}: unknown kind "${record.kind}"`);
  const validTime = (value: unknown) => typeof value === 'string' && (DATE_ONLY.test(value) || EXACT.test(value)) && Number.isFinite(Date.parse(value));
  if (!validTime(record.start)) problems.push(`${where}: start should be YYYY-MM-DD, or a full time with its offset`);
  if (record.end !== null && !validTime(record.end)) problems.push(`${where}: end should be YYYY-MM-DD, a full time with its offset, or null`);
  if (validTime(record.start) && record.end !== null && validTime(record.end)) {
    const span = gameEventSpan(record);
    if (span.end !== null && !(span.end > span.start)) problems.push(`${where}: ends before it starts`);
  }
  if (typeof record.summary !== 'string' || !record.summary.trim()) problems.push(`${where}: needs a summary`);
  if (record.image !== null && (!record.image || !httpsUrl(record.image.url) || typeof record.image.credit !== 'string' || !record.image.credit.trim())) {
    problems.push(`${where}: an image needs an https url and a credit`);
  }
  if (!Array.isArray(record.sources) || record.sources.length === 0) problems.push(`${where}: needs at least one source`);
  for (const source of record.sources ?? []) {
    if (!httpsUrl(source?.url) || typeof source?.title !== 'string' || !source.title.trim()) problems.push(`${where}: each source needs a title and an https url`);
  }
  for (const id of [...(record.cosmetics ?? []), ...(record.rewards ?? []).map((reward) => reward.cosmeticId).filter((id): id is string => Boolean(id))]) {
    if (!context.knownCosmetic(id)) problems.push(`${where}: no cosmetic ${id} in the catalogue`);
  }
  if (record.cosmeticsEvent && !context.knownTag(record.cosmeticsEvent)) problems.push(`${where}: no cosmetics are tagged with event "${record.cosmeticsEvent}"`);
  for (const reward of record.rewards ?? []) {
    if (reward.track && reward.track !== 'free' && reward.track !== 'premium') problems.push(`${where}: a reward's track should be free or premium`);
  }
  for (const link of record.links ?? []) {
    if (typeof link?.label !== 'string' || !(httpsUrl(link?.href) || /^#\/[\w\-/?=&%.]*$/.test(link?.href ?? ''))) problems.push(`${where}: a link needs a label and an https or #/ address`);
  }
  if (record.pass && record.pass.tiers !== null && !(Number.isInteger(record.pass.tiers) && record.pass.tiers > 0)) problems.push(`${where}: the pass's tiers should be a whole number`);
  const texts = [
    record.summary,
    record.rewardsNote,
    record.pass?.note,
    ...(record.notes ?? []),
    ...(record.modes ?? []).flatMap((mode) => [mode.name, mode.about]),
    ...(record.challenges ?? []).flatMap((challenge) => [challenge.task, challenge.reward]),
    ...(record.rewards ?? []).flatMap((reward) => [reward.name, reward.note]),
  ];
  for (const text of texts) {
    if (typeof text === 'string' && text.length > LONGEST_TEXT) problems.push(`${where}: keep each text under ${LONGEST_TEXT} characters, in your own words ("${text.slice(0, 40)}...")`);
  }
  return problems;
}
