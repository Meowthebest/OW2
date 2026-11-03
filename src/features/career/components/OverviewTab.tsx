import { RoleIcon } from '../../../components/icons';
import { Panel } from '../../../components/controls';
import { HeroPortrait } from '../../../components/media';
import { ROLES, ROLE_LABEL } from '../../../data/heroes';
import { formatDuration, formatDurationShort, formatInt, formatPercent, formatRatio } from '../../../lib/format';
import type { ModeFilter, StatsBlock, StatsSummary } from '../api/types';
import { METRIC_BY_ID, heroRows } from '../stats';
import type { CareerProfile } from '../useCareer';
import { isEmptyStats } from '../useCareer';
import { RoleShareChart } from './charts';
import { HeroComparison } from './HeroComparison';
import { RanksPanel } from './RanksPanel';
import { NoDataBlock, ResourceGate } from './states';

const MODE_NAME: Record<ModeFilter, string> = { all: 'all modes', quickplay: 'Quick Play', competitive: 'Competitive' };

function SummaryPanel({ general, mode }: { general?: StatsBlock | null; mode: ModeFilter }) {
  return (
    <div className="summary">
      <div className="summary__hero">
        <span className="stat__label">Time played</span>
        <strong className="summary__time">{formatDuration(general?.time_played)}</strong>
        <span className="summary__scope">Across {MODE_NAME[mode]}</span>
      </div>
      <dl className="summary__grid">
        <div className="stat"><dt className="stat__label">Games played</dt><dd className="stat__value">{formatInt(general?.games_played)}</dd></div>
        <div className="stat"><dt className="stat__label">Games won</dt><dd className="stat__value">{formatInt(general?.games_won)}</dd></div>
        <div className="stat"><dt className="stat__label">Win rate</dt><dd className="stat__value">{formatPercent(general?.winrate)}</dd></div>
        <div className="stat"><dt className="stat__label">KDA ratio</dt><dd className="stat__value">{formatRatio(general?.kda)}</dd></div>
      </dl>
    </div>
  );
}

/** Pass undefined for a mode that has not loaded or failed: it shows a dash rather than a false 0m. */
function ModeDistribution({ quickplay, competitive }: { quickplay?: StatsSummary; competitive?: StatsSummary }) {
  const seconds = (stats?: StatsSummary) => (stats ? stats.general?.time_played ?? 0 : null);
  const rows = [
    { id: 'quickplay', label: 'Quick Play', seconds: seconds(quickplay) },
    { id: 'competitive', label: 'Competitive', seconds: seconds(competitive) },
  ];
  const known = rows.every((row) => row.seconds !== null);
  const total = rows.reduce((sum, row) => sum + (row.seconds ?? 0), 0);
  return (
    <div className="mode-split">
      {rows.map((row) => {
        const share = known && total > 0 ? ((row.seconds ?? 0) / total) * 100 : null;
        return (
          <div className="mode-split__row" key={row.id} data-mode={row.id}>
            <div className="mode-split__top">
              <span>{row.label}</span>
              <span className="mode-split__values"><b>{formatDuration(row.seconds)}</b> {share !== null && formatPercent(share)}</span>
            </div>
            <div className="meter"><span style={{ width: `${share ?? 0}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function MostPlayed({ stats, onOpenHero }: { stats?: StatsSummary; onOpenHero: (hero: string) => void }) {
  const rows = heroRows(stats).sort((a, b) => (b.stats.time_played ?? 0) - (a.stats.time_played ?? 0)).slice(0, 3);
  const total = stats?.general?.time_played ?? 0;
  if (rows.length === 0) return <NoDataBlock title="No heroes played">Nothing recorded for this filter.</NoDataBlock>;
  return (
    <ol className="most-played">
      {rows.map((row, index) => {
        const share = total > 0 ? ((row.stats.time_played ?? 0) / total) * 100 : 0;
        return (
          <li key={row.key}>
            <button type="button" className="played-card" data-role={row.role} onClick={() => onOpenHero(row.key)} aria-label={`${row.name}, ${formatDuration(row.stats.time_played)} played. Open hero statistics.`}>
              <span className="played-card__ring" style={{ '--share': `${share}%` } as React.CSSProperties} title={`${formatPercent(share)} of time played`}>
                <HeroPortrait id={row.key} name={row.name} role={row.role} eager={index === 0} />
              </span>
              <span className="played-card__name">{row.name}</span>
              <span className="played-card__time">{formatDuration(row.stats.time_played)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const HIGHLIGHT_MIN_GAMES = 10;

const HIGHLIGHTS = [
  { label: 'Best win rate', metric: 'winrate' },
  { label: 'Best KDA', metric: 'kda' },
  { label: 'Most eliminations per 10 min', metric: 'elims10' },
  { label: 'Most damage per 10 min', metric: 'damage10' },
  { label: 'Most healing per 10 min', metric: 'healing10' },
];

function Highlights({ stats, onOpenHero }: { stats?: StatsSummary; onOpenHero: (hero: string) => void }) {
  const qualified = heroRows(stats).filter((row) => (row.stats.games_played ?? 0) >= HIGHLIGHT_MIN_GAMES);
  if (qualified.length === 0) {
    return <NoDataBlock title="No highlights yet">Heroes need at least {HIGHLIGHT_MIN_GAMES} games in this filter to qualify.</NoDataBlock>;
  }
  const items = HIGHLIGHTS.flatMap(({ label, metric: metricId }) => {
    const metric = METRIC_BY_ID[metricId];
    let best: (typeof qualified)[number] | null = null;
    for (const row of qualified) {
      if ((metric.get(row.stats) ?? 0) > (best ? metric.get(best.stats) ?? 0 : 0)) best = row;
    }
    return best ? [{ label, metric, row: best }] : [];
  });
  return (
    <ul className="highlights">
      {items.map(({ label, metric, row }) => (
        <li key={label}>
          <button type="button" className="highlight" data-role={row.role} onClick={() => onOpenHero(row.key)} aria-label={`${label}: ${row.name}, ${metric.format(metric.get(row.stats))}. Open hero statistics.`}>
            <HeroPortrait id={row.key} name={row.name} role={row.role} />
            <span className="highlight__text">
              <span className="stat__label">{label}</span>
              <span className="highlight__name">{row.name}</span>
            </span>
            <span className="highlight__value">{metric.format(metric.get(row.stats))}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RoleTable({ stats }: { stats?: StatsSummary }) {
  return (
    <table className="data-table role-table">
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col" className="num">Time</th>
          <th scope="col" className="num">Won</th>
          <th scope="col" className="num">Win %</th>
        </tr>
      </thead>
      <tbody>
        {ROLES.map((role) => {
          const block = stats?.roles?.[role];
          return (
            <tr key={role} data-role={role}>
              <th scope="row"><span className="role-cell"><RoleIcon role={role} size={14} />{ROLE_LABEL[role]}</span></th>
              <td className="num">{formatDurationShort(block?.time_played)}</td>
              <td className="num">{formatInt(block?.games_won)}</td>
              <td className="num">{formatPercent(block?.winrate)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OverviewTab({ profile, mode, onOpenHero }: { profile: CareerProfile; mode: ModeFilter; onOpenHero: (hero: string) => void }) {
  const { requests, stats } = profile;
  const scoped = stats[mode];
  const scopedRequest = requests[mode];
  const isEmpty = scoped.data !== undefined && isEmptyStats(scoped.data);

  return (
    <div className="overview">
      <div className="overview__col overview__col--left">
        <Panel title="Player summary">
          <ResourceGate entry={scoped} request={scopedRequest} lines={5}>
            {(data) => (isEmptyStats(data) ? <NoDataBlock title={`No ${MODE_NAME[mode]} stats`}>This profile has none recorded for the current filter.</NoDataBlock> : <SummaryPanel general={data.general} mode={mode} />)}
          </ResourceGate>
        </Panel>
        <Panel title="Mode distribution">
          <ResourceGate entry={stats.quickplay} request={requests.quickplay} lines={2}>
            {(quickplay) => <ModeDistribution quickplay={quickplay} competitive={stats.competitive.data} />}
          </ResourceGate>
        </Panel>
        <RanksPanel summary={profile.summary.data} />
      </div>

      <div className="overview__col overview__col--center">
        <Panel title="Most played heroes">
          <ResourceGate entry={scoped} request={scopedRequest} lines={3}>
            {(data) => <MostPlayed stats={data} onOpenHero={onOpenHero} />}
          </ResourceGate>
        </Panel>
        <Panel title="Role statistics">
          <ResourceGate entry={scoped} request={scopedRequest} lines={4}>
            {(data) => (
              <>
                <RoleShareChart stats={data} />
                <RoleTable stats={data} />
              </>
            )}
          </ResourceGate>
        </Panel>
        <Panel title="Highlights" actions={<span className="panel__hint">Heroes with {HIGHLIGHT_MIN_GAMES}+ games</span>}>
          <ResourceGate entry={scoped} request={scopedRequest} lines={4}>
            {(data) => <Highlights stats={data} onOpenHero={onOpenHero} />}
          </ResourceGate>
        </Panel>
        {mode === 'competitive' && !isEmpty && (
          <p className="career-note">Competitive figures cover the last season this player played, as published by Blizzard.</p>
        )}
      </div>

      <div className="overview__col overview__col--right">
        <ResourceGate entry={scoped} request={scopedRequest} lines={8}>
          {(data) => <HeroComparison stats={data} onOpenHero={onOpenHero} />}
        </ResourceGate>
      </div>
    </div>
  );
}
