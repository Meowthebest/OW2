import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, ExternalLink, Minus, Package, Swords, TrendingDown, TrendingUp, TriangleAlert, UserRound } from 'lucide-react';
import { Panel, SelectField, StateBlock } from '../../../components/controls';
import { RoleIcon } from '../../../components/icons';
import { HeroPortrait } from '../../../components/media';
import { HEROES, ROLES, ROLE_LABEL, SUB_ROLES, type Role, type SubRole } from '../../../data/heroes';
import { cn, formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { idsOf, passProgress, personalStats } from '../core/collection';
import { officialRatesUrl, sortRates, parseRates, parseRateFilters, ratesApiUrl, RATE_DIVISIONS, RATE_MAPS, serializeRateFilters, type RateFilters, type RateRow, type RateSort } from '../core/rates';
import type { CatalogMeta, CatalogStats, FacetValue } from '../core/types';
import { loadCatalog, loadMeta, loadPass, loadPasses, loadRatesDay, loadRatesIndex, loadStats, useClock, type RatesDay } from '../data';
import { DataState, GridSkeleton, PageHeader, usePageTitle } from '../components/bits';
import { CatalogueCredits } from './CosmeticsPage';
import { dayText, heroLabel, rarityLabel, typeLabel, typeSingular } from '../labels';
import { useCollection } from '../useCollection';
import { useUrlState } from '../useUrlState';

type Tab = 'catalogue' | 'collection' | 'heroes';

const TABS: Array<{ id: Tab; label: string; Icon: typeof BarChart3 }> = [
  { id: 'catalogue', label: 'Cosmetics Database', Icon: Package },
  { id: 'collection', label: 'My Collection', Icon: UserRound },
  { id: 'heroes', label: 'Hero Rates', Icon: Swords },
];

/** A labeled bar for each value: one series, one hue, with the value in text so color is never the only signal. */
function BarList({ title, values, limit, hrefFor }: { title: string; values: FacetValue[]; limit?: number; hrefFor?: (id: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  if (values.length === 0) return null;
  const max = Math.max(...values.map((value) => value.count), 1);
  const shown = limit && !expanded ? values.slice(0, limit) : values;
  return (
    <Panel title={title} className="cx-stat-panel">
      <ul className="cx-bars">
        {shown.map((value) => (
          <li key={value.id} title={`${value.label}: ${formatInt(value.count)}`}>
            {hrefFor ? <a className="cx-bars__label" href={hrefFor(value.id)}>{value.label}</a> : <span className="cx-bars__label">{value.label}</span>}
            <span className="cx-bars__track"><span style={{ width: `${(value.count / max) * 100}%` }} /></span>
            <span className="cx-bars__value">{formatInt(value.count)}</span>
          </li>
        ))}
      </ul>
      {limit && values.length > limit && (
        <button type="button" className="cx-tool cx-tool--quiet" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          {expanded ? 'Show fewer' : `Show all ${values.length}`}
        </button>
      )}
    </Panel>
  );
}

function BigNumber({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="cx-number">
      <span className="cx-number__label">{label}</span>
      <span className="cx-number__value">{value}</span>
      {note && <span className="cx-number__note">{note}</span>}
    </div>
  );
}

const STALE_AFTER_DAYS: Record<string, number> = { itemshop: 9, wiki: 90, blizzard: 45 };

/** Where the numbers come from, when each source last gave anything new, and a warning when that looks too long ago. */
function SourceStatusPanel({ meta }: { meta: CatalogMeta }) {
  const now = useClock(60000);
  return (
    <Panel title="Data sources" className="cx-stat-panel">
      <div className="cx-table-wrap">
        <table className="data-table cx-table">
          <thead>
            <tr><th scope="col">Source</th><th scope="col" className="num">Records</th><th scope="col">Last updated</th><th scope="col">Notes</th></tr>
          </thead>
          <tbody>
            {meta.sources.map((source) => {
              const limit = STALE_AFTER_DAYS[source.id] ?? 60;
              const stale = source.lastSuccess ? now - Date.parse(source.lastSuccess) > limit * 86400000 : false;
              return (
                <tr key={source.id}>
                  <th scope="row">{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}</th>
                  <td className="num">{formatInt(source.records)}</td>
                  <td>{source.lastSuccess ? dayText(source.lastSuccess) : 'Not yet'}{stale && <span className="cx-pill cx-pill--inline" data-tone="warn"><TriangleAlert size={12} aria-hidden="true" /> May be out of date</span>}</td>
                  <td>{source.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CatalogueStats({ stats }: { stats: CatalogStats }) {
  const months = stats.rotationsByMonth.map((row) => ({ id: row.month, label: row.month, count: row.rotations }));
  const meta = useAsync(loadMeta, 'meta');
  return (
    <div className="cx-stats">
      <div className="cx-numbers">
        <BigNumber label="Known cosmetics" value={formatInt(stats.total)} note="Counted from this site's database" />
        <BigNumber label="Bundles" value={formatInt(stats.bundles.total)} note={`${formatInt(stats.bundles.active)} in shop now`} />
        <BigNumber label="Mythic skins" value={formatInt(stats.mythics.skins)} />
        <BigNumber label="Mythic weapons" value={formatInt(stats.mythics.weapons)} />
        {stats.bundles.averageItems !== null && <BigNumber label="Items per bundle" value={String(stats.bundles.averageItems)} note="Average" />}
      </div>
      <div className="cx-stat-grid">
        <BarList title="By cosmetic type" values={stats.byType} hrefFor={(id) => `#/cosmetics?type=${id}`} />
        <BarList title="Skins by rarity" values={stats.skinsByRarity} hrefFor={(id) => `#/cosmetics?type=skin&rarity=${id}`} />
        <BarList title="Where they come from" values={stats.origins} />
        <BarList title="Cosmetics per hero" values={stats.byHero} limit={12} hrefFor={(id) => `#/cosmetics?hero=${id}`} />
        <BarList title="Introduced per season" values={stats.bySeason} limit={12} hrefFor={(id) => `#/cosmetics?season=${id}`} />
        <BarList title="Shop appearances by type" values={stats.appearancesByType} />
        <BarList title="Shop rotations recorded by month" values={months} limit={12} />
        {stats.mostSeen.some((row) => row.seen > 1) && <BarList title="Most often in the shop" values={stats.mostSeen.map((row) => ({ id: row.id, label: `${row.name} (${typeSingular(row.type)}${row.hero ? `, ${heroLabel(row.hero)}` : ''})`, count: row.seen }))} hrefFor={(id) => `#/cosmetics/${id}`} />}
      </div>
      {meta.data && <SourceStatusPanel meta={meta.data} />}
    </div>
  );
}

function CollectionStats() {
  const catalog = useAsync(loadCatalog, 'catalog');
  const passes = useAsync(async () => {
    const list = await loadPasses();
    return Promise.all(list.map((pass) => loadPass(pass.id)));
  }, 'all-passes');
  const entries = useCollection();
  const stats = useMemo(() => (catalog.data ? personalStats(catalog.data, entries, { hero: heroLabel, rarity: rarityLabel, type: typeLabel }) : null), [catalog.data, entries]);
  if (!stats) return <DataState status={catalog.status} error={catalog.error} retry={catalog.retry} what="your collection" />;
  const passRows = (passes.data ?? [])
    .map((pass) => ({ pass, progress: passProgress(pass, entries) }))
    .filter((row) => row.progress.tiers.done > 0 || row.progress.cosmetics.done > 0);
  if (stats.owned === 0 && stats.wishlist === 0 && stats.favorites === 0 && idsOf(entries, 'tier').length === 0) {
    return (
      <StateBlock icon={<UserRound size={24} />} title="Nothing tracked yet" actions={<a className="btn-plain" href="#/cosmetics">Browse cosmetics</a>}>
        Mark cosmetics as owned, wished for or favorited, and your numbers appear here. Marks are yours to set. This site can't see what's in your game account.
      </StateBlock>
    );
  }
  return (
    <div className="cx-stats">
      <div className="cx-numbers">
        <BigNumber label="Marked as owned" value={formatInt(stats.owned)} />
        <BigNumber label="Collection" value={`${stats.completion}%`} note={`of ${formatInt(stats.total)} known cosmetics`} />
        <BigNumber label="Wishlist" value={formatInt(stats.wishlist)} />
        <BigNumber label="Favorites" value={formatInt(stats.favorites)} />
      </div>
      <div className="cx-stat-grid">
        <BarList title="Favorite heroes, by cosmetics owned" values={stats.byHero} limit={12} hrefFor={(id) => `#/cosmetics?hero=${id}&mine=owned`} />
        <BarList title="Owned by rarity" values={stats.byRarity} />
        <BarList title="Owned by type" values={stats.byType} />
        {passRows.length > 0 && (
          <Panel title="Battle Pass progress" className="cx-stat-panel">
            <ul className="cx-bars">
              {passRows.map(({ pass, progress }) => (
                <li key={pass.id}>
                  <a className="cx-bars__label" href={`#/hub/battle-passes/${pass.id}`}>{pass.label}</a>
                  <span className="cx-bars__track"><span style={{ width: `${progress.tiers.percent}%` }} /></span>
                  <span className="cx-bars__value">{progress.tiers.done}/{progress.tiers.total}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

const SUB_ROLE_GROUPS: Record<Role, SubRole[]> = {
  tank: ['stalwart', 'initiator', 'bruiser'],
  damage: ['flanker', 'sharpshooter', 'specialist', 'recon'],
  support: ['medic', 'tactician', 'survivor'],
};

const SORT_LABEL: Array<{ id: RateSort; label: string }> = [
  { id: 'name', label: 'Hero' },
  { id: 'pick', label: 'Pick rate' },
  { id: 'ban', label: 'Ban rate' },
  { id: 'win', label: 'Win rate' },
];

/** One decimal everywhere, so 11% and 12.4% line up as 11.0% and 12.4%. */
const percent = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);
const recordedRows = (day: RatesDay | null | undefined, view: string): RateRow[] | null => day?.views[view]?.map(([hero, pick, win, ban]) => ({ hero, pick, win, ban })) ?? null;

/** A value with a bar under it, scaled to the largest in the table. The value is always in text; the bar only helps compare. */
function RateBar({ value, max, tone }: { value: number | null; max: number; tone: 'pick' | 'ban' }) {
  return (
    <span className="rt-rate">
      <span className="rt-rate__value">{percent(value)}</span>
      <span className="rt-rate__track" data-tone={tone} aria-hidden="true"><span style={{ width: `${Math.min(100, ((value ?? 0) / max) * 100)}%` }} /></span>
    </span>
  );
}

/** The win rate, with an arrow for how it moved since the day before. Said in words too, for screen readers. */
function WinRate({ value, before, since }: { value: number | null; before: number | null | undefined; since: string | null }) {
  if (value === null || before === null || before === undefined || !since) return <span className="rt-win">{percent(value)}</span>;
  const change = Math.round((value - before) * 10) / 10;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const words = direction === 'same' ? `no change since ${dayText(since)}` : `${direction} ${Math.abs(change)} points since ${dayText(since)}`;
  return (
    <span className="rt-win" data-direction={direction} title={words.charAt(0).toUpperCase() + words.slice(1)}>
      <Icon size={14} aria-hidden="true" />
      {percent(value)}
      <span className="sr-only">, {words}</span>
    </span>
  );
}

function HeroRates({ query, routeKey }: { query: string; routeKey: unknown }) {
  const [filters, setFilters] = useUrlState('#/hub/stats', query, routeKey, (value) => parseRateFilters(value), (value) => serializeRateFilters(value));
  const change = (partial: Partial<RateFilters>) => setFilters((current) => ({ ...current, ...partial }));
  const rates = useAsync<RateRow[]>(async () => {
    const response = await fetch(ratesApiUrl(filters));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseRates(await response.json());
  }, ratesApiUrl(filters));
  const competitive = filters.mode === 'competitive';
  const sort = !competitive && filters.sort === 'ban' ? 'pick' : filters.sort;

  // The daily records cover all maps and all ranks, for every input, mode and region.
  const view = `${filters.platform}/${filters.mode}/${filters.region}`;
  const index = useAsync(loadRatesIndex, 'rates-index');
  const days = filters.map === 'all' && filters.division === 'all' ? index.data?.days ?? [] : [];
  const [day, setDay] = useState('live');
  const shownDay = day !== 'live' && days.includes(day) ? day : null;
  const compareDay = days.find((recorded) => recorded < (shownDay ?? new Date().toISOString().slice(0, 10))) ?? null;
  const snapshot = useAsync(() => (shownDay ? loadRatesDay(shownDay) : Promise.resolve(null)), `rates-day-${shownDay}`);
  const previous = useAsync(() => (compareDay ? loadRatesDay(compareDay) : Promise.resolve(null)), `rates-day-${compareDay}`);
  const shownRows = shownDay ? recordedRows(snapshot.data, view) : rates.data ?? null;
  const before = useMemo(() => new Map((recordedRows(previous.data, view) ?? []).map((row) => [row.hero, row])), [previous.data, view]);
  const since = before.size > 0 ? compareDay : null;

  const rows = useMemo(() => sortRates(shownRows ?? [], sort, filters.role), [shownRows, sort, filters.role]);
  const maxPick = Math.max(1, ...rows.map((row) => row.pick ?? 0));
  const maxBan = Math.max(1, ...rows.map((row) => row.ban ?? 0));
  const heroes = new Map(HEROES.map((hero) => [hero.id, hero]));
  const loading = shownDay ? snapshot.status === 'loading' && !snapshot.data : rates.status === 'loading' && !rates.data;

  return (
    <div className="cx-stats">
      <section className="cx-toolbar" aria-label="Filter hero rates">
        <div className="cx-toolbar__selects">
          <SelectField label="Input" value={filters.platform} onChange={(platform) => change({ platform: platform as RateFilters['platform'] })}>
            <option value="pc">Mouse &amp; Keyboard</option>
            <option value="console">Controller</option>
          </SelectField>
          <SelectField label="Game mode" value={filters.mode} onChange={(mode) => change({ mode: mode as RateFilters['mode'] })}>
            <option value="quickplay">Quick Play, Role Queue</option>
            <option value="competitive">Competitive, Role Queue</option>
          </SelectField>
          <SelectField label="Region" value={filters.region} onChange={(region) => change({ region: region as RateFilters['region'] })}>
            <option value="americas">Americas</option>
            <option value="asia">Asia</option>
            <option value="europe">Europe</option>
          </SelectField>
          <SelectField label="Role" value={filters.role} onChange={(role) => change({ role: role as RateFilters['role'] })}>
            <option value="all">All roles</option>
            {ROLES.map((role) => (
              <optgroup key={role} label={ROLE_LABEL[role]}>
                <option value={role}>All {ROLE_LABEL[role]}</option>
                {SUB_ROLE_GROUPS[role].map((subRole) => <option key={subRole} value={subRole}>{SUB_ROLES[subRole].label}</option>)}
              </optgroup>
            ))}
          </SelectField>
          <SelectField label="Map" value={filters.map} onChange={(map) => change({ map })}>
            <option value="all">All maps</option>
            {RATE_MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}
          </SelectField>
          {competitive && (
            <SelectField label="Rank" value={filters.division} onChange={(division) => change({ division })}>
              <option value="all">All ranks</option>
              {RATE_DIVISIONS.map((division) => <option key={division.id} value={division.id}>{division.label}</option>)}
            </SelectField>
          )}
          {days.length > 0 && (
            <SelectField label="Day" value={shownDay ?? 'live'} onChange={setDay}>
              <option value="live">Live (today)</option>
              {days.map((recorded) => <option key={recorded} value={recorded}>{dayText(recorded)}</option>)}
            </SelectField>
          )}
        </div>
      </section>

      {!shownDay && rates.status === 'error' ? (
        <DataState status="error" error={rates.error} retry={rates.retry} what="hero rates" />
      ) : shownDay && snapshot.status === 'error' ? (
        <DataState status="error" error={snapshot.error} retry={snapshot.retry} what="that day's hero rates" />
      ) : loading ? (
        <GridSkeleton count={6} />
      ) : rows.length === 0 ? (
        <StateBlock icon={<Swords size={24} />} title="No rates for this selection">{shownDay ? 'Nothing was recorded for this combination that day.' : 'Blizzard shows no data for this combination.'}</StateBlock>
      ) : (
        <div className="cx-table-wrap">
          <table className="data-table cx-table cx-rates rt-table">
            <thead>
              <tr>
                <th scope="col" className="num rt-rank">#</th>
                {SORT_LABEL.filter((column) => competitive || column.id !== 'ban').map((column) => (
                  <th key={column.id} scope="col" className={column.id === 'name' ? undefined : 'rt-head'} aria-sort={sort === column.id ? (column.id === 'name' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="cx-rates__sort" onClick={() => change({ sort: column.id })}>{column.label}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, place) => {
                const hero = heroes.get(row.hero);
                return (
                  <tr key={row.hero}>
                    <td className="num rt-rank">{place + 1}</td>
                    <th scope="row">
                      <a className="cx-rates__hero" href={`#/cosmetics?hero=${row.hero}`} title={`${hero?.name ?? row.hero}'s cosmetics`}>
                        {hero && <span className="cx-rates__portrait"><HeroPortrait id={hero.id} name={hero.name} role={hero.role} /></span>}
                        <span>{hero?.name ?? row.hero}</span>
                        {hero && <span className="cx-rates__role" data-role={hero.role}><RoleIcon role={hero.role} size={12} /></span>}
                      </a>
                    </th>
                    <td><RateBar value={row.pick} max={maxPick} tone="pick" /></td>
                    {competitive && <td><RateBar value={row.ban} max={maxBan} tone="ban" /></td>}
                    <td><WinRate value={row.win} before={before.get(row.hero)?.win} since={since} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="cx-credit">
        Blizzard's hero statistics, read through the community-run <a href="https://overfast-api.tekrop.fr/" target="_blank" rel="noreferrer">OverFast API</a>, which keeps a copy for up to an hour.
        {' '}{since ? `Arrows compare the win rate with ${dayText(since)}. ` : ''}
        {index.data?.days.length ? `A copy is kept once a day, for all maps and ranks, from ${dayText(index.data.days[index.data.days.length - 1])}. ` : ''}
        <a href={officialRatesUrl(filters)} target="_blank" rel="noreferrer">See this selection on Blizzard's page <ExternalLink size={11} aria-hidden="true" /></a>
      </p>
    </div>
  );
}

const parseTab = (query: string): Tab => {
  const value = new URLSearchParams(query).get('tab');
  return value === 'collection' || value === 'heroes' ? value : 'catalogue';
};

export function StatsPage({ query, routeKey }: { query: string; routeKey: unknown }) {
  usePageTitle('Stats');
  const tab = parseTab(query);
  const stats = useAsync(loadStats, 'stats');
  const tabHref = (id: Tab) => (id === 'catalogue' ? '#/hub/stats' : `#/hub/stats?tab=${id}`);
  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Hub" title="Stats" intro="Counts from this site's cosmetics database, your own tracked collection, and Blizzard's hero rates. Each is kept separate, and Steam player counts live on the Players page." />
      <nav className="cx-tabs" aria-label="Stats sections">
        {TABS.map(({ id, label, Icon }) => (
          <a key={id} className={cn('cx-tabs__item', tab === id && 'is-active')} href={tabHref(id)} aria-current={tab === id ? 'page' : undefined}>
            <Icon size={15} aria-hidden="true" /> {label}
          </a>
        ))}
      </nav>
      {tab === 'catalogue' && (stats.data ? <CatalogueStats stats={stats.data} /> : <DataState status={stats.status} error={stats.error} retry={stats.retry} what="statistics" />)}
      {tab === 'collection' && <CollectionStats />}
      {tab === 'heroes' && <HeroRates query={query} routeKey={routeKey} />}
      {tab !== 'heroes' && <CatalogueCredits />}
    </div>
  );
}
