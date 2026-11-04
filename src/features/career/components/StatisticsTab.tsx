import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { RoleIcon } from '../../../components/icons';
import { Panel, SelectField, Segmented } from '../../../components/controls';
import { HeroPortrait } from '../../../components/media';
import { HERO_BY_ID, ROLES, ROLE_LABEL, type Role } from '../../../data/heroes';
import { formatCompact, formatDuration, formatInt, formatPercent, formatRatio } from '../../../lib/format';
import type { CareerRequest } from '../api/requests';
import type { CareerStats, GameMode, ModeFilter, PlatformFilter, StatsBlock, StatsSummary } from '../api/types';
import { METRIC_BY_ID, categoryLabel, formatStat, heroName, heroRows, sortCategories, statLabel, type HeroRow, type Metric } from '../stats';
import { isEmptyStats, useResource, type CareerProfile } from '../useCareer';
import { MetricCompareChart, RoleShareChart, WinRateChart, type CompareSeries } from './charts';
import { NoDataBlock, ResourceGate } from './states';
import { SortableTable, type Column, type ColumnGroup } from './SortableTable';

type RoleView = 'all' | Role;

const TABLE_GROUPS: ColumnGroup[] = [
  { id: 'overview', label: 'Overview', columns: ['time', 'games', 'wins', 'losses', 'winrate', 'kda'] },
  { id: 'per10', label: 'Per 10 minutes', columns: ['elims10', 'deaths10', 'assists10', 'damage10', 'healing10'] },
  { id: 'totals', label: 'Totals', columns: ['elims', 'deaths', 'assists', 'damage', 'healing'] },
];

const WIDE_GROUPS: ColumnGroup[] = [
  { id: 'core', label: 'Results and per 10 minutes', columns: ['time', 'games', 'wins', 'losses', 'winrate', 'kda', 'elims10', 'deaths10', 'assists10', 'damage10', 'healing10'] },
  { id: 'totals', label: 'Totals', columns: ['time', 'games', 'elims', 'deaths', 'assists', 'damage', 'healing'] },
];

const PHONE_GROUPS: ColumnGroup[] = [
  { id: 'overview', label: 'Time, games, win rate, KDA', columns: ['time', 'games', 'winrate', 'kda'] },
  { id: 'record', label: 'Games won and lost', columns: ['games', 'wins', 'losses'] },
  { id: 'combat10', label: 'Elims, deaths, assists per 10 min', columns: ['elims10', 'deaths10', 'assists10'] },
  { id: 'output10', label: 'Damage and healing per 10 min', columns: ['damage10', 'healing10'] },
  { id: 'combat', label: 'Total elims, deaths, assists', columns: ['elims', 'deaths', 'assists'] },
  { id: 'output', label: 'Total damage and healing', columns: ['damage', 'healing'] },
];

const metricColumns = (ids: string[]): Column<{ stats: StatsBlock }>[] =>
  ids.map((id) => {
    const metric = METRIC_BY_ID[id];
    return { id, label: metric.short, title: metric.label, value: (row) => metric.get(row.stats), render: (row) => metric.format(metric.get(row.stats)) };
  });

const STAT_COLUMNS = metricColumns(TABLE_GROUPS.flatMap((group) => group.columns));

const COMPARE_METRICS: Metric[] = ['elims10', 'deaths10', 'assists10', 'damage10', 'healing10'].map((id) => METRIC_BY_ID[id]);

function KpiStrip({ block }: { block?: StatsBlock | null }) {
  const items: Array<[string, string]> = [
    ['Time played', formatDuration(block?.time_played)],
    ['Games played', formatInt(block?.games_played)],
    ['Won', formatInt(block?.games_won)],
    ['Lost', formatInt(block?.games_lost)],
    ['Win rate', formatPercent(block?.winrate)],
    ['KDA', formatRatio(block?.kda)],
    ['Eliminations', formatCompact(block?.total?.eliminations)],
    ['Deaths', formatCompact(block?.total?.deaths)],
    ['Assists', formatCompact(block?.total?.assists)],
    ['Damage', formatCompact(block?.total?.damage)],
    ['Healing', formatCompact(block?.total?.healing)],
  ];
  return (
    <dl className="kpi-strip">
      {items.map(([label, value]) => (
        <div className="stat" key={label}>
          <dt className="stat__label">{label}</dt>
          <dd className="stat__value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HeroTable({ rows, activeHero, onOpenHero }: { rows: HeroRow[]; activeHero?: string; onOpenHero: (hero: string) => void }) {
  const columns = useMemo<Column<HeroRow>[]>(
    () => [
      {
        id: 'hero',
        label: 'Hero',
        text: true,
        pinned: true,
        value: (row) => row.name,
        render: (row) => (
          <button type="button" className="hero-cell" onClick={() => onOpenHero(row.key)} aria-label={`Show ${row.name} statistics`}>
            <HeroPortrait id={row.key} name={row.name} role={row.role} />
            <span>{row.name}</span>
            {row.role && <span className="hero-cell__role" data-role={row.role}><RoleIcon role={row.role} size={11} /></span>}
          </button>
        ),
      },
      ...(STAT_COLUMNS as Column<HeroRow>[]),
    ],
    [onOpenHero],
  );
  return (
    <SortableTable
      caption="Hero performance"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      rowRole={(row) => row.role}
      activeKey={activeHero}
      wideGroups={WIDE_GROUPS}
      groups={TABLE_GROUPS}
      phoneGroups={PHONE_GROUPS}
      defaultSort="time"
    />
  );
}

function RoleStatsTable({ stats }: { stats?: StatsSummary }) {
  interface RoleRow { key: string; label: string; role?: Role; stats: StatsBlock }
  const rows: RoleRow[] = [
    ...ROLES.flatMap((role) => {
      const block = stats?.roles?.[role];
      return block ? [{ key: role, label: ROLE_LABEL[role], role, stats: block }] : [];
    }),
    ...(stats?.general ? [{ key: 'all', label: 'All roles', stats: stats.general }] : []),
  ];
  const columns: Column<RoleRow>[] = [
    {
      id: 'role',
      label: 'Role',
      text: true,
      pinned: true,
      value: (row) => row.label,
      render: (row) => <span className="role-cell">{row.role && <RoleIcon role={row.role} size={14} />}{row.label}</span>,
    },
    ...(STAT_COLUMNS as Column<RoleRow>[]),
  ];
  if (rows.length === 0) return <NoDataBlock title="No role statistics">Nothing recorded for this filter.</NoDataBlock>;
  return <SortableTable caption="Role statistics" columns={columns} rows={rows} rowKey={(row) => row.key} rowRole={(row) => row.role} wideGroups={WIDE_GROUPS} groups={TABLE_GROUPS} phoneGroups={PHONE_GROUPS} defaultSort="time" />;
}

function CareerTables({ data, heroKey }: { data: CareerStats; heroKey: string }) {
  const hero = data[heroKey];
  const categories = hero ? sortCategories(Object.keys(hero)).filter((key) => hero[key] && Object.keys(hero[key] as object).length > 0) : [];
  if (categories.length === 0) return <NoDataBlock title="No detailed stats">Blizzard's public profile has no detailed table for this selection.</NoDataBlock>;
  return (
    <div className="career-tables">
      {categories.map((category) => (
        <section className="career-table" key={category}>
          <h4>{categoryLabel(category)}</h4>
          <dl>
            {Object.entries(hero?.[category] ?? {}).map(([stat, value]) => (
              <div key={stat}>
                <dt>{statLabel(stat)}</dt>
                <dd>{formatStat(stat, value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function StatisticsTab({
  profile,
  playerId,
  mode,
  platform,
  detailMode,
  onDetailMode,
  hero,
  onHero,
}: {
  profile: CareerProfile;
  playerId: string;
  mode: ModeFilter;
  platform: PlatformFilter;
  detailMode: GameMode;
  onDetailMode: (mode: GameMode) => void;
  hero?: string;
  onHero: (hero?: string) => void;
}) {
  const [roleView, setRoleView] = useState<RoleView>('all');
  const scoped = profile.stats[mode];
  const stats = scoped.data;
  const allRows = useMemo(() => heroRows(stats), [stats]);

  const heroRole = hero ? HERO_BY_ID[hero]?.role : undefined;
  const activeRole: RoleView = heroRole ?? roleView;
  const rows = activeRole === 'all' ? allRows : allRows.filter((row) => row.role === activeRole);
  const byGames = useMemo(() => [...rows].sort((a, b) => (b.stats.games_played ?? 0) - (a.stats.games_played ?? 0)).slice(0, 12), [rows]);

  const heroBlock = hero ? stats?.heroes?.[hero] : undefined;
  const scopeBlock = hero ? heroBlock : activeRole === 'all' ? stats?.general : stats?.roles?.[activeRole];
  const scopeLabel = hero ? heroName(hero) : activeRole === 'all' ? 'All heroes' : `All ${ROLE_LABEL[activeRole].toLowerCase()} heroes`;

  const series: CompareSeries[] = hero
    ? [
        { id: hero, label: heroName(hero), role: heroRole, block: heroBlock },
        { id: 'account', label: 'Account average', block: stats?.general },
      ]
    : ROLES.map((role) => ({ id: role, label: ROLE_LABEL[role], role, block: stats?.roles?.[role] }));

  const detailRequest: CareerRequest = { endpoint: 'career', playerId, mode: mode === 'all' ? detailMode : mode, platform };
  const career = useResource<CareerStats>(detailRequest);

  const heroOptions = useMemo(() => {
    const sorted = [...allRows].sort((a, b) => a.name.localeCompare(b.name));
    const ensure = hero && !sorted.some((row) => row.key === hero) ? [{ key: hero, name: heroName(hero), role: heroRole, stats: {} } as HeroRow] : [];
    return [...sorted, ...ensure];
  }, [allRows, hero, heroRole]);

  const modeName = mode === 'competitive' ? 'Competitive' : mode === 'quickplay' ? 'Quick Play' : 'all modes';

  return (
    <div className="statistics">
      <div className="statistics__filters">
        <Segmented<RoleView>
          label="Filter by role"
          className="segmented--roles"
          value={activeRole}
          onChange={(value) => {
            setRoleView(value);
            if (hero) onHero(undefined);
          }}
          options={[
            { value: 'all', label: 'All roles' },
            ...ROLES.map((role) => ({
              value: role as RoleView,
              ariaLabel: ROLE_LABEL[role],
              label: <><RoleIcon role={role} size={14} /><span className="segmented__text">{ROLE_LABEL[role]}</span></>,
            })),
          ]}
        />
        <SelectField label="Hero" value={hero ?? ''} onChange={(value) => onHero(value || undefined)}>
          <option value="">All heroes</option>
          {ROLES.map((role) => {
            const options = heroOptions.filter((row) => row.role === role);
            return options.length > 0 && (
              <optgroup key={role} label={ROLE_LABEL[role]}>
                {options.map((row) => <option key={row.key} value={row.key}>{row.name}</option>)}
              </optgroup>
            );
          })}
          {heroOptions.filter((row) => !row.role).map((row) => <option key={row.key} value={row.key}>{row.name}</option>)}
        </SelectField>
        {hero && (
          <button type="button" className="btn-plain" onClick={() => onHero(undefined)}><X size={14} aria-hidden="true" /> Clear hero</button>
        )}
      </div>

      <ResourceGate entry={scoped} request={profile.requests[mode]} lines={6}>
        {(data) =>
          isEmptyStats(data) ? (
            <NoDataBlock title={`No statistics for ${modeName}`}>This profile has nothing recorded for the current game mode and platform.</NoDataBlock>
          ) : (
            <>
              <Panel eyebrow={`${modeName}`} title={scopeLabel} className="statistics__scope">
                {hero && !heroBlock ? (
                  <NoDataBlock title={`No ${heroName(hero)} games in ${modeName}`}>Try another game mode, or pick a different hero.</NoDataBlock>
                ) : (
                  <KpiStrip block={scopeBlock} />
                )}
              </Panel>

              <div className="statistics__charts">
                {!hero && activeRole === 'all' && (
                  <Panel title="Time by role"><RoleShareChart stats={data} /></Panel>
                )}
                <Panel title={hero ? `${heroName(hero)} vs account average` : 'Averages by role'} className="statistics__compare">
                  <MetricCompareChart series={series} metrics={COMPARE_METRICS} />
                </Panel>
                <Panel title="Win rate vs account average" eyebrow="Top 12 heroes by games" className="statistics__winrate">
                  {typeof data.general?.winrate === 'number' ? (
                    <WinRateChart rows={byGames} baseline={data.general.winrate} onOpenHero={onHero} />
                  ) : (
                    <p className="chart__empty">No account win rate recorded for this filter.</p>
                  )}
                </Panel>
              </div>

              <Panel title="Hero performance" className="statistics__table">
                {rows.length ? <HeroTable rows={rows} activeHero={hero} onOpenHero={onHero} /> : <NoDataBlock title="No heroes for this filter" />}
              </Panel>

              <Panel title="Role statistics" className="statistics__table">
                <RoleStatsTable stats={data} />
              </Panel>
            </>
          )
        }
      </ResourceGate>

      <Panel
        title={`Career tables: ${hero ? heroName(hero) : 'all heroes'}`}
        eyebrow={mode === 'all' ? 'Blizzard publishes these per game mode' : modeName}
        className="statistics__career"
        actions={
          mode === 'all' ? (
            <Segmented<GameMode>
              label="Career table game mode"
              value={detailMode}
              onChange={onDetailMode}
              options={[{ value: 'quickplay', label: 'Quick Play' }, { value: 'competitive', label: 'Competitive' }]}
            />
          ) : undefined
        }
      >
        <ResourceGate entry={career} request={detailRequest} lines={6}>
          {(data) => <CareerTables data={data} heroKey={hero ?? 'all-heroes'} />}
        </ResourceGate>
      </Panel>

    </div>
  );
}
