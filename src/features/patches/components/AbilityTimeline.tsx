import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { SelectField } from '../../../components/controls';
import { cn } from '../../../lib/format';
import type { BalanceChange, PatchFile } from '../core/types';
import { formatDifference, formatPatchDate, formatValue, SCOPE_LABEL, signed } from '../format';
import { buildSeries, cumulativeChange, type SeriesPoint, type StatSeries } from '../history';
import { DirectionLabel } from './Direction';

function useElementWidth(fallback: number) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const measure = () => {
      const measured = node.getBoundingClientRect().width;
      if (measured > 0) setWidth(measured);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { box, width };
}

/** Round axis ticks that cover the published values. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const low = min === max ? min - Math.max(1, Math.abs(min) * 0.2) : min;
  const high = min === max ? max + Math.max(1, Math.abs(max) * 0.2) : max;
  const rough = (high - low) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= rough) ?? 10) * magnitude;
  const ticks: number[] = [];
  const start = Math.floor(low / step) * step;
  for (let value = start; value < high + step * 0.999; value += step) ticks.push(Math.round(value * 1000) / 1000);
  return ticks;
}

const DAY = 24 * 60 * 60 * 1000;
const STUB = 14;
const MARGIN = { top: 18, right: 58, bottom: 28, left: 46 };

function markerPath(direction: BalanceChange['direction'], x: number, y: number) {
  const size = 6;
  if (direction === 'buff') return `M${x},${y - size}L${x + size},${y + size * 0.8}L${x - size},${y + size * 0.8}Z`;
  if (direction === 'nerf') return `M${x},${y + size}L${x + size},${y - size * 0.8}L${x - size},${y - size * 0.8}Z`;
  return null;
}

function pointLabel(point: SeriesPoint, unit: string | null) {
  const { change } = point;
  return `${formatPatchDate(point.date, 'short')}: ${formatValue(change.previous as number, unit)} to ${formatValue(change.next as number, unit)}${formatDifference(change) ? `, ${formatDifference(change)}` : ''}`;
}

/**
 * A stat holds its value between patches, so this is a step line. Each step is a published before and after.
 * Where neighbouring values do not connect, the line stops, because the value in between is unknown.
 */
function StepChart({ series }: { series: StatSeries }) {
  const { box, width } = useElementWidth(640);
  const [active, setActive] = useState<number | null>(null);
  const height = 216;
  const { points, unit } = series;
  const plotRight = Math.max(MARGIN.left + 60, width - MARGIN.right);
  const plotBottom = height - MARGIN.bottom;

  const times = points.map((point) => Date.parse(point.date));
  const span = times[times.length - 1] - times[0];
  const pad = Math.max(span * 0.06, 12 * DAY);
  const start = times[0] - pad;
  const end = times[times.length - 1] + pad;
  const x = (time: number) => MARGIN.left + ((time - start) / (end - start)) * (plotRight - MARGIN.left);

  const values = points.flatMap((point) => [point.change.previous as number, point.change.next as number]);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const low = ticks[0];
  const high = ticks[ticks.length - 1];
  const y = (value: number) => plotBottom - ((value - low) / (high - low || 1)) * (plotBottom - MARGIN.top);

  let path = '';
  points.forEach((point, index) => {
    const px = x(times[index]);
    const before = y(point.change.previous as number);
    const after = y(point.change.next as number);
    if (index === 0 || point.continues === false) path += `M${px - STUB},${before}H${px}V${after}`;
    else path += `H${px}V${after}`;
    const next = points[index + 1];
    if (next && next.continues === false) path += `H${px + STUB}`;
  });
  path += `H${plotRight}`;

  const months: Array<{ time: number; label: string }> = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() <= end) {
    months.push({ time: cursor.getTime(), label: cursor.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const every = Math.max(1, Math.ceil((months.length * 36) / Math.max(60, plotRight - MARGIN.left)));

  const nearest = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    let best = 0;
    let distance = Infinity;
    times.forEach((time, index) => {
      const gap = Math.abs(x(time) - px);
      if (gap < distance) {
        distance = gap;
        best = index;
      }
    });
    setActive(best);
  };

  const activePoint = active !== null ? points[active] : null;
  const tipLeft = activePoint ? Math.min(width - 96, Math.max(96, x(times[active as number]))) : 0;

  return (
    <div className="step-chart" ref={box} onPointerMove={(event) => nearest(event.clientX)} onPointerLeave={() => setActive(null)} onPointerDown={(event) => nearest(event.clientX)}>
      <svg width={width} height={height} role="group" aria-label={`Published values of ${series.stat} over time. The table below lists them.`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="step-chart__grid" x1={MARGIN.left} x2={plotRight} y1={y(tick)} y2={y(tick)} />
            <text className="step-chart__tick" x={MARGIN.left - 7} y={y(tick) + 4} textAnchor="end">{formatValue(tick, unit)}</text>
          </g>
        ))}
        {months.map((month, index) => index % every === 0 && (
          <text key={month.time} className="step-chart__tick" x={x(month.time)} y={height - 8} textAnchor="middle">{month.label}</text>
        ))}
        {activePoint && <line className="step-chart__cross" x1={x(times[active as number])} x2={x(times[active as number])} y1={MARGIN.top - 8} y2={plotBottom} />}
        <path className="step-chart__line" d={path} fill="none" />
        {points.map((point, index) => point.continues === false && (
          <text key={`gap-${point.patchId}`} className="step-chart__gap" x={(x(times[index - 1]) + x(times[index])) / 2} y={MARGIN.top + 2} textAnchor="middle">
            gap
            <title>The notes do not connect these two values, so nothing is drawn between them.</title>
          </text>
        ))}
        {points.map((point, index) => {
          const px = x(times[index]);
          const py = y(point.change.next as number);
          const shape = markerPath(point.change.direction, px, py);
          return (
            <g key={point.change.id} className="step-chart__point" data-direction={point.change.direction} tabIndex={0} role="img" aria-label={pointLabel(point, unit)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}>
              <circle cx={px} cy={py} r={16} className="step-chart__hit" />
              {shape ? <path d={shape} className="step-chart__marker" /> : <circle cx={px} cy={py} r={5} className="step-chart__marker" />}
            </g>
          );
        })}
        <text className="step-chart__end" x={plotRight + 7} y={y(points[points.length - 1].change.next as number) + 4}>
          {formatValue(points[points.length - 1].change.next as number, unit)}
        </text>
      </svg>
      {activePoint && (
        <div className="step-chart__tip" style={{ left: tipLeft }} aria-hidden="true">
          <b>{formatValue(activePoint.change.previous as number, unit)} → {formatValue(activePoint.change.next as number, unit)}</b>
          <span>{formatDifference(activePoint.change)}</span>
          <small>{formatPatchDate(activePoint.date, 'short')} · {activePoint.change.direction === 'needs-review' ? 'Needs review' : activePoint.change.direction}</small>
        </div>
      )}
    </div>
  );
}

function seriesOptionLabel(series: StatSeries) {
  const base = series.stat.charAt(0).toUpperCase() + series.stat.slice(1);
  return series.scope === 'standard' ? base : `${base} (${SCOPE_LABEL[series.scope]})`;
}

const abilityKey = (series: StatSeries) => series.ability ?? 'Base stats';

/** Opens on the stat most worth seeing: one from the patch in view, then standard play, then the longest record. */
function preferredSeries(all: StatSeries[], focusPatchId: string | null) {
  const score = (series: StatSeries) => (focusPatchId && series.points.some((point) => point.patchId === focusPatchId) ? 1000 : 0) + (series.scope === 'standard' ? 100 : 0) + series.points.length;
  return [...all].sort((a, b) => score(b) - score(a) || b.points[b.points.length - 1].date.localeCompare(a.points[a.points.length - 1].date))[0] ?? null;
}

/** Browses one hero's published stat history: ability, stat, chart, values and a total where the values connect. */
export function AbilityTimeline({ patches, heroId, heroName, seriesKey, focusPatchId, onSeries }: { patches: PatchFile[]; heroId: string; heroName: string; seriesKey?: string | null; focusPatchId?: string | null; onSeries?: (key: string) => void }) {
  const all = useMemo(() => buildSeries(patches, heroId), [patches, heroId]);
  const preferred = useMemo(() => preferredSeries(all, focusPatchId ?? null), [all, focusPatchId]);
  const [localKey, setLocalKey] = useState<string | null>(seriesKey ?? null);
  const current = all.find((item) => item.key === (seriesKey ?? localKey)) ?? preferred;
  const [fromIndex, setFromIndex] = useState(0);
  const [toIndex, setToIndex] = useState<number | null>(null);

  useEffect(() => {
    setFromIndex(0);
    setToIndex(null);
  }, [current?.key]);

  if (!current) return <p className="patches-note">No published before-and-after values for {heroName} in the stored patches yet.</p>;

  const pick = (key: string) => {
    setLocalKey(key);
    onSeries?.(key);
  };
  const abilities = [...new Set(all.map(abilityKey))].sort((a, b) => a.localeCompare(b));
  const inAbility = all.filter((item) => abilityKey(item) === abilityKey(current));
  const last = current.points.length - 1;
  const rangeEnd = toIndex ?? last;
  const total = cumulativeChange(current, fromIndex, rangeEnd);

  const unmeasured = patches
    .flatMap((patch) =>
      patch.changes
        .filter((change) => change.heroId === heroId && change.series === null && change.kind !== 'fix' && (change.ability ?? 'Base stats') === abilityKey(current))
        .map((change) => ({ change, patch })),
    )
    .sort((a, b) => b.patch.date.localeCompare(a.patch.date));

  return (
    <div className="timeline">
      <div className="timeline__controls">
        <SelectField
          label="Ability"
          value={abilityKey(current)}
          onChange={(name) => {
            const target = all.filter((item) => abilityKey(item) === name).sort((a, b) => b.points.length - a.points.length)[0];
            if (target) pick(target.key);
          }}
        >
          {abilities.map((name) => <option key={name} value={name}>{name}</option>)}
        </SelectField>
        <SelectField label="Stat" value={current.key} onChange={pick}>
          {inAbility.map((item) => <option key={item.key} value={item.key}>{seriesOptionLabel(item)}, {item.points.length} {item.points.length === 1 ? 'change' : 'changes'}</option>)}
        </SelectField>
      </div>

      <h4 className="timeline__title">{heroName} · {abilityKey(current)} · {seriesOptionLabel(current)}</h4>
      <StepChart key={current.key} series={current} />

      {current.points.some((point) => point.continues === false) && (
        <p className="patches-note">A gap means the next published "previous" value differs from the last published "new" value. Something unrecorded happened there, or Blizzard worded it differently, so nothing is drawn or assumed.</p>
      )}

      <div className="timeline__table-wrap">
        <table className="data-table timeline__table">
          <caption className="sr-only">Published values for {current.stat}</caption>
          <thead>
            <tr>
              <th scope="col">Patch</th>
              <th scope="col" className="num">Previous</th>
              <th scope="col" className="num">New</th>
              <th scope="col" className="num">Change</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {[...current.points].reverse().map((point) => (
              <tr key={point.change.id}>
                <th scope="row">
                  <a href={point.sourceUrl} target="_blank" rel="noreferrer" className="timeline__date">
                    {formatPatchDate(point.date, 'short')} <ExternalLink size={12} aria-label="Official patch notes" />
                  </a>
                  {point.continues === false && <small className="timeline__gap-note">Gap before this</small>}
                </th>
                <td className="num">{formatValue(point.change.previous as number, current.unit)}</td>
                <td className="num">{formatValue(point.change.next as number, current.unit)}</td>
                <td className="num">{formatDifference(point.change) ?? 'Not comparable'}</td>
                <td><DirectionLabel direction={point.change.direction} situational={point.change.situational} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current.points.length > 1 && (
        <div className="timeline__total">
          <div className="timeline__controls">
            <SelectField label="From" value={String(fromIndex)} onChange={(value) => setFromIndex(Number(value))}>
              {current.points.map((point, index) => <option key={point.change.id} value={index}>{formatPatchDate(point.date, 'short')}</option>)}
            </SelectField>
            <SelectField label="To" value={String(rangeEnd)} onChange={(value) => setToIndex(Number(value))}>
              {current.points.map((point, index) => <option key={point.change.id} value={index}>{formatPatchDate(point.date, 'short')}</option>)}
            </SelectField>
          </div>
          {total && (
            <p className={cn('timeline__total-text', total.brokenAt && 'is-broken')}>
              {total.brokenAt ? (
                <>No total for this range. The values do not connect at the {formatPatchDate(total.brokenAt, 'short')} patch, and this site does not fill in unknown steps.</>
              ) : (
                <>
                  <b>Cumulative:</b> {formatValue(total.from, total.unit)} to {formatValue(total.to, total.unit)}
                  {total.percent !== null ? <> ({signed(total.percent)}%)</> : null} across {total.patches} published {total.patches === 1 ? 'change' : 'changes'}.
                </>
              )}
            </p>
          )}
        </div>
      )}

      {unmeasured.length > 0 && (
        <details className="timeline__other">
          <summary>{unmeasured.length} other {unmeasured.length === 1 ? 'change' : 'changes'} to {abilityKey(current)} without before-and-after values</summary>
          <ul>
            {unmeasured.map(({ change, patch }) => (
              <li key={change.id}>
                <a href={patch.sourceUrl} target="_blank" rel="noreferrer">{formatPatchDate(patch.date, 'short')}</a>
                <span>{change.note ?? change.summary ?? change.stat ?? 'Wording on Blizzard\'s page'}</span>
                <DirectionLabel direction={change.direction} situational={change.situational} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
