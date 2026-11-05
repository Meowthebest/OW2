// Blizzard's hero statistics, read through OverFast API, with the same filters as Blizzard's page:
// https://overwatch.blizzard.com/en-us/rates/
import { HEROES, ROLES, SUB_ROLES, type Role, type SubRole } from '../../../data/heroes';

const OVERFAST = 'https://overfast-api.tekrop.fr';

export type RateSort = 'pick' | 'win' | 'ban' | 'name';
export type RateRole = 'all' | Role | SubRole;

export interface RateFilters {
  platform: 'pc' | 'console';
  mode: 'quickplay' | 'competitive';
  region: 'americas' | 'asia' | 'europe';
  role: RateRole;
  map: string;
  division: string;
  sort: RateSort;
}

export const DEFAULT_RATE_FILTERS: RateFilters = { platform: 'pc', mode: 'quickplay', region: 'europe', role: 'all', map: 'all', division: 'all', sort: 'pick' };

/** The maps Blizzard's page offers, keyed the way both Blizzard and OverFast key them. */
export const RATE_MAPS: { id: string; label: string }[] = [
  { id: 'aatlis', label: 'Aatlis' },
  { id: 'antarctic-peninsula', label: 'Antarctic Peninsula' },
  { id: 'blizzard-world', label: 'Blizzard World' },
  { id: 'busan', label: 'Busan' },
  { id: 'circuit-royal', label: 'Circuit Royal' },
  { id: 'colosseo', label: 'Colosseo' },
  { id: 'dorado', label: 'Dorado' },
  { id: 'eichenwalde', label: 'Eichenwalde' },
  { id: 'esperanca', label: 'Esperança' },
  { id: 'grimsvotn', label: 'Grímsvötn' },
  { id: 'havana', label: 'Havana' },
  { id: 'hollywood', label: 'Hollywood' },
  { id: 'ilios', label: 'Ilios' },
  { id: 'junkertown', label: 'Junkertown' },
  { id: 'kings-row', label: "King's Row" },
  { id: 'lijiang-tower', label: 'Lijiang Tower' },
  { id: 'midtown', label: 'Midtown' },
  { id: 'neon-junction', label: 'Neon Junction' },
  { id: 'nepal', label: 'Nepal' },
  { id: 'new-junk-city', label: 'New Junk City' },
  { id: 'new-queen-street', label: 'New Queen Street' },
  { id: 'numbani', label: 'Numbani' },
  { id: 'oasis', label: 'Oasis' },
  { id: 'paraiso', label: 'Paraíso' },
  { id: 'rialto', label: 'Rialto' },
  { id: 'route-66', label: 'Route 66' },
  { id: 'runasapi', label: 'Runasapi' },
  { id: 'samoa', label: 'Samoa' },
  { id: 'shambali-monastery', label: 'Shambali Monastery' },
  { id: 'suravasa', label: 'Suravasa' },
  { id: 'watchpoint-gibraltar', label: 'Watchpoint: Gibraltar' },
];

export const RATE_DIVISIONS: { id: string; label: string }[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster'].map((label) => ({ id: label.toLowerCase(), label }));

const SUB_ROLE_IDS = Object.keys(SUB_ROLES);
const MAP_IDS = new Set(RATE_MAPS.map((map) => map.id));
const DIVISION_IDS = new Set(RATE_DIVISIONS.map((division) => division.id));

export function parseRateFilters(query: string): RateFilters {
  const params = new URLSearchParams(query);
  const platform = params.get('input');
  const mode = params.get('mode');
  const region = params.get('region');
  const role = params.get('role') ?? '';
  const map = params.get('map') ?? '';
  const division = params.get('rank') ?? '';
  const sort = params.get('sort');
  return {
    platform: platform === 'console' ? 'console' : 'pc',
    mode: mode === 'competitive' ? 'competitive' : 'quickplay',
    region: region === 'americas' || region === 'asia' ? region : 'europe',
    role: (ROLES as readonly string[]).includes(role) || SUB_ROLE_IDS.includes(role) ? (role as RateRole) : 'all',
    map: MAP_IDS.has(map) ? map : 'all',
    division: DIVISION_IDS.has(division) ? division : 'all',
    sort: sort === 'win' || sort === 'ban' || sort === 'name' ? sort : 'pick',
  };
}

/** Keeps the tab, so the link to a filtered table opens on the table. */
export function serializeRateFilters(filters: RateFilters) {
  const params = new URLSearchParams({ tab: 'heroes' });
  if (filters.platform !== 'pc') params.set('input', filters.platform);
  if (filters.mode !== 'quickplay') params.set('mode', filters.mode);
  if (filters.region !== 'europe') params.set('region', filters.region);
  if (filters.role !== 'all') params.set('role', filters.role);
  if (filters.map !== 'all') params.set('map', filters.map);
  if (filters.mode === 'competitive' && filters.division !== 'all') params.set('rank', filters.division);
  if (filters.sort !== 'pick') params.set('sort', filters.sort);
  return params.toString();
}

export function ratesApiUrl(filters: RateFilters) {
  const params = new URLSearchParams({ platform: filters.platform, gamemode: filters.mode, region: filters.region });
  if (filters.map !== 'all') params.set('map', filters.map);
  if (filters.mode === 'competitive' && filters.division !== 'all') params.set('competitive_division', filters.division);
  return `${OVERFAST}/heroes/stats?${params}`;
}

export function officialRatesUrl(filters: RateFilters) {
  const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const params = new URLSearchParams({
    input: filters.platform === 'console' ? 'Console' : 'PC',
    map: filters.map === 'all' ? 'all-maps' : filters.map,
    region: title(filters.region),
    role: filters.role === 'all' ? 'All' : filters.role,
    rq: filters.mode === 'competitive' ? '1' : '0',
    tier: filters.mode === 'competitive' && filters.division !== 'all' ? title(filters.division) : 'All',
  });
  return `https://overwatch.blizzard.com/en-us/rates/?${params}`;
}

export interface RateRow {
  hero: string;
  pick: number | null;
  win: number | null;
  ban: number | null;
}

const rate = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null);

/** Keeps only well-formed rows. Blizzard shows "--" when it has too little data, which arrives here as a missing number. */
export function parseRates(answer: unknown): RateRow[] {
  if (!Array.isArray(answer)) throw new Error('Unexpected hero rates');
  const rows: RateRow[] = [];
  for (const row of answer) {
    if (!row || typeof row !== 'object' || typeof (row as { hero?: unknown }).hero !== 'string') continue;
    const { hero, pickrate, winrate, banrate } = row as Record<string, unknown>;
    rows.push({ hero: hero as string, pick: rate(pickrate), win: rate(winrate), ban: rate(banrate) });
  }
  return rows;
}

const HERO_BY_ID = new Map(HEROES.map((hero) => [hero.id, hero]));
const heroName = (id: string) => HERO_BY_ID.get(id)?.name ?? id;

export function sortRates(rows: readonly RateRow[], sort: RateSort, role: RateRole) {
  const filtered = rows.filter((row) => {
    if (role === 'all') return true;
    const hero = HERO_BY_ID.get(row.hero);
    return hero ? hero.role === role || hero.subRole === role : false;
  });
  const known = (a: number | null, b: number | null) => {
    if (a === null || b === null) return Number(a === null) - Number(b === null);
    return b - a;
  };
  return filtered.sort((a, b) => {
    if (sort === 'name') return heroName(a.hero).localeCompare(heroName(b.hero));
    const key = sort === 'win' ? 'win' : sort === 'ban' ? 'ban' : 'pick';
    return known(a[key], b[key]) || heroName(a.hero).localeCompare(heroName(b.hero));
  });
}
