import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, CalendarDays, Clock, ExternalLink, FileSearch, History, Radio, RefreshCw, TrendingUp, TriangleAlert, Trophy } from 'lucide-react';
import { StateBlock } from '../../components/controls';
import { cn, formatDate, formatDateTime, formatInt, formatRelative } from '../../lib/format';
import type { PlayersRoute } from '../../lib/router';
import type { PatchIndex, PatchMeta } from '../patches/core/types';
import { loadIndex, useAsync } from '../patches/data';
import { formatPatchDate } from '../patches/format';
import type { ChartMarker, ChartSeries } from './components/PlayerChart';
import { AnimatedNumber, ChangeValue, InfoTip } from './components/parts';
import {
  buildFrame,
  comparePeriodFor,
  comparePeriods,
  freshness,
  movingAverage,
  parseOptions,
  patchWindow,
  previousPeriod,
  RANGES,
  rangeInfo,
  SERIES_COLORS,
  serializeOptions,
  tableRows,
  type HourRow,
  type LatestFile,
  type PeriodComparison,
  type PlayerOptions,
  type RangeKey,
  type Sample,
} from './core';
import { loadHourly, loadRecent, refreshPlayers, useHistory, useNow, usePlayerData } from './data';

const PlayerChart = lazy(() => import('./components/PlayerChart').then((module) => ({ default: module.PlayerChart })));

const DEFAULT_TITLE = 'OW2 Hero Selector: Random Hero Picker & Career Stats';
const DAY = 86400;
const TABLE_PAGE = 30;

/** Patches that changed gameplay, which are the ones worth marking on a player chart. */
export function chartPatches(index: PatchIndex | undefined): PatchMeta[] {
  return (index?.patches ?? []).filter((patch) => patch.type === 'season' || patch.counts.gameplayChanges > 0 || patch.counts.stadiumChanges > 0);
}

export function patchMarkers(patches: PatchMeta[]): ChartMarker[] {
  return patches.map((patch) => ({ id: patch.id, time: Date.parse(`${patch.date}T00:00:00Z`) / 1000, label: `Patch, ${formatPatchDate(patch.date)}`, href: `#/patches?patch=${patch.id}` }));
}

function StatCard({ icon, label, tip, value, note, tone, children }: { icon: ReactNode; label: string; tip: ReactNode; value: ReactNode; note: ReactNode; tone?: 'waiting'; children?: ReactNode }) {
  return (
    <div className={cn('pstat-card', tone === 'waiting' && 'is-waiting')}>
      <div className="pstat-card__head">
        <span className="pstat-card__icon" aria-hidden="true">{icon}</span>
        <span className="pstat-card__label">{label}</span>
        <InfoTip label={label}>{tip}</InfoTip>
      </div>
      <div className="pstat-card__value">{value}</div>
      <div className="pstat-card__note">{note}</div>
      {children}
    </div>
  );
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className="pstat-progress">
      <span className="pstat-progress__track" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </span>
    </span>
  );
}

function StatCards({ latest, stale, now }: { latest: LatestFile; stale: boolean; now: number }) {
  const { peak24h, change24h, average30d, peakRecorded, coverage } = latest.stats;
  const updatedAt = Date.parse(latest.current.at);
  const since = formatDate(Date.parse(latest.trackingSince));
  return (
    <div className="pstat-cards">
      <StatCard
        icon={<Radio size={17} />}
        label="Playing Now"
        tip="The concurrent player count from Steam's official API at the time of the last reading. It counts Steam players only."
        value={<AnimatedNumber value={latest.current.players} />}
        note={stale ? <span className="pstat-stale"><TriangleAlert size={13} aria-hidden="true" /> Last valid count</span> : <span className="pstat-live"><span className="pstat-live__dot" aria-hidden="true" /> Steam players right now</span>}
      />
      <StatCard
        icon={<TrendingUp size={17} />}
        label="24-Hour Peak"
        tip="The highest count recorded in the last 24 hours. It stays blank until at least 20 of those hours have a reading, so a partial day isn't presented as a full one."
        tone={peak24h ? undefined : 'waiting'}
        value={peak24h ? <AnimatedNumber value={peak24h.players} /> : 'Collecting'}
        note={peak24h ? `At ${new Date(peak24h.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : `${coverage.hoursOf24} of the last 24 hours recorded`}
      >
        {!peak24h && <Progress value={coverage.hoursOf24} max={24} label="Hours recorded out of 24" />}
      </StatCard>
      <StatCard
        icon={<Trophy size={17} />}
        label="Recorded Peak"
        tip={`The highest count this site has recorded since ${since}. Steam's API only reports the current count, so Overwatch's true all-time Steam peak may be higher.`}
        value={<AnimatedNumber value={peakRecorded.players} />}
        note={`${formatDate(Date.parse(peakRecorded.at))}, since recording began`}
      />
      <StatCard
        icon={<Activity size={17} />}
        label="24-Hour Change"
        tip="The current count compared with the reading closest to exactly 24 hours ago. It stays blank until a reading within 30 minutes of that time exists."
        tone={change24h ? undefined : 'waiting'}
        value={change24h ? <ChangeValue percent={change24h.percent} /> : 'Collecting'}
        note={change24h ? `vs ${formatInt(change24h.comparedTo.players)} 24 hours ago` : 'Needs a reading from 24 hours ago'}
      />
      <StatCard
        icon={<CalendarDays size={17} />}
        label="30-Day Average"
        tip="The average of hourly averages across the last 30 days. It stays blank until recording has run for 30 days and at least 80% of those hours have a reading."
        tone={average30d ? undefined : 'waiting'}
        value={average30d ? <AnimatedNumber value={average30d.players} /> : 'Collecting'}
        note={average30d ? `From ${formatInt(average30d.hours)} recorded hours` : `Day ${Math.min(30, Math.max(1, Math.ceil(coverage.daysTracked)))} of 30`}
      >
        {!average30d && <Progress value={coverage.daysTracked} max={30} label="Days recorded out of 30" />}
      </StatCard>
      <StatCard
        icon={<Clock size={17} />}
        label="Last Updated"
        tip="When Steam produced the last valid count. Steam publishes a new count about every 15 minutes, and this site checks for one every five. The data is marked stale after 45 minutes or a failed read."
        value={<span className="pstat-card__text">{formatRelative(updatedAt, now)}</span>}
        note={formatDateTime(updatedAt)}
      />
    </div>
  );
}

function ComparisonTile({ title, comparison, needs }: { title: string; comparison: PeriodComparison | null; needs: string }) {
  return (
    <div className="pstat-compare">
      <h3 className="pstat-compare__title">{title}</h3>
      {comparison ? (
        <dl className="pstat-compare__grid">
          <div>
            <dt>Average</dt>
            <dd>{formatInt(comparison.current.average)}</dd>
            <dd className="pstat-compare__was">was {formatInt(comparison.previous.average)}</dd>
            {comparison.averageChange !== null && <dd><ChangeValue percent={comparison.averageChange} /></dd>}
          </div>
          <div>
            <dt>Peak</dt>
            <dd>{formatInt(comparison.current.peak)}</dd>
            <dd className="pstat-compare__was">was {formatInt(comparison.previous.peak)}</dd>
            {comparison.peakChange !== null && <dd><ChangeValue percent={comparison.peakChange} /></dd>}
          </div>
        </dl>
      ) : (
        <p className="pstat-note">{needs}</p>
      )}
    </div>
  );
}

function PatchList({ patches, hours, now, from, to }: { patches: PatchMeta[]; hours: HourRow[] | null; now: number; from: number; to: number }) {
  const inView = patches.filter((patch) => {
    const time = Date.parse(`${patch.date}T00:00:00Z`) / 1000;
    return time + DAY >= from && time <= to;
  });
  if (inView.length === 0) {
    return <p className="pstat-note">No gameplay patches fall in the part of the chart shown. Patches released before recording began have no player readings around them.</p>;
  }
  return (
    <div className="pstat-table-wrap">
      <table className="data-table pstat-table">
        <caption className="sr-only">Average Steam players in the three days around each patch</caption>
        <thead>
          <tr>
            <th scope="col">Patch</th>
            <th scope="col" className="num">3 days before</th>
            <th scope="col" className="num">3 days after</th>
            <th scope="col" className="num">Difference</th>
          </tr>
        </thead>
        <tbody>
          {inView.map((patch) => {
            const result = hours ? patchWindow(patch.date, hours, 3, now) : null;
            return (
              <tr key={patch.id}>
                <th scope="row"><a className="pstat-table__link" href={`#/patches?patch=${patch.id}`}>{formatPatchDate(patch.date, 'short')}</a></th>
                <td className="num">{result?.before ? formatInt(result.before.average) : 'No data'}</td>
                <td className="num">{result?.after ? formatInt(result.after.average) : 'No data'}</td>
                <td className="num">{result?.averageChange !== null && result?.averageChange !== undefined ? <ChangeValue percent={result.averageChange} /> : 'Not comparable'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DataTable({ hours, from, to }: { hours: HourRow[]; from: number; to: number }) {
  const [visible, setVisible] = useState(TABLE_PAGE);
  const { unit, rows } = useMemo(() => tableRows(hours, from, to), [hours, from, to]);
  const format = (time: number) => (unit === 'hour'
    ? new Date(time * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
    : new Date(time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }));
  return (
    <details className="pstat-details">
      <summary>View these values as a table</summary>
      {rows.length === 0 ? <p className="pstat-note">No recorded hours in this view.</p> : (
        <>
          <div className="pstat-table-wrap">
            <table className="data-table pstat-table">
              <caption className="sr-only">Recorded Steam players by {unit}</caption>
              <thead>
                <tr>
                  <th scope="col">{unit === 'hour' ? 'Hour' : 'Day (UTC)'}</th>
                  <th scope="col" className="num">Average</th>
                  <th scope="col" className="num">Low</th>
                  <th scope="col" className="num">High</th>
                  <th scope="col" className="num">Readings</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, visible).map((row) => (
                  <tr key={row.time}>
                    <th scope="row">{format(row.time)}</th>
                    <td className="num">{formatInt(row.average)}</td>
                    <td className="num">{formatInt(row.low)}</td>
                    <td className="num">{formatInt(row.high)}</td>
                    <td className="num">{formatInt(row.readings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible < rows.length && <button type="button" className="btn-plain pstat-more" onClick={() => setVisible((value) => value + TABLE_PAGE)}>Show more</button>}
        </>
      )}
    </details>
  );
}

function Legend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="pstat-legend">
      {series.map((item) => (
        <li key={item.label}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</li>
      ))}
    </ul>
  );
}

function ChartSection({ latest, options, update, patches, hours, hoursStatus }: { latest: LatestFile; options: PlayerOptions; update: (partial: Partial<PlayerOptions>) => void; patches: PatchMeta[]; hours: HourRow[] | null; hoursStatus: string }) {
  const info = rangeInfo(options.range);
  const version = latest.current.at;
  const recent = useHistory(loadRecent, version, info.resolution === 'raw');
  const now = Date.parse(version) / 1000;
  const samples: Sample[] | null = recent.data;
  const period = comparePeriodFor(options.range);
  // A week compared with the week before uses hourly rows on both sides, so the two lines share one time grid.
  const forceHourly = options.compare && period === 7 * DAY;
  const frame = useMemo(() => buildFrame(options.range, { samples, hours }, now, { forceHourly }), [options.range, samples, hours, now, forceHourly]);
  const [view, setView] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => setView(null), [options.range]);

  // Steam publishes about every 15 minutes, so that is the spacing of raw readings.
  const stepSeconds = frame?.resolution === 'raw' ? 900 : frame?.resolution === 'daily' ? DAY : 3600;
  const series = useMemo<ChartSeries[]>(() => {
    if (!frame) return [];
    const name = frame.resolution === 'raw' ? 'Players' : frame.resolution === 'daily' ? 'Players, daily average' : 'Players, hourly average';
    const list: ChartSeries[] = [{ label: name, color: SERIES_COLORS.players, values: frame.players, fill: frame.resolution !== 'daily' }];
    if (options.average) {
      list.push({ label: info.averageLabel, color: SERIES_COLORS.average, values: movingAverage(frame.x, frame.players, info.averageSeconds, stepSeconds) });
    }
    if (options.compare && period) {
      const source: Array<[number, number]> = period === DAY ? (samples ?? []) : (hours ?? []).map((row) => [row[0], row[2]]);
      list.push({ label: period === DAY ? 'Same time a day earlier' : 'Same time a week earlier', color: SERIES_COLORS.previous, values: previousPeriod(frame.x, frame.players, period, source, period === DAY ? 15 * 60 : 3600) });
    }
    return list;
  }, [frame, options.average, options.compare, period, samples, hours, info, stepSeconds]);

  const empty = (values: Array<number | null> | undefined) => !values || values.every((value) => value === null);
  const averageEmpty = options.average && empty(series.find((item) => item.label === info.averageLabel)?.values);
  const compareEmpty = options.compare && period !== null && series.length > 0 && empty(series[series.length - 1]?.values);

  const markers = useMemo(() => (options.patches ? patchMarkers(patches) : []), [options.patches, patches]);
  const trackingSince = Date.parse(latest.trackingSince) / 1000;
  const from = view?.from ?? frame?.start ?? now - (info.seconds ?? DAY);
  const to = view?.to ?? frame?.end ?? now;
  const loading = (info.resolution === 'raw' ? recent.status : hoursStatus) === 'loading';
  const failed = (info.resolution === 'raw' ? recent.status : hoursStatus) === 'error';
  const readings = frame?.points ?? 0;

  return (
    <section className="pstat-panel" aria-labelledby="pstat-chart-title">
      <header className="pstat-panel__head">
        <div>
          <h2 className="pstat-panel__title" id="pstat-chart-title">Concurrent players</h2>
          <p className="pstat-panel__sub">Steam players only, {info.label.toLowerCase()}, {frame?.resolution === 'daily' ? 'daily averages with each day\'s low and high shaded' : frame?.resolution === 'hourly' ? 'hourly averages' : 'every reading'}</p>
        </div>
      </header>

      <div className="pstat-controls">
        <div className="pstat-chips" role="group" aria-label="Time range">
          {RANGES.map((range) => (
            <button key={range.key} type="button" className={cn('pstat-chip', options.range === range.key && 'is-active')} aria-pressed={options.range === range.key} aria-label={range.label} title={range.label} onClick={() => update({ range: range.key as RangeKey })}>
              {range.short}
            </button>
          ))}
        </div>
        <div className="pstat-toggles">
          <label className="pstat-toggle"><input type="checkbox" checked={options.average} onChange={(event) => update({ average: event.target.checked })} /> Moving average</label>
          <label className={cn('pstat-toggle', !period && 'is-disabled')}><input type="checkbox" checked={options.compare && period !== null} disabled={!period} onChange={(event) => update({ compare: event.target.checked })} /> {period === 7 * DAY ? 'Compare previous week' : period === DAY ? 'Compare previous day' : 'Compare (24H or 7D)'}</label>
          <label className="pstat-toggle"><input type="checkbox" checked={options.patches} onChange={(event) => update({ patches: event.target.checked })} /> Patch markers</label>
        </div>
      </div>

      {failed && !frame && (
        <StateBlock tone="error" title="Could not load the player history" actions={<button type="button" className="btn-plain" onClick={recent.retry}>Try again</button>}>
          The stored readings did not load. The cards above still show the last valid count.
        </StateBlock>
      )}
      {loading && !frame && <div className="pstat-chart-skeleton skeleton" aria-hidden="true"><span /></div>}
      {!loading && !failed && !frame && <StateBlock icon={<FileSearch size={22} />} title="No readings in this range yet">Recording began {formatDateTime(trackingSince * 1000)}.</StateBlock>}

      {frame && (
        <div className={cn('pstat-chart-wrap', loading && 'is-refreshing')}>
          <Legend series={series} />
          {readings < 2 ? (
            <p className="pstat-note">There is one reading so far, {formatInt(frame.players.find((value) => value !== null) ?? 0)} players. The line starts with the next one.</p>
          ) : (
            <Suspense fallback={<div className="pstat-chart-skeleton skeleton" aria-hidden="true"><span /></div>}>
              <PlayerChart
                x={frame.x}
                series={series}
                low={frame.low}
                high={frame.high}
                start={frame.start}
                end={frame.end}
                markers={markers}
                band={frame.resolution === 'daily'}
                rowName={frame.resolution === 'daily' ? 'Day' : 'Hour'}
                minSpan={frame.resolution === 'daily' ? 5 * DAY : frame.resolution === 'hourly' ? 6 * 3600 : 1800}
                label={`Steam concurrent players, ${info.label.toLowerCase()}. ${readings} data points. Use the table below for exact values.`}
                onView={(viewFrom, viewTo) => setView({ from: viewFrom, to: viewTo })}
              />
            </Suspense>
          )}
          {frame.shorterThanRange && (
            <p className="pstat-note pstat-note--inline"><History size={14} aria-hidden="true" /> Recording began {formatDateTime(trackingSince * 1000)}, so this shows less than the {info.label.toLowerCase()}. Nothing before then is recorded here.</p>
          )}
          {averageEmpty && <p className="pstat-note">The {info.averageLabel.toLowerCase()} starts once that much has been recorded.</p>}
          {compareEmpty && <p className="pstat-note">No readings exist yet for the earlier period.</p>}
        </div>
      )}

      {hours && <DataTable hours={hours} from={from} to={to} />}

      <div className="pstat-subsection">
        <h3 className="pstat-subsection__title">Patches in this view</h3>
        <PatchList patches={patches} hours={hours} now={now} from={from} to={to} />
        <p className="pstat-note">Player counts rise and fall for many reasons, including events, seasons, weekends and time of day. These figures show what was sampled around a patch, not that the patch caused any change.</p>
      </div>
    </section>
  );
}

export function PlayersPage({ route }: { route: PlayersRoute }) {
  const data = usePlayerData();
  const { latest, status, checkFailed } = data;
  const now = useNow();
  const [options, setOptions] = useState(() => parseOptions(route.query));
  const written = useRef(route.query);
  const patchIndex = useAsync(loadIndex, 'index');
  const patches = useMemo(() => chartPatches(patchIndex.data), [patchIndex.data]);
  const hourVersion = latest ? latest.current.at.slice(0, 13) : null;
  const hourly = useHistory(loadHourly, hourVersion);
  const hours = hourly.data;

  useEffect(() => {
    document.title = 'Overwatch Player Statistics | OW2 Hero Selector';
    window.scrollTo({ top: 0 });
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    if (route.query === written.current) return;
    written.current = route.query;
    setOptions(parseOptions(route.query));
  }, [route]);

  const update = (partial: Partial<PlayerOptions>) => {
    const next = { ...options, ...partial };
    setOptions(next);
    const query = serializeOptions(next);
    written.current = query;
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/players${query ? `?${query}` : ''}`);
    } catch {
      // Browsers limit how often the URL can change. The view still updates.
    }
  };

  // Measured from the last reading, so stale data compares with its own time rather than with now.
  const nowSeconds = latest ? Date.parse(latest.current.at) / 1000 : 0;
  const day = useMemo(() => (hours ? comparePeriods(hours, nowSeconds, DAY) : null), [hours, nowSeconds]);
  const week = useMemo(() => (hours ? comparePeriods(hours, nowSeconds, 7 * DAY) : null), [hours, nowSeconds]);

  const fresh = latest ? freshness(latest, now) : null;
  const stale = Boolean(fresh?.stale) || checkFailed;

  return (
    <div className="page pstat-page">
      <header className="pstat-head">
        <div className="pstat-head__titles">
          <span className="eyebrow">Steam player activity</span>
          <h1 className="pstat-head__title">Overwatch player statistics</h1>
        </div>
        <span className="pstat-only">Steam players only</span>
        <p className="pstat-head__note">These counts come from Steam. They don't include players on Battle.net or consoles, so they aren't Overwatch's total population.</p>
      </header>

      {status === 'loading' && !latest && (
        <div className="pstat-cards" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="pstat-card"><div className="skeleton"><span /><span /></div></div>)}
        </div>
      )}

      {status === 'empty' && !latest && (
        <StateBlock icon={<History size={22} />} title="Recording has not started yet">
          The first reading appears here after the scheduled job runs. Until then there is nothing to show, and nothing is estimated in its place.
        </StateBlock>
      )}

      {status === 'error' && !latest && (
        <StateBlock tone="error" icon={<TriangleAlert size={22} />} title="Could not load player data" actions={<button type="button" className="btn-plain" onClick={() => void refreshPlayers()}><RefreshCw size={14} aria-hidden="true" /> Try again</button>}>
          The stored readings did not load. Check your connection and try again.
        </StateBlock>
      )}

      {latest && (
        <>
          {stale && (
            <div className="pstat-banner" role="status">
              <TriangleAlert size={16} aria-hidden="true" />
              <p>
                <b>Stale data.</b>{' '}
                {checkFailed ? 'The newest readings could not be loaded. ' : fresh?.reason === 'failed' ? "The last attempt to read Steam failed. " : 'No new reading has arrived recently. '}
                This is the last valid count, from {formatDateTime(Date.parse(latest.current.at))}.
              </p>
            </div>
          )}

          <StatCards latest={latest} stale={stale} now={now} />

          <ChartSection latest={latest} options={options} update={update} patches={patches} hours={hours} hoursStatus={hourly.status} />

          <section className="pstat-panel" aria-labelledby="pstat-compare-title">
            <header className="pstat-panel__head">
              <div>
                <h2 className="pstat-panel__title" id="pstat-compare-title">Daily and weekly comparison</h2>
                <p className="pstat-panel__sub">Recorded hours only. Each side needs at least 80% of its hours.</p>
              </div>
            </header>
            <div className="pstat-compares">
              <ComparisonTile title="Last 24 hours vs the 24 hours before" comparison={day} needs="Available after 48 hours of recording." />
              <ComparisonTile title="Last 7 days vs the 7 days before" comparison={week} needs="Available after 14 days of recording." />
            </div>
          </section>

          <details className="pstat-details pstat-about">
            <summary><FileSearch size={16} aria-hidden="true" /> How this data is collected</summary>
            <ul>
              <li>A scheduled job reads <a href="https://partner.steamgames.com/doc/webapi/ISteamUserStats" target="_blank" rel="noreferrer">Steam's GetNumberOfCurrentPlayers API</a> and stores each reading with its time. Visitors only read the stored files, so they never add requests to Steam.</li>
              <li>Recording began {formatDateTime(Date.parse(latest.trackingSince))}, and {formatInt(latest.readings)} readings have been stored so far. Nothing earlier is shown, because Steam's API has no history and no other source has given permission to use theirs.</li>
              <li>This site checks every five minutes, but Steam only publishes a new count about every 15, so that is the spacing between readings. The scheduler can also run late or skip a run. The chart breaks its line across long gaps rather than guessing what happened in them.</li>
              <li>For longer records, see <a href="https://steamdb.info/app/2357570/charts/" target="_blank" rel="noreferrer">SteamDB <ExternalLink size={12} aria-hidden="true" /></a> and <a href="https://steamcharts.com/app/2357570" target="_blank" rel="noreferrer">Steam Charts <ExternalLink size={12} aria-hidden="true" /></a>. Their figures can differ, because they sample at other times.</li>
              <li>Steam data is provided as is, with no warranty. This site is not affiliated with or endorsed by Valve or Steam.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
