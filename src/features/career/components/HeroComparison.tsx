import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import { RoleIcon } from '../../../components/icons';
import { Panel, SelectField } from '../../../components/controls';
import { HeroPortrait } from '../../../components/media';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { StatsSummary } from '../api/types';
import { METRICS, METRIC_BY_ID, heroRows } from '../stats';
import { NoDataBlock } from './states';

const COLLAPSED_ROWS = 10;

/** Rows glide to their new position when the sort changes (FLIP). Skipped when motion is off. */
function useRowGlide(container: React.RefObject<HTMLElement>, trigger: string) {
  const previous = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const motionOff = document.documentElement.dataset.motion === 'off';
    const next = new Map<string, number>();
    element.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
      const id = row.dataset.row as string;
      next.set(id, row.offsetTop);
      const old = previous.current.get(id);
      if (!motionOff && old !== undefined && old !== row.offsetTop && typeof row.animate === 'function') {
        row.animate([{ transform: `translateY(${old - row.offsetTop}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      }
    });
    previous.current = next;
  }, [container, trigger]);
}

export function HeroComparison({ stats, onOpenHero }: { stats?: StatsSummary; onOpenHero: (hero: string) => void }) {
  const [metricId, setMetricId] = useState('time');
  const [ascending, setAscending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isNarrow = useMediaQuery('(max-width: 760px)');
  const list = useRef<HTMLOListElement>(null);
  const metric = METRIC_BY_ID[metricId];

  const rows = useMemo(() => {
    const withValues = heroRows(stats)
      .map((row) => ({ ...row, value: metric.get(row.stats) }))
      .filter((row): row is typeof row & { value: number } => typeof row.value === 'number');
    return withValues.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
  }, [ascending, metric, stats]);

  const max = rows.reduce((highest, row) => Math.max(highest, row.value), 0);
  const shown = isNarrow && !expanded ? rows.slice(0, COLLAPSED_ROWS) : rows;
  useRowGlide(list, `${metricId}-${ascending}-${shown.length}`);

  return (
    <Panel
      className="comparison"
      title="Hero comparison"
      actions={
        <div className="comparison__controls">
          <SelectField label="Compare heroes by" hideLabel value={metricId} onChange={setMetricId}>
            {METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </SelectField>
          <button
            type="button"
            className="icon-button"
            onClick={() => setAscending((value) => !value)}
            aria-label={ascending ? 'Sorted lowest first. Sort highest first.' : 'Sorted highest first. Sort lowest first.'}
          >
            {ascending ? <ArrowUpNarrowWide size={16} aria-hidden="true" /> : <ArrowDownWideNarrow size={16} aria-hidden="true" />}
          </button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <NoDataBlock title="Nothing to compare">No hero has a recorded value for this metric in the current filter.</NoDataBlock>
      ) : (
        <ol className="comparison__list" ref={list}>
          {shown.map((row) => (
            <li key={row.key} data-row={row.key}>
              <button type="button" className="comparison-row" data-role={row.role} onClick={() => onOpenHero(row.key)} aria-label={`${row.name}: ${metric.format(row.value)}. Open hero statistics.`}>
                <HeroPortrait id={row.key} name={row.name} role={row.role} />
                <span className="comparison-row__body">
                  <span className="comparison-row__top">
                    <span className="comparison-row__name">
                      {row.role && <RoleIcon role={row.role} size={11} />}
                      {row.name}
                    </span>
                    <span className="comparison-row__value">{metric.format(row.value)}</span>
                  </span>
                  <span className="comparison-row__track">
                    <span className="comparison-row__bar" style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {isNarrow && rows.length > COLLAPSED_ROWS && (
        <button type="button" className="btn-plain comparison__more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show top 10' : `Show all ${rows.length} heroes`}
        </button>
      )}
    </Panel>
  );
}
