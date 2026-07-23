import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  Flame,
  Heart,
  History,
  Info,
  RotateCcw,
  Shield,
  Shuffle,
  SkipForward,
  Skull,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { HEROES, HERO_BY_NAME, ROLES } from '../data/heroes';
import {
  chooseNuzlockeHero,
  createNuzlockeRun,
  endNuzlockeRun,
  endReasonLabel,
  formatDuration,
  getEligibleHeroes,
  getSelectableHeroes,
  pickNextHero,
  recordNuzlockeResult,
  rerollNuzlockeHero,
  summarizeRun,
  undoNuzlockeAction,
} from '../lib/nuzlocke';
import { createRankChallenge, endRankChallenge, recordRankChallengeResult, undoRankChallenge } from '../lib/rankChallenge';
import type { NuzlockeRun, NuzlockeStore, PlayerId, RankChallenge, RankChallengeConfig, Role, RoleFilter } from '../types';
import NuzlockeSetup from './NuzlockeSetup';
import RankChallengePanel from './RankChallengePanel';
import { ConfirmDialog, EmptyState, HeroCard, HeroPortrait, Metric, Modal, ProgressBar, RoleIcon, SearchField, Toggle, cn, type HeroCardStatus } from './ui';

type Props = {
  store: NuzlockeStore;
  setStore: Dispatch<SetStateAction<NuzlockeStore>>;
  rankChallenge: RankChallenge | null;
  setRankChallenge: Dispatch<SetStateAction<RankChallenge | null>>;
  settingsOpen: boolean;
  onSettingsClose: () => void;
  compactCards: boolean;
  notify: (message: string) => void;
  fail: (message: string) => void;
};

type PoolStatus = 'all' | 'available' | 'winner' | 'eliminated';

function eventTime(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function NuzlockeMode({ store, setStore, rankChallenge, setRankChallenge, settingsOpen, onSettingsClose, compactCards, notify, fail }: Props) {
  const run = store.currentRun;
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [statusFilter, setStatusFilter] = useState<PoolStatus>('all');
  const [lossConfirm, setLossConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<PlayerId>(1);

  useEffect(() => {
    if (!run) return;
    if (!run.players.some((player) => player.id === activePlayerId)) {
      setActivePlayerId(run.players[0]?.id ?? 1);
      return;
    }
    const playerRoles = run.rules.playerRoles[activePlayerId - 1] ?? run.rules.roles;
    setRoleFilter(playerRoles.length === 1 ? playerRoles[0] : 'All');
  }, [activePlayerId, run?.id]);

  const applyRun = (transform: (current: NuzlockeRun) => NuzlockeRun, message?: string) => {
    setStore((current) => {
      if (!current.currentRun) return current;
      const nextRun = transform(current.currentRun);
      let history = current.runHistory.filter((summary) => summary.id !== nextRun.id);
      if (nextRun.phase === 'completed') history = [summarizeRun(nextRun), ...history].slice(0, 12);
      return { ...current, currentRun: nextRun, runHistory: history };
    });
    if (message) notify(message);
  };

  const startRun = () => {
    const created = createNuzlockeRun(store.draftRules);
    if (created.players.some((player) => !player.currentHero)) {
      fail('Not enough eligible heroes are available to fill this party.');
      return;
    }
    setStore((current) => ({ ...current, currentRun: created }));
    notify('Nuzlocke run started.');
  };

  const startRankChallenge = (config: RankChallengeConfig) => {
    const sourceRules = run?.rules ?? store.draftRules;
    const roles = config.queue === 'Tank' || config.queue === 'Damage' || config.queue === 'Support' ? [config.queue] : sourceRules.roles;
    const challengeRules = { ...sourceRules, roles, autoAdvance: config.randomizeAfterMatch };
    const baseRun = run?.phase === 'active' ? run : createNuzlockeRun(challengeRules);
    let nextRun: NuzlockeRun = { ...baseRun, rules: { ...baseRun.rules, roles, autoAdvance: config.randomizeAfterMatch } };
    for (const player of nextRun.players) {
      const current = HERO_BY_NAME[player.currentHero ?? ''];
      if (current && !roles.includes(current.role)) nextRun = rerollNuzlockeHero(nextRun, 'reroll', player.id);
    }
    if (nextRun.phase === 'completed' || nextRun.players.some((player) => !player.currentHero)) {
      fail('Not enough eligible Nuzlocke heroes are available for that Rank Challenge queue.');
      return;
    }
    setStore((currentStore) => ({ ...currentStore, draftRules: nextRun.rules, currentRun: nextRun }));
    setRankChallenge(createRankChallenge('nuzlocke', config));
    notify('Nuzlocke Rank Challenge started.');
  };

  if (!run) {
    return (
      <div className="nuzlocke-preflight">
        <RankChallengePanel mode="nuzlocke" challenge={rankChallenge} currentHero={null} onStart={startRankChallenge} onChange={setRankChallenge} notify={notify} fail={fail} />
        <NuzlockeSetup rules={store.draftRules} history={store.runHistory} compactCards={compactCards} onRulesChange={(draftRules) => setStore((current) => ({ ...current, draftRules }))} onStart={startRun} fail={fail} />
      </div>
    );
  }

  if (run.phase === 'completed') {
    return <NuzlockeResults run={run} rankChallenge={rankChallenge} onRankStart={startRankChallenge} onRankChange={setRankChallenge} compactCards={compactCards} onRetry={() => { const created = createNuzlockeRun(run.rules); setStore((current) => ({ ...current, draftRules: run.rules, currentRun: created })); notify('New attempt started with the same rules.'); }} onNewSetup={() => setStore((current) => ({ ...current, draftRules: run.rules, currentRun: null }))} notify={notify} fail={fail} />;
  }

  const activePlayers = run.players.slice(0, run.rules.playerCount);
  const activePlayer = activePlayers.find((player) => player.id === activePlayerId) ?? activePlayers[0];
  const activeRolePool = activePlayer ? run.rules.playerRoles[activePlayer.id - 1] ?? run.rules.roles : run.rules.roles;
  const hero = HERO_BY_NAME[activePlayer?.currentHero ?? ''];
  const activeHeroRecords = activePlayer?.heroRecords;
  const record = hero && activeHeroRecords ? activeHeroRecords[hero.name] : null;
  const currentHeroes = activePlayers.map((player) => player.currentHero).filter((name): name is string => !!name);
  const eligible = getEligibleHeroes(run, HEROES, activePlayer?.id);
  const selectable = getSelectableHeroes(run, HEROES, activePlayer?.id);
  const selectableNames = new Set(selectable.map((item) => item.name));
  const winnerCount = Object.values(activeHeroRecords ?? {}).filter((item) => item.wins > 0).length;
  const eliminatedCount = Object.values(activeHeroRecords ?? {}).filter((item) => item.state === 'eliminated').length;
  const usedCount = Object.values(activeHeroRecords ?? {}).filter((item) => item.selections > 0).length;
  const winProgress = Math.min(run.wins, run.rules.requiredWins);

  const cardStatus = (heroName: string): HeroCardStatus => {
    const item = HERO_BY_NAME[heroName];
    const state = activeHeroRecords?.[heroName];
    if (!state) return 'locked';
    if (activePlayer?.currentHero === heroName) return 'selected';
    if (!run.rules.roles.includes(item.role)) return 'locked';
    if (!activeRolePool.includes(item.role)) return 'locked';
    if (run.rules.excludedHeroes.includes(heroName)) return 'excluded';
    if (state.lives <= 0) return 'out';
    if (state.wins > 0 && run.rules.reuseCompletedHeroes) return 'winner';
    if (state.state === 'completed') return 'completed';
    if (state.state === 'eliminated') return 'eliminated';
    if (currentHeroes.includes(heroName)) return 'selected';
    return 'available';
  };

  const filteredHeroes = HEROES.filter((item) => {
    if (!run.rules.showEliminated && activeHeroRecords?.[item.name].state === 'eliminated') return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'All' && item.role !== roleFilter) return false;
    const status = cardStatus(item.name);
    if (statusFilter === 'available' && status !== 'available' && status !== 'winner' && status !== 'selected') return false;
    if (statusFilter === 'winner' && status !== 'winner') return false;
    if (statusFilter === 'eliminated' && status !== 'eliminated' && status !== 'out') return false;
    return true;
  });

  const recordResult = (result: 'win' | 'loss') => {
    if (!currentHeroes.length) return;
    const heroNames = [...currentHeroes];
    const nextRun = recordNuzlockeResult(run, result);
    let nextChallenge = rankChallenge?.phase === 'active' ? recordRankChallengeResult(rankChallenge, result === 'win' ? 'W' : 'L', heroNames) : rankChallenge;
    if (nextRun.phase === 'completed' && nextChallenge?.phase === 'active') nextChallenge = endRankChallenge(nextChallenge, 'nuzlocke-ended');
    if (nextChallenge) setRankChallenge(nextChallenge);
    applyRun(() => nextRun, nextChallenge?.phase === 'completed' && nextChallenge.endReason !== 'nuzlocke-ended' ? 'Result recorded — Rank Challenge complete.' : result === 'win' ? 'Win recorded.' : 'Loss recorded.');
  };

  const undoLastRunAction = () => {
    const resultWasIncluded = !!run.undoSnapshot && run.events.slice(run.undoSnapshot.events.length).some((event) => event.type === 'win' || event.type === 'loss');
    applyRun(undoNuzlockeAction, 'Last action undone.');
    if (resultWasIncluded && rankChallenge?.undoAction === 'result') setRankChallenge(undoRankChallenge(rankChallenge));
  };

  const requestLoss = () => {
    if (!currentHeroes.length) return;
    const finalLifeInLineup = activePlayers.some((player) => player.currentHero && player.heroRecords[player.currentHero].lives <= 1);
    const finalPlayerLife = activePlayers.some((player) => player.currentHero && player.remainingLives <= 1);
    if (finalLifeInLineup || finalPlayerLife || run.rules.removeRule === 'loss' || run.rules.removeRule === 'both') {
      setLossConfirm(true);
      return;
    }
    recordResult('loss');
  };

  const pickHero = (name: string) => {
    if (!activePlayer || activePlayer.currentHero === name) return;
    if (!selectableNames.has(name)) {
      fail('That hero is not eligible under the current run rules.');
      return;
    }
    applyRun((current) => chooseNuzlockeHero(current, name, activePlayer.id), name + ' selected for ' + activePlayer.name + '.');
  };

  const updateDisplayRule = (showEliminated: boolean) => {
    setStore((current) => current.currentRun ? {
      ...current,
      draftRules: { ...current.draftRules, showEliminated },
      currentRun: { ...current.currentRun, rules: { ...current.currentRun.rules, showEliminated } },
    } : current);
  };

  const enableRolesForActivePlayer = (requestedRoles: Role[]) => {
    if (!activePlayer) return;
    const missingRoles = requestedRoles.filter((role) => !activeRolePool.includes(role));
    if (!missingRoles.length) return;
    setStore((current) => {
      if (!current.currentRun) return current;
      const activeRun = current.currentRun;
      const roles = [...activeRun.rules.roles, ...requestedRoles.filter((role) => !activeRun.rules.roles.includes(role))];
      const playerRoles = Array.from({ length: 5 }, (_, index) => index === activePlayer.id - 1 ? [...activeRolePool, ...missingRoles] : activeRun.rules.playerRoles[index] ?? [...activeRun.rules.roles]);
      const rules = { ...activeRun.rules, roles, playerRoles };
      return { ...current, draftRules: { ...current.draftRules, roles, playerRoles }, currentRun: { ...current.currentRun, rules } };
    });
    notify(missingRoles.join(' + ') + ' enabled for ' + activePlayer.name + '.');
  };

  const enableAllRolesForActivePlayer = () => enableRolesForActivePlayer([...ROLES]);

  const selectRoleFilter = (role: RoleFilter) => {
    setRoleFilter(role);
    if (role === 'All') enableAllRolesForActivePlayer();
    else enableRolesForActivePlayer([role]);
  };

  return (
    <div className="mode-page nuzlocke-active">
      <section className="run-banner">
        <div><span className="run-live-dot" /><span><small>{run.rules.playerCount > 1 ? run.rules.playerCount + '-player party' : 'Nuzlocke run in progress'}</small><strong>Win {run.rules.requiredWins - run.wins} more match{run.rules.requiredWins - run.wins === 1 ? '' : 'es'} to complete the run</strong></span></div>
        <span className="run-banner__time">Started {new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </section>

      <section className="metrics-row nuzlocke-metrics" aria-label="Run summary">
        <Metric label="Record" value={run.wins + '–' + run.losses} detail={'longest streak ' + run.longestStreak} icon={<Trophy size={18} />} />
        <Metric label="Party lives" value={run.remainingLives} detail={run.rules.totalLives + ' per player'} icon={<Heart size={18} />} />
        <Metric label="Eligible" value={eligible.length + currentHeroes.length} detail={eliminatedCount + ' eliminated'} icon={<Shield size={18} />} />
        <Metric label="Progress" value={Math.round((run.wins / run.rules.requiredWins) * 100) + '%'} detail={winnerCount + ' winning heroes'} icon={<Target size={18} />} />
      </section>

      <RankChallengePanel mode="nuzlocke" challenge={rankChallenge} currentHero={activePlayer?.currentHero ?? null} onStart={startRankChallenge} onChange={setRankChallenge} notify={notify} fail={fail} />

      <section className="nuzlocke-party-bar">
        <header><span><Users size={17} /><strong>Active party</strong></span><small>Select a player to manage their hero</small></header>
        <div className="nuzlocke-party-tabs">
          {activePlayers.map((player) => {
            const playerHero = HERO_BY_NAME[player.currentHero ?? ''];
            const rolePool = run.rules.playerRoles[player.id - 1] ?? run.rules.roles;
            return <button type="button" key={player.id} className={cn(player.id === activePlayer?.id && 'is-active', player.remainingLives <= 0 && 'is-out')} onClick={() => setActivePlayerId(player.id)} aria-pressed={player.id === activePlayer?.id} title={rolePool.join(' + ')}><HeroPortrait hero={playerHero} decorative /><span><strong>{player.name}</strong><small>{player.remainingLives <= 0 ? 'Out of run lives' : playerHero ? playerHero.name + ' · ' + player.remainingLives + ' run lives' : rolePool.join(' + ') + ' · ' + player.remainingLives + ' lives'}</small></span></button>;
          })}
        </div>
      </section>

      <section className="nuzlocke-stage-layout">
        <div className={cn('nuzlocke-hero-stage', hero && 'has-hero', hero && 'role-' + hero.role.toLowerCase())}>
          {hero && record ? (
            <>
              <HeroPortrait hero={hero} className="nuzlocke-hero-stage__backdrop" decorative />
              <div className="nuzlocke-hero-stage__art"><HeroPortrait hero={hero} decorative /></div>
              <div className="nuzlocke-hero-stage__content">
                <span className="hero-role-pill"><RoleIcon role={hero.role} />{hero.role}</span>
                <span className="stage-label">{activePlayer?.name}&apos;s hero</span>
                <h1>{hero.name}</h1>
                <div className="hero-life-row" aria-label={record.lives + ' hero lives remaining'}>
                  {Array.from({ length: run.rules.livesPerHero }, (_, index) => <Heart key={index} size={17} fill={index < record.lives ? 'currentColor' : 'none'} className={index < record.lives ? 'is-live' : 'is-lost'} />)}
                  <span>{record.lives} of {run.rules.livesPerHero} lives</span>
                </div>
                <span className="player-run-lives"><Flame size={15} />{activePlayer?.remainingLives} personal run lives</span>
                <p>Record the match result. A loss {record.lives <= 1 || run.rules.removeRule === 'both' || run.rules.removeRule === 'loss' ? 'will eliminate this hero.' : 'will remove one hero life.'}</p>
              </div>
            </>
          ) : (
            <div className="current-hero-empty">
              <span>{activePlayer && activePlayer.remainingLives <= 0 ? <Skull size={34} /> : <Shuffle size={34} />}</span><div><small>{activePlayer?.name}</small><h2>{activePlayer && activePlayer.remainingLives <= 0 ? 'Out of run lives' : 'No hero selected'}</h2><p>{activePlayer && activePlayer.remainingLives <= 0 ? 'This player is out, but teammates with personal lives can continue.' : 'Pick the next eligible hero for this player.'}</p></div>{activePlayer && activePlayer.remainingLives > 0 && <button type="button" className="button button--primary" onClick={() => applyRun((current) => pickNextHero(current, activePlayer.id), 'Hero selected for ' + activePlayer.name + '.')}><Shuffle size={18} />Select hero</button>}
            </div>
          )}
        </div>

        <aside className="run-control-panel">
          <header><span className="eyebrow">Record team result</span><h2>How did the match go?</h2><p>The result applies to all {currentHeroes.length} heroes in the active lineup.</p></header>
          <div className="run-result-actions">
            <button type="button" className="run-result run-result--win" onClick={() => recordResult('win')} disabled={!currentHeroes.length}><span><Check size={24} /></span><strong>Win</strong><small>{run.rules.removeRule === 'win' || run.rules.removeRule === 'both' || !run.rules.duplicateSelections ? 'Complete active lineup' : 'Keep heroes available'}</small></button>
            <button type="button" className="run-result run-result--loss" onClick={requestLoss} disabled={!currentHeroes.length}><span><X size={24} /></span><strong>Loss</strong><small>{activePlayers.some((player) => player.currentHero && player.heroRecords[player.currentHero].lives <= 1) || run.rules.removeRule === 'loss' || run.rules.removeRule === 'both' ? 'Eliminate affected lineup' : 'Each hero loses a life'}</small></button>
          </div>
          <div className="run-secondary-actions">
            <button type="button" onClick={() => activePlayer && applyRun((current) => rerollNuzlockeHero(current, 'reroll', activePlayer.id), activePlayer.name + ' rerolled.')} disabled={!hero} title="Reroll the selected player's hero"><RotateCcw size={17} /><span><strong>Reroll</strong><small>{activePlayer?.name}</small></span></button>
            <button type="button" onClick={() => activePlayer && applyRun((current) => rerollNuzlockeHero(current, 'skip', activePlayer.id), activePlayer.name + ' skipped.')} disabled={!hero} title="Skip the selected player's hero without recording a result"><SkipForward size={17} /><span><strong>Skip</strong><small>{activePlayer?.name}</small></span></button>
            <button type="button" onClick={undoLastRunAction} disabled={!run.undoSnapshot} title="Restore the exact run state before the previous action"><Undo2 size={17} /><span><strong>Undo</strong><small>Last action</small></span></button>
          </div>
          <ProgressBar value={winProgress} max={run.rules.requiredWins} label="Win goal" tone="green" />
          <ProgressBar value={run.remainingLives} max={run.rules.totalLives * run.rules.playerCount} label="Party lives" tone={run.remainingLives <= Math.max(2, run.rules.totalLives * run.rules.playerCount * 0.25) ? 'red' : 'orange'} />
          {run.rules.customRules && <div className="custom-rule-note"><Info size={16} /><span><strong>Custom rule</strong><p>{run.rules.customRules}</p></span></div>}
        </aside>
      </section>

      <section className="hero-pool-panel nuzlocke-pool">
        <header className="section-heading"><div><span className="eyebrow">{activePlayer?.name} profile</span><h2>Personal hero pool</h2><p>Lives, wins, and eliminations here belong only to {activePlayer?.name}. Other players keep separate copies.</p></div><span className="selection-counter"><strong>{usedCount}</strong> heroes used</span></header>
        <div className="hero-pool-toolbar">
          <SearchField value={search} onChange={setSearch} />
          <div className="segmented" role="group" aria-label="Filter and enable player roles">{(['All', ...ROLES] as RoleFilter[]).map((role) => {
            const roleEnabled = role === 'All' ? ROLES.every((item) => activeRolePool.includes(item)) : activeRolePool.includes(role);
            return <button type="button" key={role} className={cn(roleFilter === role && 'is-active', !roleEnabled && 'is-addable')} onClick={() => selectRoleFilter(role)} title={roleEnabled ? 'Show ' + role + ' heroes' : 'Enable ' + (role === 'All' ? 'all roles' : role) + ' for ' + activePlayer?.name}>{roleEnabled ? role === 'All' ? 'All roles' : role : role === 'All' ? '+ All roles' : '+ ' + role}</button>;
          })}</div>
          <label className="select-field"><span className="sr-only">Filter run hero status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PoolStatus)}><option value="all">All states</option><option value="available">Available</option><option value="winner">Winners</option><option value="eliminated">Eliminated</option></select><ChevronDown size={15} /></label>
        </div>
        {filteredHeroes.length ? (
          <div className={cn('hero-grid', compactCards && 'is-compact')}>
            {filteredHeroes.map((item) => {
              const state = activeHeroRecords?.[item.name];
              if (!state) return null;
              const status = cardStatus(item.name);
              const occupyingPlayer = activePlayers.find((player) => player.currentHero === item.name);
              const selectedPlayer = status === 'selected' ? occupyingPlayer : undefined;
              const canSelect = selectableNames.has(item.name) && !occupyingPlayer;
              const detail = selectedPlayer ? selectedPlayer.name + ' · ' + state.wins + 'W' : status === 'winner' ? state.wins + ' win' + (state.wins === 1 ? '' : 's') + ' · ' + state.lives + ' ' + (state.lives === 1 ? 'life' : 'lives') : status === 'available' ? state.lives + ' life' + (state.lives === 1 ? '' : 's') + ' · ' + state.wins + 'W ' + state.losses + 'L' : undefined;
              return <HeroCard key={item.name} hero={item} compact={compactCards} status={status} detail={detail} disabled={!canSelect && status !== 'selected'} onSelect={() => pickHero(item.name)} />;
            })}
          </div>
        ) : <EmptyState icon={<Eye size={26} />} title="No heroes match" description="Change a role or state filter to see more of the run roster." />}
      </section>

      <section className="history-panel nuzlocke-history">
        <header className="section-heading"><div><span className="eyebrow">Run timeline</span><h2>Every decision</h2><p>Wins, losses, skips, and rerolls remain visible for the run summary.</p></div></header>
        <div className="run-timeline">
          {[...run.events].reverse().map((event) => (
            <article key={event.id} className={cn('run-event', 'event-' + event.type)}>
              <span className="run-event__icon">{event.type === 'win' ? <Check size={17} /> : event.type === 'loss' ? <Skull size={17} /> : event.type === 'start' ? <Flame size={17} /> : <Shuffle size={17} />}</span>
              <HeroPortrait hero={HERO_BY_NAME[event.hero ?? '']} decorative />
              <span><strong>{event.detail}</strong><small>{eventTime(event.at)} · {event.wins}W–{event.losses}L · {event.remainingLives} lives</small></span>
            </article>
          ))}
        </div>
      </section>

      <nav className="nuzlocke-mobile-actions" aria-label="Nuzlocke match result">
        <button type="button" className="mobile-loss" onClick={requestLoss} disabled={!currentHeroes.length}><X size={22} /><span>Loss</span></button>
        <button type="button" className="mobile-win" onClick={() => recordResult('win')} disabled={!currentHeroes.length}><Check size={22} /><span>Win</span></button>
      </nav>

      <Modal open={settingsOpen} onClose={onSettingsClose} title="Active run settings" eyebrow="Nuzlocke controls" size="drawer">
        <div className="settings-stack">
          <section className="settings-section">
            <h3>Current rules</h3>
            <div className="rule-summary-list">
              <span><small>Roles</small><strong>{run.rules.roles.join(', ')}</strong></span>
              <span><small>Party</small><strong>{run.rules.playerCount} player{run.rules.playerCount === 1 ? '' : 's'}</strong></span>
              <span><small>Removal</small><strong>{run.rules.removeRule === 'both' ? 'Win or loss' : run.rules.removeRule}</strong></span>
              <span><small>Hero lives</small><strong>{run.rules.livesPerHero}</strong></span>
              <span><small>Lives per player</small><strong>{run.rules.totalLives}</strong></span>
              <span><small>Win goal</small><strong>{run.rules.requiredWins}</strong></span>
              <span><small>Duplicates</small><strong>{run.rules.duplicateSelections ? 'Allowed' : 'Off'}</strong></span>
              <span><small>Winners stay selectable</small><strong>{run.rules.reuseCompletedHeroes ? 'On' : 'Off'}</strong></span>
              <span><small>Role queue</small><strong>{run.rules.roleQueue ? 'On' : 'Off'}</strong></span>
            </div>
            {!ROLES.every((role) => activeRolePool.includes(role)) && <button type="button" className="button button--secondary" onClick={enableAllRolesForActivePlayer}><Shield size={16} />Enable all roles for {activePlayer?.name}</button>}
            <div className="active-party-role-list">{activePlayers.map((player) => <span key={player.id}><small>{player.name} · {player.remainingLives} lives</small><strong>{(run.rules.playerRoles[player.id - 1] ?? run.rules.roles).join(' + ')}</strong></span>)}</div>
          </section>
          <section className="settings-section">
            <h3>Display</h3>
            <Toggle checked={run.rules.showEliminated} onChange={updateDisplayRule} title="Show eliminated heroes" description="Keep eliminated cards visible in the roster." />
          </section>
          <section className="settings-section settings-section--danger">
            <h3>End this run</h3><p>The current stats will be saved to your run history. This does not change normal mode.</p>
            <button type="button" className="button button--danger" onClick={() => setEndConfirm(true)}><Skull size={16} />End Nuzlocke run</button>
          </section>
        </div>
      </Modal>

      <ConfirmDialog open={lossConfirm} title="Confirm this loss" message={<p>This team result will update <strong>{currentHeroes.join(', ')}</strong>. Each active player loses one personal run life: {activePlayers.filter((player) => player.currentHero).map((player) => player.name + ' ' + player.remainingLives + '→' + Math.max(0, player.remainingLives - 1)).join(', ')}.</p>} confirmLabel="Record loss" onCancel={() => setLossConfirm(false)} onConfirm={() => { setLossConfirm(false); recordResult('loss'); }} />
      <ConfirmDialog open={endConfirm} title="End this Nuzlocke run?" message={<p>Your results will be archived, but the active run cannot continue unless you use Undo immediately from the results state.</p>} confirmLabel="End run" onCancel={() => setEndConfirm(false)} onConfirm={() => { setEndConfirm(false); onSettingsClose(); if (rankChallenge?.phase === 'active') setRankChallenge(endRankChallenge(rankChallenge, 'nuzlocke-ended')); applyRun(endNuzlockeRun, 'Run ended and archived.'); }} />
    </div>
  );
}

function NuzlockeResults({ run, rankChallenge, onRankStart, onRankChange, compactCards, onRetry, onNewSetup, notify, fail }: { run: NuzlockeRun; rankChallenge: RankChallenge | null; onRankStart: (config: RankChallengeConfig) => void; onRankChange: Dispatch<SetStateAction<RankChallenge | null>>; compactCards: boolean; onRetry: () => void; onNewSetup: () => void; notify: (message: string) => void; fail: (message: string) => void }) {
  const summary = summarizeRun(run);
  const winners = HEROES.filter((hero) => run.players.some((player) => player.heroRecords[hero.name].wins > 0));
  const eliminated = HEROES.filter((hero) => run.players.some((player) => player.heroRecords[hero.name].state === 'eliminated'));
  const remaining = HEROES.filter((hero) => run.rules.roles.includes(hero.role) && !run.rules.excludedHeroes.includes(hero.name) && run.players.some((player) => player.heroRecords[hero.name].state === 'available' && player.heroRecords[hero.name].lives > 0));
  const victory = run.endReason === 'goal';

  const exportImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const context = canvas.getContext('2d');
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 1200, 675);
    gradient.addColorStop(0, victory ? '#071a18' : '#170b13');
    gradient.addColorStop(1, '#0b1321');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 675);
    context.fillStyle = victory ? '#65d6a0' : '#ff9d3d';
    context.font = '800 22px Inter, sans-serif';
    context.fillText('OVERWATCH HERO NUZLOCKE', 70, 78);
    context.fillStyle = '#f8fafc';
    context.font = '800 58px Inter, sans-serif';
    context.fillText(victory ? 'RUN COMPLETE' : 'RUN ENDED', 70, 150);
    context.fillStyle = '#96a4b8';
    context.font = '500 21px Inter, sans-serif';
    context.fillText(endReasonLabel(run.endReason ?? 'ended') + '  ·  ' + formatDuration(summary.durationMs), 72, 192);
    const stats = [
      ['RECORD', run.wins + '–' + run.losses],
      ['HEROES USED', String(summary.heroesUsed)],
      ['WINNING HEROES', String(summary.heroesCompleted)],
      ['ELIMINATED', String(summary.heroesEliminated)],
      ['LONGEST STREAK', String(run.longestStreak)],
      ['PARTY LIVES LEFT', String(run.remainingLives)],
    ];
    stats.forEach(([label, value], index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 70 + column * 355;
      const y = 270 + row * 155;
      context.fillStyle = 'rgba(255,255,255,.06)';
      context.roundRect(x, y, 320, 122, 18);
      context.fill();
      context.fillStyle = '#8fa0b7';
      context.font = '700 14px Inter, sans-serif';
      context.fillText(label, x + 24, y + 36);
      context.fillStyle = '#f8fafc';
      context.font = '800 38px Inter, sans-serif';
      context.fillText(value, x + 24, y + 84);
    });
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = 'ow2-nuzlocke-' + Date.now() + '.png';
    anchor.click();
    notify('Run summary image exported.');
  };

  return (
    <div className="nuzlocke-results">
      <section className={cn('results-hero', victory ? 'is-victory' : 'is-defeat')}>
        <span className="results-hero__icon">{victory ? <Trophy size={38} /> : <Skull size={38} />}</span>
        <span className="eyebrow">{victory ? 'Challenge cleared' : 'Run concluded'}</span>
        <h1>{victory ? 'Nuzlocke complete.' : 'The run is over.'}</h1>
        <p>{endReasonLabel(run.endReason ?? 'ended')}. Your {run.rules.playerCount > 1 ? run.rules.playerCount + '-player party' : 'run'} finished with {run.wins} wins, {run.losses} losses, and {run.remainingLives} total personal lives remaining.</p>
        <div className="results-hero__actions"><button type="button" className="button button--primary button--large" onClick={onRetry}><RotateCcw size={18} />Retry same rules</button><button type="button" className="button button--secondary" onClick={onNewSetup}><Swords size={18} />New setup</button><button type="button" className="button button--glass" onClick={exportImage}><Download size={17} />Share image</button></div>
      </section>

      <RankChallengePanel mode="nuzlocke" challenge={rankChallenge} currentHero={null} onStart={onRankStart} onChange={onRankChange} notify={notify} fail={fail} />

      <section className="metrics-row results-metrics">
        <Metric label="Final record" value={run.wins + '–' + run.losses} detail={Math.round((run.wins / Math.max(1, run.wins + run.losses)) * 100) + '% win rate'} icon={<Trophy size={18} />} />
        <Metric label="Heroes used" value={summary.heroesUsed} detail={winners.length + ' heroes with wins'} icon={<Swords size={18} />} />
        <Metric label="Longest streak" value={run.longestStreak} detail={run.currentStreak + ' final streak'} icon={<Flame size={18} />} />
        <Metric label="Duration" value={formatDuration(summary.durationMs)} detail={remaining.length + ' heroes left'} icon={<History size={18} />} />
      </section>

      <section className="result-rosters">
        <ResultRoster title="Winning heroes" heroes={winners} empty="No heroes recorded a win." status="winner" compact={compactCards} detailForHero={(hero) => { const wins = run.players.reduce((total, player) => total + player.heroRecords[hero.name].wins, 0); return wins + ' win' + (wins === 1 ? '' : 's') + ' across player profiles'; }} />
        <ResultRoster title="Eliminated heroes" heroes={eliminated} empty="No heroes were eliminated." status="eliminated" compact={compactCards} detailForHero={(hero) => run.players.filter((player) => player.heroRecords[hero.name].state === 'eliminated').map((player) => player.name).join(', ')} />
        <ResultRoster title="Remaining heroes" heroes={remaining} empty="No eligible heroes remained." status="available" compact={compactCards} />
      </section>

      <section className="history-panel">
        <header className="section-heading"><div><span className="eyebrow">Complete timeline</span><h2>Run history</h2><p>{run.events.length} recorded decisions and results.</p></div></header>
        <div className="run-timeline">{[...run.events].reverse().map((event) => <article key={event.id} className={cn('run-event', 'event-' + event.type)}><span className="run-event__icon">{event.type === 'win' ? <Check size={17} /> : event.type === 'loss' ? <Skull size={17} /> : <Sparkles size={17} />}</span><HeroPortrait hero={HERO_BY_NAME[event.hero ?? '']} decorative /><span><strong>{event.detail}</strong><small>{eventTime(event.at)} · {event.wins}W–{event.losses}L · {event.remainingLives} lives</small></span></article>)}</div>
      </section>
    </div>
  );
}

function ResultRoster({ title, heroes, empty, status, compact, detailForHero }: { title: string; heroes: typeof HEROES; empty: string; status: HeroCardStatus; compact: boolean; detailForHero?: (hero: (typeof HEROES)[number]) => string }) {
  return (
    <section className="result-roster"><header><h2>{title}</h2><span>{heroes.length}</span></header>{heroes.length ? <div className={cn('hero-grid', 'result-hero-grid', compact && 'is-compact')}>{heroes.map((hero) => <HeroCard key={hero.name} hero={hero} compact status={status} detail={detailForHero?.(hero)} disabled />)}</div> : <p>{empty}</p>}</section>
  );
}
