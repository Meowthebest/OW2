// Guess the Pro: a daily game about OWCS players. Everything here is a plain function, shared by the page, the
// importer and the tests. The player list comes from Liquipedia by hand export. See docs/ESPORTS_DATA.md.

/** Flex is what Liquipedia marks a player who covers more than one role. */
export type ProRole = 'tank' | 'damage' | 'support' | 'flex';
export type ProRegion = 'na' | 'emea' | 'kr' | 'cn' | 'jp' | 'pac' | 'other';

export interface ProTeam {
  id: string;
  name: string;
  region: ProRegion;
  /** Where the roster comes from on Liquipedia. */
  page: string | null;
  /** The team's logo, as a path under the site. Null for a team with no logo of its own. */
  logo?: string | null;
}

export interface ProPlayer {
  id: string;
  name: string;
  team: string;
  /** ISO country code, as Liquipedia's flag gives it. */
  nationality: string | null;
  role: ProRole;
  /** Hitscan, projectile, main support and so on, when Liquipedia says. */
  specialty: string | null;
  /** The year the player joined this team. */
  joined: number | null;
  page: string | null;
}

export interface ProData {
  schema: 1;
  season: string;
  /** When the Liquipedia pages were exported. */
  exportedAt: string | null;
  teams: ProTeam[];
  players: ProPlayer[];
}

export const MAX_GUESSES = 8;
/** Puzzle 1. Changing it renumbers every puzzle, so it stays as it is. */
export const FIRST_DAY = '2026-11-10';

export const REGION_LABELS: Record<ProRegion, string> = { na: 'North America', emea: 'EMEA', kr: 'Korea', cn: 'China', jp: 'Japan', pac: 'Pacific', other: 'Other' };
export const ROLE_LABELS: Record<ProRole, string> = { tank: 'Tank', damage: 'Damage', support: 'Support', flex: 'Flex' };

/** Two letters for a team with no logo of its own: "Team Risk" gives TR, "SeijiKING" gives SE. */
export function teamInitials(name: string) {
  const words = name.replace(/^the\s+/i, '').split(/[\s.-]+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [...(words[0] ?? '?').slice(0, 2)];
  return letters.join('').toUpperCase();
}

const SPECIALTY_LABELS: Record<string, string> = { hitscan: 'Hitscan', projectile: 'Projectile', flex: 'Flex', main: 'Main', 'flex-damage': 'Flex Damage', 'main-support': 'Main Support', 'flex-support': 'Flex Support' };
export const specialtyLabel = (value: string | null) => (value ? SPECIALTY_LABELS[value] ?? value.replace(/(^|-)(\w)/g, (_, gap, letter) => `${gap ? ' ' : ''}${letter.toUpperCase()}`) : '—');

/** Countries that count as close to each other, by part of the world. */
const COUNTRY_AREAS: Record<string, string> = {};
const AREAS: Record<string, string> = {
  'east-asia': 'CN HK MO TW JP KR MN',
  'southeast-asia': 'TH VN PH MY SG ID KH LA MM BN',
  'south-asia': 'IN PK BD LK NP',
  oceania: 'AU NZ',
  'north-america': 'US CA MX',
  'latin-america': 'BR AR CL PE CO UY PY VE EC BO CR PA GT DO PR SV HN NI',
  europe: 'GB IE FR DE NL BE LU CH AT LI SE NO DK FI IS EE LV LT ES PT IT GR MT CY PL CZ SK HU RO BG UA BY RU RS HR SI BA MK AL MD ME XK',
  'middle-east-africa': 'SA AE KW QA BH OM JO LB IL PS TR EG IQ IR SY YE MA DZ TN LY ZA NG KE',
};
for (const [area, codes] of Object.entries(AREAS)) for (const code of codes.split(' ')) COUNTRY_AREAS[code] = area;
export const countryArea = (code: string | null) => (code ? COUNTRY_AREAS[code.toUpperCase()] ?? null : null);

let regionNames: Intl.DisplayNames | null = null;
/** "South Korea" from "KR". */
export function countryName(code: string | null) {
  if (!code) return 'Unknown';
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** A player's name, folded so "Proper", "PROPER" and "Próper" all find the same player. */
export const foldName = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Days

const pad = (value: number) => String(value).padStart(2, '0');

/** Today's date where the visitor is, as YYYY-MM-DD. A new pro arrives at the visitor's own midnight. */
export const localDay = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map((day) => {
    const [year, month, date] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  });
  return Math.round((b - a) / 86400000);
}

export const puzzleNumber = (day: string) => daysBetween(FIRST_DAY, day) + 1;

/** Milliseconds until the visitor's next midnight. */
export function untilNextDay(time: number) {
  const next = new Date(time);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - time;
}

// Picking the answer

function hash32(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every player once, in an order fixed by the list itself, so nobody repeats until all have had a turn. */
export function answerOrder(players: ProPlayer[]) {
  const ids = players.map((player) => player.id).sort();
  const next = random(hash32(`guess-the-pro|${ids.join(',')}`));
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return ids;
}

/** The same answer for everyone on the same day. */
export function answerFor(day: string, players: ProPlayer[]) {
  if (players.length === 0) return null;
  const order = answerOrder(players);
  const count = order.length;
  const id = order[(((puzzleNumber(day) - 1) % count) + count) % count];
  return players.find((player) => player.id === id) ?? null;
}

// Comparing a guess

export type ClueKey = 'team' | 'region' | 'nationality' | 'role' | 'specialty' | 'joined';
export type ClueStatus = 'match' | 'close' | 'miss';

export interface ClueResult {
  key: ClueKey;
  status: ClueStatus;
  /** What the guess has, as shown. */
  value: string;
  /** For the year: whether the answer joined earlier or later. */
  hint?: 'earlier' | 'later';
}

export const CLUE_LABELS: Record<ClueKey, string> = { team: 'Team', region: 'Region', nationality: 'Nationality', role: 'Role', specialty: 'Specialty', joined: 'Joined' };

/** Which clues a list can give. Specialty only shows when Liquipedia gave it for most players. */
export function cluesFor(data: Pick<ProData, 'players'>): ClueKey[] {
  const withSpecialty = data.players.filter((player) => player.specialty).length;
  const withJoined = data.players.filter((player) => player.joined !== null).length;
  return [
    'team',
    'region',
    'nationality',
    'role',
    ...(withSpecialty >= data.players.length * 0.6 ? ['specialty' as const] : []),
    ...(withJoined >= data.players.length * 0.6 ? ['joined' as const] : []),
  ];
}

export function compareGuess(guess: ProPlayer, answer: ProPlayer, teams: Map<string, ProTeam>, clues: ClueKey[]): ClueResult[] {
  const guessTeam = teams.get(guess.team);
  const answerTeam = teams.get(answer.team);
  return clues.map((key): ClueResult => {
    switch (key) {
      case 'team':
        return { key, status: guess.team === answer.team ? 'match' : 'miss', value: guessTeam?.name ?? guess.team };
      case 'region':
        return { key, status: guessTeam && answerTeam && guessTeam.region === answerTeam.region ? 'match' : 'miss', value: guessTeam ? REGION_LABELS[guessTeam.region] : '—' };
      case 'nationality': {
        const same = guess.nationality !== null && guess.nationality === answer.nationality;
        const near = !same && countryArea(guess.nationality) !== null && countryArea(guess.nationality) === countryArea(answer.nationality);
        return { key, status: same ? 'match' : near ? 'close' : 'miss', value: countryName(guess.nationality) };
      }
      case 'role':
        return { key, status: guess.role === answer.role ? 'match' : 'miss', value: ROLE_LABELS[guess.role] };
      case 'specialty': {
        // Close means the same role with a different specialty, so a Hitscan guess for a Projectile answer is close.
        const status = guess.role !== answer.role ? 'miss' : guess.specialty === answer.specialty ? 'match' : 'close';
        return { key, status, value: specialtyLabel(guess.specialty) };
      }
      case 'joined': {
        if (guess.joined === null || answer.joined === null) return { key, status: guess.joined === answer.joined ? 'match' : 'miss', value: guess.joined === null ? '—' : String(guess.joined) };
        const gap = answer.joined - guess.joined;
        return { key, status: gap === 0 ? 'match' : Math.abs(gap) === 1 ? 'close' : 'miss', value: String(guess.joined), ...(gap === 0 ? {} : { hint: gap > 0 ? 'later' : 'earlier' }) };
      }
      default:
        return { key, status: 'miss', value: '—' };
    }
  });
}

// Sharing and stats

const SHARE_MARK: Record<ClueStatus, string> = { match: '🟩', close: '🟨', miss: '⬛' };

/** A result to paste anywhere, with no names in it, so it gives nothing away. */
export function shareText({ day, rows, won, practice = false }: { day: string; rows: ClueResult[][]; won: boolean; practice?: boolean }) {
  const title = practice ? 'Guess the Pro (practice)' : `Guess the Pro #${puzzleNumber(day)}`;
  const score = won ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  return [`${title} ${score}`, ...rows.map((row) => row.map((clue) => SHARE_MARK[clue.status]).join(''))].join('\n');
}

export interface ProStats {
  played: number;
  wins: number;
  streak: number;
  best: number;
  /** The last day counted, so a day is only counted once. */
  lastDay: string | null;
  lastWin: string | null;
  /** Wins by the number of guesses they took. */
  spread: number[];
}

export const emptyStats = (): ProStats => ({ played: 0, wins: 0, streak: 0, best: 0, lastDay: null, lastWin: null, spread: Array.from({ length: MAX_GUESSES }, () => 0) });

/** Counts a finished daily game. A streak runs over consecutive days won. */
export function recordResult(stats: ProStats, day: string, won: boolean, guesses: number): ProStats {
  if (stats.lastDay === day) return stats;
  const spread = [...stats.spread];
  if (won) spread[guesses - 1] = (spread[guesses - 1] ?? 0) + 1;
  const streak = won ? (stats.lastWin && addDays(stats.lastWin, 1) === day ? stats.streak + 1 : 1) : 0;
  return { played: stats.played + 1, wins: stats.wins + (won ? 1 : 0), streak, best: Math.max(stats.best, streak), lastDay: day, lastWin: won ? day : stats.lastWin, spread };
}

/** Problems with a published list, so a bad import can't reach the site. */
export function checkProData(data: ProData) {
  const problems: string[] = [];
  if (!data || data.schema !== 1 || !Array.isArray(data.teams) || !Array.isArray(data.players)) return ['expected { "schema": 1, "teams": [...], "players": [...] }'];
  const teams = new Map(data.teams.map((team) => [team.id, team]));
  if (teams.size !== data.teams.length) problems.push('a team id is used twice');
  for (const team of data.teams) {
    if (!/^[a-z0-9-]+$/.test(team.id) || !team.name) problems.push(`team ${team.id}: needs a lowercase id and a name`);
    if (!Object.prototype.hasOwnProperty.call(REGION_LABELS, team.region)) problems.push(`team ${team.id}: unknown region ${team.region}`);
    if (team.logo != null && !/^data\/esports\/logos\/[a-z0-9-]+\.png$/.test(team.logo)) problems.push(`team ${team.id}: a logo should be a file in data/esports/logos`);
  }
  const ids = new Set<string>();
  const names = new Map<string, string>();
  for (const player of data.players) {
    if (ids.has(player.id)) problems.push(`player ${player.id}: the id is used twice`);
    ids.add(player.id);
    const folded = foldName(player.name ?? '');
    if (!folded) problems.push(`player ${player.id}: needs a name`);
    else if (names.has(folded)) problems.push(`players ${names.get(folded)} and ${player.id} can't be told apart by name`);
    names.set(folded, player.id);
    if (!teams.has(player.team)) problems.push(`player ${player.id}: unknown team ${player.team}`);
    if (!Object.prototype.hasOwnProperty.call(ROLE_LABELS, player.role)) problems.push(`player ${player.id}: unknown role ${player.role}`);
    if (player.nationality !== null && !/^[A-Z]{2}$/.test(player.nationality)) problems.push(`player ${player.id}: nationality should be a two-letter code`);
    if (player.joined !== null && !(Number.isInteger(player.joined) && player.joined >= 2015 && player.joined <= 2100)) problems.push(`player ${player.id}: joined should be a year`);
    for (const link of [player.page]) if (link !== null && !/^https:\/\/liquipedia\.net\/overwatch\/\S+$/.test(link)) problems.push(`player ${player.id}: page should be a Liquipedia link`);
  }
  for (const team of data.teams) if (!data.players.some((player) => player.team === team.id)) problems.push(`team ${team.id}: has no players`);
  if (data.players.length < 10) problems.push(`only ${data.players.length} players, which is too few for a game`);
  return problems;
}
