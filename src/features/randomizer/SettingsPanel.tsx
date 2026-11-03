import { useMemo, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { RoleIcon } from '../../components/icons';
import { Panel, Segmented, Toggle } from '../../components/controls';
import { HeroPortrait } from '../../components/media';
import { useToast } from '../../components/Toast';
import { HEROES, HERO_BY_ID, ROLES, ROLE_COUNT, ROLE_LABEL } from '../../data/heroes';
import { cn } from '../../lib/format';
import type { MotionPref, RandomizerApi } from './useRandomizer';

const POOL_GRID_COLUMNS = 9;

/** At-a-glance view of the pool on wide screens. One tab stop; arrow keys move between heroes. */
function PoolGrid({ api }: { api: RandomizerApi }) {
  const { state, spinning } = api;
  const [focusIndex, setFocusIndex] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const usedSet = useMemo(() => new Set(state.used), [state.used]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -POOL_GRID_COLUMNS, ArrowDown: POOL_GRID_COLUMNS };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = Math.min(HEROES.length - 1, Math.max(0, focusIndex + move));
    setFocusIndex(next);
    grid.current?.querySelectorAll('button')[next]?.focus();
  };

  return (
    <div className="pool-grid" ref={grid} role="group" aria-label="Hero pool. Use arrow keys to move between heroes." onKeyDown={onKeyDown}>
      {HEROES.map((hero, index) => {
        const excluded = state.excluded.includes(hero.id);
        const roleOff = !state.roles.includes(hero.role);
        const used = state.noRepeats && usedSet.has(hero.id);
        return (
          <button
            key={hero.id}
            type="button"
            className={cn('pool-chip', excluded && 'is-excluded', !excluded && (roleOff || used) && 'is-dim')}
            data-role={hero.role}
            tabIndex={index === focusIndex ? 0 : -1}
            aria-pressed={!excluded}
            aria-label={`${hero.name}: ${excluded ? 'excluded. Press to include.' : 'included. Press to exclude.'}`}
            title={`${hero.name}${excluded ? ' (excluded)' : used ? ' (used this cycle)' : roleOff ? ' (role off)' : ''}`}
            disabled={spinning}
            onFocus={() => setFocusIndex(index)}
            onClick={() => api.toggleHero(hero.id)}
          >
            <HeroPortrait id={hero.id} name={hero.name} role={hero.role} />
          </button>
        );
      })}
    </div>
  );
}

export function SettingsPanel({ api }: { api: RandomizerApi }) {
  const toast = useToast();
  const { state, pool, spinning } = api;

  const poolByRole = useMemo(
    () => Object.fromEntries(ROLES.map((role) => [role, pool.filter((hero) => hero.role === role).length])) as Record<(typeof ROLES)[number], number>,
    [pool],
  );

  const usedInPool = useMemo(() => {
    const ids = new Set(pool.map((hero) => hero.id));
    return state.used.filter((id) => ids.has(id)).length;
  }, [pool, state.used]);

  const reset = () => {
    const undo = api.resetAll();
    if (undo) toast({ message: 'Filters and history reset.', actionLabel: 'Undo', onAction: undo });
  };

  return (
    <Panel className="settings" title="Pool settings" id="settings">
      <div className="pool-meter">
        <div className="pool-meter__count">
          <strong>{pool.length}</strong>
          <span>of {HEROES.length} heroes in pool</span>
        </div>
        <div className="pool-meter__bar" role="img" aria-label={ROLES.map((role) => `${ROLE_LABEL[role]} ${poolByRole[role]}`).join(', ')}>
          {ROLES.map((role) => (
            <span key={role} data-role={role} style={{ flexGrow: poolByRole[role] }} />
          ))}
          <span className="pool-meter__rest" style={{ flexGrow: HEROES.length - pool.length }} />
        </div>
      </div>

      <fieldset className="settings__group" disabled={spinning}>
        <legend>Allowed roles</legend>
        <div className="role-toggles">
          {ROLES.map((role) => {
            const active = state.roles.includes(role);
            const lastOne = active && state.roles.length === 1;
            return (
              <button
                key={role}
                type="button"
                className={cn('role-toggle', active && 'is-active')}
                data-role={role}
                aria-pressed={active}
                aria-label={`${ROLE_LABEL[role]}: ${poolByRole[role]} of ${ROLE_COUNT[role]} in pool`}
                title={lastOne ? 'At least one role must stay on' : undefined}
                aria-disabled={lastOne || undefined}
                onClick={() => api.toggleRole(role)}
              >
                <RoleIcon role={role} size={16} />
                <span className="role-toggle__label">{ROLE_LABEL[role]}</span>
                <span className="role-toggle__count">{poolByRole[role]}/{ROLE_COUNT[role]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="settings__group">
        <Toggle
          label="No repeats"
          checked={state.noRepeats}
          disabled={spinning}
          onChange={api.setNoRepeats}
          hint={state.noRepeats ? `${usedInPool} of ${pool.length} used this cycle` : 'Each hero comes up once per cycle'}
        />
        {state.noRepeats && (
          <div className="cycle">
            <div className="cycle__bar"><span style={{ width: `${pool.length ? (usedInPool / pool.length) * 100 : 0}%` }} /></div>
            <button type="button" className="text-button" onClick={api.clearUsed} disabled={spinning || state.used.length === 0}>Restart cycle</button>
          </div>
        )}
      </div>

      <div className="settings__group">
        <span className="settings__label">Animation</span>
        <Segmented<MotionPref>
          label="Animation"
          className="segmented--block"
          value={api.motion}
          disabled={spinning || api.systemReduced}
          onChange={api.setMotion}
          options={[
            { value: 'full', label: 'Full' },
            { value: 'fast', label: 'Fast' },
            { value: 'off', label: 'Off' },
          ]}
        />
        {api.systemReduced && <p className="settings__note">Off because your device is set to reduce motion.</p>}
      </div>

      <div className="settings__group">
        <div className="settings__row">
          <span className="settings__label">Excluded heroes <b>{state.excluded.length}</b></span>
          {state.excluded.length > 0 && (
            <button type="button" className="text-button" onClick={() => api.setExcluded(state.excluded, false)} disabled={spinning}>Include all</button>
          )}
        </div>
        <PoolGrid api={api} />
        {state.excluded.length === 0 ? (
          <p className="settings__note settings__note--narrow">None. Tap any hero in the <a className="text-link" href="#/heroes">roster</a> to leave them out.</p>
        ) : (
          <ul className="excluded-list">
            {state.excluded.map((id) => (
              <li key={id}>
                <button type="button" onClick={() => api.toggleHero(id)} disabled={spinning} aria-label={`Include ${HERO_BY_ID[id].name}`}>
                  {HERO_BY_ID[id].name}<X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" className="btn-plain settings__reset" onClick={reset} disabled={spinning}>
        <RotateCcw size={15} aria-hidden="true" /> Reset filters &amp; history
      </button>
    </Panel>
  );
}
