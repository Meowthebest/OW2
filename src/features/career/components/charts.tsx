import { useRef, useState, type ReactNode } from 'react';
import { RoleIcon } from '../../../components/icons';
import { HeroPortrait } from '../../../components/media';
import { ROLES, ROLE_LABEL, type Role } from '../../../data/heroes';
import { formatDuration, formatInt, formatPercent } from '../../../lib/format';
import type { StatsBlock, StatsSummary } from '../api/types';
import type { HeroRow, Metric } from '../stats';

function useHoverCard() {
  const box = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<{ x: number; y: number; content: ReactNode } | null>(null);

  const place = (clientX: number, clientY: number, content: ReactNode) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(rect.width - 120, Math.max(120, clientX - rect.left));
    setCard({ x, y: clientY - rect.top, content });
  };

  const bind = (content: ReactNode) => ({
    onMouseMove: (event: React.MouseEvent) => place(event.clientX, event.clientY, content),
    onMouseLeave: () => setCard(null),
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      place(rect.left + rect.width / 2, rect.top, content);
    },
    onBlur: () => setCard(null),
  });

  const node = card && (
    <div className="hover-card" style={{ left: card.x, top: card.y }} aria-hidden="true">
      {card.content}
    </div>
  );

  return { box, bind, node };
}

/** Part-to-whole bar for time played per role, with a labelled legend so role is never color alone. */
export function RoleShareChart({ stats }: { stats?: StatsSummary }) {
  const { box, bind, node } = useHoverCard();
  const rows = ROLES.map((role) => ({ role, seconds: stats?.roles?.[role]?.time_played ?? 0 }));
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  if (total === 0) return <p className="chart__empty">No role time recorded for this filter.</p>;
  return (
    <div className="chart" ref={box}>
      <div className="share-bar" role="img" aria-label={rows.map((row) => `${ROLE_LABEL[row.role]} ${formatPercent((row.seconds / total) * 100)}`).join(', ')}>
        {rows.filter((row) => row.seconds > 0).map((row) => (
          <span
            key={row.role}
            data-role={row.role}
            style={{ flexGrow: row.seconds }}
            {...bind(<><b>{ROLE_LABEL[row.role]}</b><br />{formatDuration(row.seconds)} · {formatPercent((row.seconds / total) * 100)}</>)}
          />
        ))}
      </div>
      <ul className="chart__legend">
        {rows.map((row) => (
          <li key={row.role} data-role={row.role}>
            <i className="legend-key" />
            <RoleIcon role={row.role} size={13} />
            <span>{ROLE_LABEL[row.role]}</span>
            <b>{formatPercent((row.seconds / total) * 100)}</b>
            <small>{formatDuration(row.seconds)}</small>
          </li>
        ))}
      </ul>
      {node}
    </div>
  );
}

/** Diverging bars: each hero's win rate against this player's own average in the same scope. */
export function WinRateChart({ rows, baseline, onOpenHero }: { rows: HeroRow[]; baseline: number; onOpenHero: (hero: string) => void }) {
  const { box, bind, node } = useHoverCard();
  const plotted = rows.filter((row) => typeof row.stats.winrate === 'number');
  if (plotted.length === 0) return <p className="chart__empty">No win rates recorded for this filter.</p>;
  const extent = Math.max(5, ...plotted.map((row) => Math.abs((row.stats.winrate as number) - baseline)));
  return (
    <div className="chart" ref={box}>
      <div className="chart__legend chart__legend--inline">
        <span data-trend="up"><i className="legend-key" />Above average</span>
        <span data-trend="down"><i className="legend-key" />Below average</span>
        <span className="chart__baseline">Average {formatPercent(baseline)}</span>
      </div>
      <ul className="delta-chart">
        {plotted.map((row) => {
          const rate = row.stats.winrate as number;
          const delta = rate - baseline;
          const width = (Math.abs(delta) / extent) * 50;
          return (
            <li key={row.key}>
              <button
                type="button"
                className="delta-row"
                data-trend={delta >= 0 ? 'up' : 'down'}
                onClick={() => onOpenHero(row.key)}
                aria-label={`${row.name}: ${formatPercent(rate)} win rate over ${formatInt(row.stats.games_played)} games. Open hero statistics.`}
                {...bind(<><b>{row.name}</b><br />{formatPercent(rate)} over {formatInt(row.stats.games_played)} games<br />{formatInt(row.stats.games_won)} won · {formatInt(row.stats.games_lost)} lost</>)}
              >
                <span className="delta-row__hero">
                  <HeroPortrait id={row.key} name={row.name} role={row.role} />
                  <span>{row.name}</span>
                </span>
                <span className="delta-row__plot">
                  <i className="delta-row__zero" />
                  <span className="delta-row__bar" style={delta >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }} />
                </span>
                <span className="delta-row__value">{formatPercent(rate)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {node}
    </div>
  );
}

export interface CompareSeries {
  id: string;
  label: string;
  role?: Role;
  block?: StatsBlock | null;
}

/** Small multiples: each metric gets its own scale, since elims and damage differ by orders of magnitude. */
export function MetricCompareChart({ series, metrics }: { series: CompareSeries[]; metrics: Metric[] }) {
  const present = series.filter((item) => item.block);
  if (present.length === 0) return <p className="chart__empty">No per-10-minute averages recorded for this filter.</p>;
  return (
    <div className="chart">
      <ul className="chart__legend chart__legend--inline">
        {present.map((item) => (
          <li key={item.id} data-role={item.role ?? 'neutral'}>
            <i className="legend-key" />
            {item.role && <RoleIcon role={item.role} size={13} />}
            {item.label}
          </li>
        ))}
      </ul>
      <div className="metric-grid">
        {metrics.map((metric) => {
          const values = present.map((item) => (item.block ? metric.get(item.block) ?? null : null));
          const max = Math.max(0, ...values.map((value) => value ?? 0));
          return (
            <div className="metric-group" key={metric.id}>
              <h4>{metric.label}</h4>
              {present.map((item, index) => {
                const value = values[index];
                return (
                  <div className="metric-line" key={item.id} data-role={item.role ?? 'neutral'}>
                    <span className="metric-line__track">
                      <span className="metric-line__bar" style={{ width: `${max > 0 && value ? (value / max) * 100 : 0}%` }} />
                    </span>
                    <span className="metric-line__value"><span className="sr-only">{item.label}: </span>{metric.format(value)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
