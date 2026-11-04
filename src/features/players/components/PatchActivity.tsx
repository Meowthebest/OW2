import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { Activity, ChevronDown, TriangleAlert } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { cn, formatDate, formatDateTime, formatInt } from '../../../lib/format';
import type { PatchMeta } from '../../patches/core/types';
import { formatPatchDate } from '../../patches/format';
import { dayStart, movingAverage, patchWindow, SERIES_COLORS, type HourRow } from '../core';
import { loadHourly, useHistory, usePlayerData } from '../data';
import { ChangeValue } from './parts';
import type { ChartMarker } from './PlayerChart';

const PlayerChart = lazy(() => import('./PlayerChart').then((module) => ({ default: module.PlayerChart })));

const DAY = 86400;
const WINDOWS = [1, 3, 7];
const AROUND_DAYS = 10;

function AroundChart({ hours, patch, others }: { hours: HourRow[]; patch: PatchMeta; others: PatchMeta[] }) {
  const released = dayStart(patch.date);
  const rows = useMemo(() => hours.filter(([hour]) => hour >= released - AROUND_DAYS * DAY && hour <= released + (AROUND_DAYS + 1) * DAY), [hours, released]);
  const series = useMemo(() => {
    const x: number[] = [];
    const players: Array<number | null> = [];
    rows.forEach((row, index) => {
      if (index > 0 && row[0] - rows[index - 1][0] > 3 * 3600) {
        x.push(rows[index - 1][0] + 1);
        players.push(null);
      }
      x.push(row[0]);
      players.push(row[2]);
    });
    return { x, players };
  }, [rows]);

  if (rows.length < 2) return <p className="pstat-note">Not enough readings around this patch to draw a chart.</p>;

  const markers: ChartMarker[] = [patch, ...others]
    .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
    .map((item) => ({ id: item.id, time: dayStart(item.date), label: `Patch, ${formatPatchDate(item.date)}`, href: `#/patches?patch=${item.id}` }));

  return (
    <Suspense fallback={<div className="pstat-chart-skeleton skeleton" aria-hidden="true"><span /></div>}>
      <PlayerChart
        x={series.x}
        series={[
          { label: 'Players, hourly average', color: SERIES_COLORS.players, values: series.players, fill: true },
          { label: '24-hour average', color: SERIES_COLORS.average, values: movingAverage(series.x, series.players, DAY, 3600) },
        ]}
        start={rows[0][0]}
        end={rows[rows.length - 1][0]}
        markers={markers}
        height={260}
        minSpan={6 * 3600}
        label={`Steam concurrent players around the patch of ${formatPatchDate(patch.date)}. The table below compares the days before and after.`}
      />
    </Suspense>
  );
}

function ActivityBody({ patch, others }: { patch: PatchMeta; others: PatchMeta[] }) {
  const { latest, status } = usePlayerData();
  const version = latest ? latest.current.at.slice(0, 13) : null;
  const hourly = useHistory(loadHourly, version);
  const now = latest ? Date.parse(latest.current.at) / 1000 : 0;
  const results = useMemo(() => (hourly.data ? WINDOWS.map((days) => patchWindow(patch.date, hourly.data as HourRow[], days, now)) : []), [hourly.data, patch.date, now]);

  if (status === 'loading' && !latest) return <div className="skeleton" aria-hidden="true"><span /><span /></div>;
  if (!latest) {
    return <p className="pstat-note">{status === 'empty' ? 'Player recording has not started yet.' : 'Player data could not be loaded.'}</p>;
  }
  if (hourly.status === 'error' && !hourly.data) {
    return <StateBlock tone="error" icon={<TriangleAlert size={20} />} title="Could not load player history" actions={<button type="button" className="btn-plain" onClick={hourly.retry}>Try again</button>} />;
  }
  if (!hourly.data) return <div className="skeleton" aria-hidden="true"><span /><span /></div>;

  const trackingSince = Date.parse(latest.trackingSince);
  const released = dayStart(patch.date);
  const anyRows = hourly.data.some(([hour]) => hour >= released - AROUND_DAYS * DAY && hour <= released + (AROUND_DAYS + 1) * DAY);

  if (!anyRows) {
    return (
      <p className="pstat-note">
        No player readings exist around this patch. Recording began {formatDateTime(trackingSince)}{released * 1000 < trackingSince ? ', after this patch was released' : ''}, and Steam's API has no history to fill that in.
      </p>
    );
  }

  return (
    <>
      <AroundChart hours={hourly.data} patch={patch} others={others} />
      <div className="pstat-table-wrap">
        <table className="data-table pstat-table">
          <caption className="sr-only">Sampled Steam players before and after this patch</caption>
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col" className="num">Average before</th>
              <th scope="col" className="num">Average after</th>
              <th scope="col" className="num">Difference</th>
              <th scope="col" className="num">Peak before</th>
              <th scope="col" className="num">Peak after</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.days}>
                <th scope="row">{result.days} {result.days === 1 ? 'day' : 'days'}</th>
                <td className="num">{result.before ? formatInt(result.before.average) : 'No data'}</td>
                <td className="num">{result.after ? formatInt(result.after.average) : 'No data'}</td>
                <td className="num">{result.averageChange !== null ? <ChangeValue percent={result.averageChange} /> : 'Not comparable'}</td>
                <td className="num">{result.before ? formatInt(result.before.peak) : 'No data'}</td>
                <td className="num">{result.after ? formatInt(result.after.peak) : 'No data'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pstat-note">
        Steam players only, from recorded readings since {formatDate(trackingSince)}. Each side needs at least 60% of its hours recorded. The release day is left out, because only the date of a patch is recorded and not the hour. Counts also move with events, weekends and time of day, so this does not show that the patch caused a change.
        {' '}<a href="#/players?range=90d">See the full player statistics</a>.
      </p>
    </>
  );
}

/** Collapsed by default, and it loads nothing until opened. */
export function PatchActivity({ patch, others }: { patch: PatchMeta; others: PatchMeta[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="pstat-activity">
      <button type="button" className="pstat-activity__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <Activity size={17} aria-hidden="true" />
        <span>Player activity around this patch</span>
        <span className="pstat-only">Steam only</span>
        <ChevronDown size={16} aria-hidden="true" className={cn('pstat-activity__chevron', open && 'is-open')} />
      </button>
      <div className="pstat-activity__body" id={id} hidden={!open}>
        {open && <ActivityBody patch={patch} others={others} />}
      </div>
    </section>
  );
}
