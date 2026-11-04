import { memo, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { RoleIcon } from '../../components/icons';
import { Segmented } from '../../components/controls';
import { HeroPortrait } from '../../components/media';
import { HEROES, ROLES, ROLE_COUNT, ROLE_LABEL, SUB_ROLES, type Hero, type Role } from '../../data/heroes';
import { cn } from '../../lib/format';
import type { RandomizerApi } from './useRandomizer';

type RoleView = 'all' | Role;
type StatusView = 'all' | 'in' | 'out';
type TileStatus = 'in' | 'excluded' | 'role-off' | 'used';

const STATUS_TEXT: Record<TileStatus, string> = {
  in: 'In pool',
  excluded: 'Excluded',
  'role-off': 'Role off',
  used: 'Used',
};

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const HeroTile = memo(function HeroTile({ hero, status, pickTag, pickedBy, disabled, onToggle }: { hero: Hero; status: TileStatus; pickTag?: string; pickedBy?: string; disabled: boolean; onToggle: (id: string) => void }) {
  const excluded = status === 'excluded';
  const label = `${hero.name}, ${ROLE_LABEL[hero.role]}, ${SUB_ROLES[hero.subRole].label}. ${pickedBy ? `Current pick for ${pickedBy}. ` : ''}${STATUS_TEXT[status]}. ${excluded ? 'Press to include.' : 'Press to exclude.'}`;
  return (
    <li>
      <button
        type="button"
        className={cn('hero-tile', 'is-' + status, pickTag && 'is-pick')}
        data-role={hero.role}
        aria-pressed={!excluded}
        aria-label={label}
        disabled={disabled}
        onClick={() => onToggle(hero.id)}
      >
        <span className="hero-tile__media">
          <HeroPortrait id={hero.id} name={hero.name} role={hero.role} />
          <span className="hero-tile__state" aria-hidden="true">
            {status === 'in' && <Check size={12} strokeWidth={3} />}
            {status === 'excluded' && <X size={12} strokeWidth={3} />}
            {status === 'used' && 'Used'}
            {status === 'role-off' && 'Off'}
          </span>
          {pickTag && <span className="hero-tile__pick" aria-hidden="true">{pickTag}</span>}
          {hero.isNew && !pickTag && <span className="hero-tile__new" aria-hidden="true">New</span>}
        </span>
        <span className="hero-tile__foot">
          <RoleIcon role={hero.role} size={11} />
          <span className="hero-tile__name">{hero.name}</span>
        </span>
      </button>
    </li>
  );
});

export function Roster({ api }: { api: RandomizerApi }) {
  const [query, setQuery] = useState('');
  const [roleView, setRoleView] = useState<RoleView>('all');
  const [statusView, setStatusView] = useState<StatusView>('all');
  const { state, spinning, team, toggleHero, setExcluded } = api;

  const excludedSet = useMemo(() => new Set(state.excluded), [state.excluded]);
  const usedSet = useMemo(() => new Set(state.used), [state.used]);
  const picks = useMemo(() => new Map(team.flatMap((member) => (member.hero ? [[member.hero.id, member] as const] : []))), [team]);

  const statusOf = (hero: Hero): TileStatus => {
    if (excludedSet.has(hero.id)) return 'excluded';
    if (!state.roles.includes(hero.role)) return 'role-off';
    if (state.noRepeats && usedSet.has(hero.id)) return 'used';
    return 'in';
  };

  const needle = normalize(query.trim());
  const visible = HEROES.filter((hero) => {
    if (roleView !== 'all' && hero.role !== roleView) return false;
    if (needle && !normalize(hero.name).includes(needle)) return false;
    if (statusView === 'in' && excludedSet.has(hero.id)) return false;
    if (statusView === 'out' && !excludedSet.has(hero.id)) return false;
    return true;
  });
  const visibleIds = visible.map((hero) => hero.id);
  const allVisibleExcluded = visible.length > 0 && visible.every((hero) => excludedSet.has(hero.id));
  const someFilter = needle !== '' || roleView !== 'all' || statusView !== 'all';

  const groups = ROLES.map((role) => ({ role, heroes: visible.filter((hero) => hero.role === role) })).filter((group) => group.heroes.length > 0);

  return (
    <section className="roster" id="heroes" aria-labelledby="roster-title">
      <header className="roster__head">
        <div>
          <span className="eyebrow">Hero selection pool</span>
          <h2 className="section-title" id="roster-title">Hero roster</h2>
        </div>
        <p className="roster__help">Tap a hero to take them out of the draw. Tap again to put them back.</p>
      </header>

      <div className="roster__toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search heroes by name</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search heroes" autoComplete="off" />
        </label>
        <Segmented<RoleView>
          label="Show role"
          className="segmented--roles"
          value={roleView}
          onChange={setRoleView}
          options={[
            { value: 'all', label: `All ${HEROES.length}` },
            ...ROLES.map((role) => ({
              value: role as RoleView,
              ariaLabel: `${ROLE_LABEL[role]}, ${ROLE_COUNT[role]} heroes`,
              label: <><RoleIcon role={role} size={14} /><span className="segmented__text">{ROLE_LABEL[role]}</span> {ROLE_COUNT[role]}</>,
            })),
          ]}
        />
        <Segmented<StatusView>
          label="Show status"
          value={statusView}
          onChange={setStatusView}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'in', label: 'Included' },
            { value: 'out', label: `Excluded ${state.excluded.length}` },
          ]}
        />
        <button
          type="button"
          className="btn-plain roster__bulk"
          disabled={spinning || visible.length === 0}
          onClick={() => setExcluded(visibleIds, !allVisibleExcluded)}
        >
          {allVisibleExcluded ? 'Include' : 'Exclude'} {someFilter ? `these ${visible.length}` : 'everyone'}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="roster__empty">
          No heroes match{needle ? ` “${query.trim()}”` : ' these filters'}.{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setQuery('');
              setRoleView('all');
              setStatusView('all');
            }}
          >
            Clear search and filters
          </button>
        </p>
      ) : (
        groups.map(({ role, heroes }) => {
          const includedCount = heroes.filter((hero) => !excludedSet.has(hero.id)).length;
          const allOut = includedCount === 0;
          return (
            <div className="roster__group" key={role} data-role={role}>
              <div className="roster__group-head">
                <h3><RoleIcon role={role} size={16} />{ROLE_LABEL[role]}</h3>
                <span className="roster__group-count">{includedCount}/{heroes.length} included</span>
                {!state.roles.includes(role) && <span className="tag">Role off</span>}
                <button type="button" className="text-button" disabled={spinning} onClick={() => setExcluded(heroes.map((hero) => hero.id), !allOut)}>
                  {allOut ? 'Include' : 'Exclude'} {heroes.length === ROLE_COUNT[role] ? `all ${ROLE_LABEL[role].toLowerCase()}` : `these ${heroes.length}`}
                </button>
              </div>
              <ul className="hero-grid">
                {heroes.map((hero) => (
                  <HeroTile key={hero.id} hero={hero} status={statusOf(hero)} pickTag={picks.has(hero.id) ? (team.length > 1 ? `P${(picks.get(hero.id)?.index ?? 0) + 1}` : 'Pick') : undefined} pickedBy={picks.get(hero.id)?.displayName} disabled={spinning} onToggle={toggleHero} />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
