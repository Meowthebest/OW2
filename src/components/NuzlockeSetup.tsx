import { useMemo, useState } from 'react';
import { Check, ChevronDown, Flame, Heart, Info, RotateCcw, Shield, Sparkles, Swords, Target, Users } from 'lucide-react';
import { HEROES, ROLES } from '../data/heroes';
import { DEFAULT_NUZLOCKE_RULES } from '../lib/storage';
import type { NuzlockeRules, NuzlockeSummary, RemoveRule, Role, RoleFilter } from '../types';
import { EmptyState, HeroCard, Metric, SearchField, Toggle, cn } from './ui';

type Props = {
  rules: NuzlockeRules;
  history: NuzlockeSummary[];
  compactCards: boolean;
  onRulesChange: (rules: NuzlockeRules) => void;
  onStart: () => void;
  fail: (message: string) => void;
};

const PRESETS: Array<{ id: string; title: string; description: string; patch: Partial<NuzlockeRules> }> = [
  { id: 'classic', title: 'Classic', description: 'One life per hero. Wins complete them; losses eliminate them.', patch: { duplicateSelections: false, removeRule: 'both', livesPerHero: 1, totalLives: 12, requiredWins: 10, roleQueue: false, autoAdvance: true } },
  { id: 'survival', title: 'Survival', description: 'Two lives per hero with a rotating role queue.', patch: { duplicateSelections: true, removeRule: 'win', livesPerHero: 2, totalLives: 16, requiredWins: 12, roleQueue: true, autoAdvance: true } },
  { id: 'marathon', title: 'Marathon', description: 'Heroes stay in the pool. Reach the win goal before lives run out.', patch: { duplicateSelections: true, removeRule: 'never', livesPerHero: 3, totalLives: 20, requiredWins: 20, roleQueue: false, autoAdvance: true } },
];

export default function NuzlockeSetup({ rules, history, compactCards, onRulesChange, onStart, fail }: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [show, setShow] = useState<'all' | 'included' | 'excluded'>('all');

  const includedHeroes = HEROES.filter((hero) => rules.roles.includes(hero.role) && !rules.excludedHeroes.includes(hero.name));
  const filteredHeroes = useMemo(() => HEROES.filter((hero) => {
    if (search && !hero.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'All' && hero.role !== roleFilter) return false;
    const included = rules.roles.includes(hero.role) && !rules.excludedHeroes.includes(hero.name);
    if (show === 'included' && !included) return false;
    if (show === 'excluded' && included) return false;
    return true;
  }), [roleFilter, rules.excludedHeroes, rules.roles, search, show]);

  const setRule = <K extends keyof NuzlockeRules>(key: K, value: NuzlockeRules[K]) => {
    onRulesChange({ ...rules, [key]: value });
  };

  const toggleRole = (role: Role) => {
    const roles = rules.roles.includes(role) ? rules.roles.filter((item) => item !== role) : [...rules.roles, role];
    if (!roles.length) {
      fail('Keep at least one role in the run.');
      return;
    }
    const playerRoles = Array.from({ length: 5 }, (_, index) => {
      const current = rules.playerRoles[index] ?? rules.roles;
      const wasFlex = rules.roles.every((item) => current.includes(item));
      const next = wasFlex ? [...roles] : current.filter((item) => roles.includes(item));
      return next.length ? next : [...roles];
    });
    onRulesChange({ ...rules, roles, playerRoles });
  };

  const togglePlayerRole = (playerIndex: number, role: Role) => {
    if (!rules.roles.includes(role)) return;
    const current = rules.playerRoles[playerIndex] ?? rules.roles;
    if (current.includes(role) && current.length === 1) {
      fail('Each player needs at least one role.');
      return;
    }
    const next = current.includes(role) ? current.filter((item) => item !== role) : [...current, role];
    setRule('playerRoles', Array.from({ length: 5 }, (_, index) => index === playerIndex ? next : rules.playerRoles[index] ?? [...rules.roles]));
  };

  const setPlayerFlex = (playerIndex: number) => {
    setRule('playerRoles', Array.from({ length: 5 }, (_, index) => index === playerIndex ? [...rules.roles] : rules.playerRoles[index] ?? [...rules.roles]));
  };

  const toggleHero = (name: string) => {
    setRule('excludedHeroes', rules.excludedHeroes.includes(name) ? rules.excludedHeroes.filter((hero) => hero !== name) : [...rules.excludedHeroes, name]);
  };

  const start = () => {
    if (includedHeroes.length < rules.playerCount) {
      fail('Include at least ' + rules.playerCount + ' heroes for this party.');
      return;
    }
    onStart();
  };

  return (
    <div className="nuzlocke-setup">
      <section className="nuzlocke-setup__hero">
        <div>
          <span className="eyebrow"><Flame size={14} /> Nuzlocke mode</span>
          <h1>Every result changes the run.</h1>
          <p>Build your rules, protect your remaining lives, and clear the win target before the hero pool runs dry.</p>
        </div>
        <div className="setup-hero__summary">
          <span><strong>{rules.playerCount}</strong><small>{rules.playerCount === 1 ? 'Player' : 'Players'}</small></span>
          <span><strong>{includedHeroes.length}</strong><small>Heroes included</small></span>
          <span><strong>{rules.totalLives}</strong><small>Lives per player</small></span>
          <span><strong>{rules.requiredWins}</strong><small>Wins required</small></span>
        </div>
      </section>

      <section className="setup-section">
        <header className="section-heading"><div><span className="eyebrow">Quick start</span><h2>Choose a ruleset</h2><p>Start from a sensible preset, then adjust anything below.</p></div></header>
        <div className="preset-grid">
          {PRESETS.map((preset) => (
            <button type="button" key={preset.id} className="preset-card" onClick={() => onRulesChange({ ...rules, ...preset.patch })}>
              <span><Sparkles size={18} /></span><strong>{preset.title}</strong><p>{preset.description}</p><em>Use preset <Check size={14} /></em>
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <header className="section-heading"><div><span className="eyebrow">Run rules</span><h2>Configure the challenge</h2><p>Defaults are ready to play; only change what matters to you.</p></div><button type="button" className="button button--ghost" onClick={() => onRulesChange({ ...DEFAULT_NUZLOCKE_RULES })}><RotateCcw size={15} />Restore defaults</button></header>
        <div className="rules-layout">
          <div className="rule-card nuzlocke-party-setup">
            <span className="rule-card__icon"><Users size={19} /></span>
            <div className="rule-card__heading"><strong>Party and role pools</strong><small>Add up to five players, then give each player one role or a flexible combination.</small></div>
            <div className="party-size-picker" role="group" aria-label="Nuzlocke player count">
              {[1, 2, 3, 4, 5].map((count) => <button type="button" key={count} className={rules.playerCount === count ? 'is-active' : ''} onClick={() => setRule('playerCount', count)} aria-pressed={rules.playerCount === count}>{count}</button>)}
            </div>
            <div className="party-name-grid">
              {Array.from({ length: rules.playerCount }, (_, index) => {
                const playerName = rules.playerNames[index] ?? 'Player ' + (index + 1);
                const selectedRoles = rules.playerRoles[index] ?? rules.roles;
                const flex = rules.roles.every((role) => selectedRoles.includes(role));
                return <article className="party-player-config" key={index}>
                  <label className="field"><span>Player {index + 1}</span><input aria-label={'Nuzlocke player ' + (index + 1) + ' name'} value={playerName} maxLength={24} onChange={(event) => setRule('playerNames', Array.from({ length: 5 }, (__, nameIndex) => nameIndex === index ? event.target.value : rules.playerNames[nameIndex] ?? 'Player ' + (nameIndex + 1)))} /></label>
                  <div className="player-role-picker" role="group" aria-label={playerName + ' role pool'}>
                    <button type="button" className={cn('player-role-flex', flex && 'is-active')} onClick={() => setPlayerFlex(index)} aria-pressed={flex}>Flex</button>
                    {ROLES.map((role) => <button type="button" key={role} disabled={!rules.roles.includes(role)} className={cn('role-' + role.toLowerCase(), selectedRoles.includes(role) && 'is-active')} onClick={() => togglePlayerRole(index, role)} aria-pressed={selectedRoles.includes(role)} aria-label={'Toggle ' + role + ' for ' + playerName}>{role}</button>)}
                  </div>
                </article>;
              })}
            </div>
          </div>

          <div className="rule-card rule-card--roles">
            <span className="rule-card__icon"><Shield size={19} /></span>
            <div className="rule-card__heading"><strong>Included roles</strong><small>Choose one role or combine the full roster.</small></div>
            <div className="role-choice-grid">
              {ROLES.map((role) => <button type="button" key={role} className={cn('role-choice', 'role-' + role.toLowerCase(), rules.roles.includes(role) && 'is-active')} onClick={() => toggleRole(role)} aria-pressed={rules.roles.includes(role)}>{role}{rules.roles.includes(role) && <Check size={15} />}</button>)}
            </div>
          </div>

          <div className="number-rules-grid">
            <label className="number-rule"><span><Heart size={17} /><strong>Lives per hero</strong><small>Losses before a hero is out</small></span><input type="number" min={1} max={9} value={rules.livesPerHero} onChange={(event) => setRule('livesPerHero', Math.max(1, Math.min(9, Number(event.target.value) || 1)))} /></label>
            <label className="number-rule"><span><Flame size={17} /><strong>Lives per player</strong><small>Personal loss limit for each player</small></span><input type="number" min={1} max={999} value={rules.totalLives} onChange={(event) => setRule('totalLives', Math.max(1, Math.min(999, Number(event.target.value) || 1)))} /></label>
            <label className="number-rule"><span><Target size={17} /><strong>Required wins</strong><small>Run completion goal</small></span><input type="number" min={1} max={999} value={rules.requiredWins} onChange={(event) => setRule('requiredWins', Math.max(1, Math.min(999, Number(event.target.value) || 1)))} /></label>
          </div>

          <label className="select-rule"><span><Swords size={18} /><span><strong>Hero removal</strong><small>{rules.reuseCompletedHeroes ? 'Wins stay selectable; this rule still controls losses.' : 'Decide when a hero leaves the available pool.'}</small></span></span><span className="select-field"><select value={rules.removeRule} onChange={(event) => setRule('removeRule', event.target.value as RemoveRule)}><option value="both">After a win or loss</option><option value="win">After a win only</option><option value="loss">After a loss only</option><option value="never">Only when out of lives</option></select><ChevronDown size={15} /></span></label>

          <div className="toggle-rules-grid">
            <Toggle checked={rules.duplicateSelections} onChange={(checked) => setRule('duplicateSelections', checked)} title="Allow repeat random rolls" description="Used heroes are always available for manual picks. Turn this on to include them in random rolls before the fresh pool is exhausted." />
            <Toggle checked={rules.reuseCompletedHeroes} onChange={(checked) => setRule('reuseCompletedHeroes', checked)} title="Keep winners selectable" description="A win increases that hero's win count without removing it. Random rolls still prioritize unused heroes." />
            <Toggle checked={rules.roleQueue} onChange={(checked) => setRule('roleQueue', checked)} title="Role queue rotation" description="Rotate random picks across the included roles." />
            <Toggle checked={rules.autoAdvance} onChange={(checked) => setRule('autoAdvance', checked)} title="Auto-select next hero" description="Immediately pick another hero after recording a result." />
            <Toggle checked={rules.showEliminated} onChange={(checked) => setRule('showEliminated', checked)} title="Show eliminated heroes" description="Keep eliminated cards visible with a readable overlay." />
          </div>

          <label className="field custom-rules-field"><span>Optional custom rules</span><textarea value={rules.customRules} onChange={(event) => setRule('customRules', event.target.value)} placeholder="Example: No role swaps after the first round…" rows={3} /></label>
        </div>
      </section>

      <section className="setup-section setup-hero-pool">
        <header className="section-heading"><div><span className="eyebrow">Included heroes</span><h2>Build the run pool</h2><p>Click a card to include or exclude it. Role restrictions are shown as locked.</p></div><span className="selection-counter"><strong>{includedHeroes.length}</strong> of {HEROES.length} included</span></header>
        <div className="hero-pool-toolbar">
          <SearchField value={search} onChange={setSearch} />
          <div className="segmented" role="group" aria-label="Filter setup heroes by role">{(['All', ...ROLES] as RoleFilter[]).map((role) => <button type="button" key={role} className={roleFilter === role ? 'is-active' : ''} onClick={() => setRoleFilter(role)}>{role}</button>)}</div>
          <label className="select-field"><span className="sr-only">Filter included heroes</span><select value={show} onChange={(event) => setShow(event.target.value as typeof show)}><option value="all">All heroes</option><option value="included">Included only</option><option value="excluded">Excluded only</option></select><ChevronDown size={15} /></label>
        </div>
        {filteredHeroes.length ? (
          <div className={cn('hero-grid', compactCards && 'is-compact')}>
            {filteredHeroes.map((hero) => {
              const roleLocked = !rules.roles.includes(hero.role);
              const excluded = rules.excludedHeroes.includes(hero.name);
              return <HeroCard key={hero.name} hero={hero} compact={compactCards} status={roleLocked ? 'locked' : excluded ? 'excluded' : 'available'} detail={roleLocked ? 'Role not included' : excluded ? 'Click to include' : 'Included in run'} disabled={roleLocked} onSelect={() => toggleHero(hero.name)} />;
            })}
          </div>
        ) : <EmptyState title="No heroes found" description="Change the search or hero-state filter." />}
      </section>

      <section className="launch-panel">
        <div><span className="launch-panel__icon"><Flame size={24} /></span><span><small>Ready when you are</small><h2>Start a {rules.playerCount}-player run with {includedHeroes.length} heroes</h2><p>{rules.totalLives} lives for each player · progress saves automatically · new runs require confirmation.</p></span></div>
        <button type="button" className="button button--primary button--large" onClick={start}><Swords size={20} />Start Nuzlocke</button>
      </section>

      {history.length > 0 && (
        <section className="previous-runs">
          <header className="section-heading"><div><span className="eyebrow">Run archive</span><h2>Recent attempts</h2></div></header>
          <div className="metrics-row">
            <Metric label="Runs played" value={history.length} icon={<Swords size={18} />} />
            <Metric label="Best wins" value={Math.max(...history.map((run) => run.wins))} icon={<Target size={18} />} />
            <Metric label="Best streak" value={Math.max(...history.map((run) => run.longestStreak))} icon={<Flame size={18} />} />
          </div>
        </section>
      )}

      <aside className="setup-note"><Info size={17} /><p><strong>How it works:</strong> Every player gets a different hero. Team results update the whole active lineup, while Reroll, Skip, and manual picks target one selected player. Undo restores the entire party.</p></aside>
    </div>
  );
}
