import { useState, type Dispatch, type SetStateAction } from 'react';
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
  pickNextHero,
  recordNuzlockeResult,
  rerollNuzlockeHero,
  summarizeRun,
  undoNuzlockeAction,
} from '../lib/nuzlocke';
import type { NuzlockeRun, NuzlockeStore, RoleFilter } from '../types';
import NuzlockeSetup from './NuzlockeSetup';
import { ConfirmDialog, EmptyState, HeroCard, HeroPortrait, Metric, Modal, ProgressBar, RoleIcon, SearchField, Toggle, cn, type HeroCardStatus } from './ui';

type Props = {
  store: NuzlockeStore;
  setStore: Dispatch<SetStateAction<NuzlockeStore>>;
  settingsOpen: boolean;
  onSettingsClose: () => void;
  compactCards: boolean;
  notify: (message: string) => void;
  fail: (message: string) => void;
};

type PoolStatus = 'all' | 'available' | 'completed' | 'eliminated' | 'recent';

function eventTime(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function NuzlockeMode({ store, setStore, settingsOpen, onSettingsClose, compactCards, notify, fail }: Props) {
  const run = store.currentRun;
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [statusFilter, setStatusFilter] = useState<PoolStatus>('all');
  const [lossConfirm, setLossConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);

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
    if (!created.currentHero && created.phase === 'completed') {
      fail('No eligible heroes are available for these rules.');
      return;
    }
    setStore((current) => ({ ...current, currentRun: created }));
    notify('Nuzlocke run started.');
  };

  if (!run) {
    return <NuzlockeSetup rules={store.draftRules} history={store.runHistory} compactCards={compactCards} onRulesChange={(draftRules) => setStore((current) => ({ ...current, draftRules }))} onStart={startRun} fail={fail} />;
  }

  if (run.phase === 'completed') {
    return <NuzlockeResults run={run} compactCards={compactCards} onRetry={() => { const created = createNuzlockeRun(run.rules); setStore((current) => ({ ...current, draftRules: run.rules, currentRun: created })); notify('New attempt started with the same rules.'); }} onNewSetup={() => setStore((current) => ({ ...current, draftRules: run.rules, currentRun: null }))} notify={notify} />;
  }

  const hero = HERO_BY_NAME[run.currentHero ?? ''];
  const record = hero ? run.heroRecords[hero.name] : null;
  const eligible = getEligibleHeroes(run);
  const eligibleNames = new Set(eligible.map((item) => item.name));
  const completedCount = Object.values(run.heroRecords).filter((item) => item.state === 'completed').length;
  const eliminatedCount = Object.values(run.heroRecords).filter((item) => item.state === 'eliminated').length;
  const usedCount = Object.values(run.heroRecords).filter((item) => item.selections > 0).length;
  const winProgress = Math.min(run.wins, run.rules.requiredWins);

  const cardStatus = (heroName: string): HeroCardStatus => {
    const item = HERO_BY_NAME[heroName];
    const state = run.heroRecords[heroName];
    if (run.currentHero === heroName) return 'selected';
    if (!run.rules.roles.includes(item.role)) return 'locked';
    if (run.rules.excludedHeroes.includes(heroName)) return 'excluded';
    if (state.lives <= 0) return 'out';
    if (state.state === 'completed') return 'completed';
    if (state.state === 'eliminated') return 'eliminated';
    if (state.selections > 0) return 'recent';
    return 'available';
  };

  const filteredHeroes = HEROES.filter((item) => {
    if (!run.rules.showEliminated && run.heroRecords[item.name].state === 'eliminated') return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'All' && item.role !== roleFilter) return false;
    const status = cardStatus(item.name);
    if (statusFilter === 'available' && status !== 'available' && status !== 'selected') return false;
    if (statusFilter === 'completed' && status !== 'completed') return false;
    if (statusFilter === 'eliminated' && status !== 'eliminated' && status !== 'out') return false;
    if (statusFilter === 'recent' && status !== 'recent') return false;
    return true;
  });

  const recordResult = (result: 'win' | 'loss') => {
    if (!run.currentHero) return;
    applyRun((current) => recordNuzlockeResult(current, result), result === 'win' ? 'Win recorded.' : 'Loss recorded.');
  };

  const requestLoss = () => {
    if (!record) return;
    if (record.lives <= 1 || run.remainingLives <= 1 || run.rules.removeRule === 'loss' || run.rules.removeRule === 'both') {
      setLossConfirm(true);
      return;
    }
    recordResult('loss');
  };

  const pickHero = (name: string) => {
    if (run.currentHero === name) return;
    if (!eligibleNames.has(name)) {
      fail('That hero is not eligible under the current run rules.');
      return;
    }
    applyRun((current) => chooseNuzlockeHero(current, name), name + ' selected.');
  };

  const updateDisplayRule = (showEliminated: boolean) => {
    setStore((current) => current.currentRun ? {
      ...current,
      draftRules: { ...current.draftRules, showEliminated },
      currentRun: { ...current.currentRun, rules: { ...current.currentRun.rules, showEliminated } },
    } : current);
  };

  return (
    <div className="mode-page nuzlocke-active">
      <section className="run-banner">
        <div><span className="run-live-dot" /><span><small>Nuzlocke run in progress</small><strong>Win {run.rules.requiredWins - run.wins} more match{run.rules.requiredWins - run.wins === 1 ? '' : 'es'} to complete the run</strong></span></div>
        <span className="run-banner__time">Started {new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </section>

      <section className="metrics-row nuzlocke-metrics" aria-label="Run summary">
        <Metric label="Record" value={run.wins + '–' + run.losses} detail={'longest streak ' + run.longestStreak} icon={<Trophy size={18} />} />
        <Metric label="Run lives" value={run.remainingLives} detail={'started with ' + run.rules.totalLives} icon={<Heart size={18} />} />
        <Metric label="Eligible" value={eligible.length + (run.currentHero ? 1 : 0)} detail={eliminatedCount + ' eliminated'} icon={<Shield size={18} />} />
        <Metric label="Progress" value={Math.round((run.wins / run.rules.requiredWins) * 100) + '%'} detail={completedCount + ' completed'} icon={<Target size={18} />} />
      </section>

      <section className="nuzlocke-stage-layout">
        <div className={cn('nuzlocke-hero-stage', hero && 'has-hero', hero && 'role-' + hero.role.toLowerCase())}>
          {hero && record ? (
            <>
              <HeroPortrait hero={hero} className="nuzlocke-hero-stage__backdrop" decorative />
              <div className="nuzlocke-hero-stage__art"><HeroPortrait hero={hero} decorative /></div>
              <div className="nuzlocke-hero-stage__content">
                <span className="hero-role-pill"><RoleIcon role={hero.role} />{hero.role}</span>
                <span className="stage-label">Current hero</span>
                <h1>{hero.name}</h1>
                <div className="hero-life-row" aria-label={record.lives + ' hero lives remaining'}>
                  {Array.from({ length: run.rules.livesPerHero }, (_, index) => <Heart key={index} size={17} fill={index < record.lives ? 'currentColor' : 'none'} className={index < record.lives ? 'is-live' : 'is-lost'} />)}
                  <span>{record.lives} of {run.rules.livesPerHero} lives</span>
                </div>
                <p>Record the match result. A loss {record.lives <= 1 || run.rules.removeRule === 'both' || run.rules.removeRule === 'loss' ? 'will eliminate this hero.' : 'will remove one hero life.'}</p>
              </div>
            </>
          ) : (
            <div className="current-hero-empty">
              <span><Shuffle size={34} /></span><div><small>Next encounter</small><h2>No hero selected</h2><p>Pick the next eligible hero to continue.</p></div><button type="button" className="button button--primary" onClick={() => applyRun(pickNextHero, 'Next hero selected.')}><Shuffle size={18} />Select hero</button>
            </div>
          )}
        </div>

        <aside className="run-control-panel">
          <header><span className="eyebrow">Record result</span><h2>How did the match go?</h2><p>These actions immediately update lives and hero status.</p></header>
          <div className="run-result-actions">
            <button type="button" className="run-result run-result--win" onClick={() => recordResult('win')} disabled={!hero}><span><Check size={24} /></span><strong>Win</strong><small>{run.rules.removeRule === 'win' || run.rules.removeRule === 'both' || !run.rules.duplicateSelections ? 'Complete this hero' : 'Keep hero available'}</small></button>
            <button type="button" className="run-result run-result--loss" onClick={requestLoss} disabled={!hero}><span><X size={24} /></span><strong>Loss</strong><small>{record && (record.lives <= 1 || run.rules.removeRule === 'loss' || run.rules.removeRule === 'both') ? 'Eliminate this hero' : 'Lose one hero life'}</small></button>
          </div>
          <div className="run-secondary-actions">
            <button type="button" onClick={() => applyRun((current) => rerollNuzlockeHero(current, 'reroll'), 'Hero rerolled.')} disabled={!hero} title="Return this pick and draw another eligible hero"><RotateCcw size={17} /><span><strong>Reroll</strong><small>Draw another</small></span></button>
            <button type="button" onClick={() => applyRun((current) => rerollNuzlockeHero(current, 'skip'), 'Hero skipped.')} disabled={!hero} title="Skip without recording a win or loss"><SkipForward size={17} /><span><strong>Skip</strong><small>No result</small></span></button>
            <button type="button" onClick={() => applyRun(undoNuzlockeAction, 'Last action undone.')} disabled={!run.undoSnapshot} title="Restore the exact run state before the previous action"><Undo2 size={17} /><span><strong>Undo</strong><small>Last action</small></span></button>
          </div>
          <ProgressBar value={winProgress} max={run.rules.requiredWins} label="Win goal" tone="green" />
          <ProgressBar value={run.remainingLives} max={run.rules.totalLives} label="Run lives" tone={run.remainingLives <= Math.max(2, run.rules.totalLives * 0.25) ? 'red' : 'orange'} />
          {run.rules.customRules && <div className="custom-rule-note"><Info size={16} /><span><strong>Custom rule</strong><p>{run.rules.customRules}</p></span></div>}
        </aside>
      </section>

      <section className="hero-pool-panel nuzlocke-pool">
        <header className="section-heading"><div><span className="eyebrow">Run roster</span><h2>Hero states</h2><p>Available, completed, and eliminated heroes update as you play.</p></div><span className="selection-counter"><strong>{usedCount}</strong> heroes used</span></header>
        <div className="hero-pool-toolbar">
          <SearchField value={search} onChange={setSearch} />
          <div className="segmented" role="group" aria-label="Filter run roster by role">{(['All', ...ROLES] as RoleFilter[]).map((role) => <button type="button" key={role} className={roleFilter === role ? 'is-active' : ''} onClick={() => setRoleFilter(role)}>{role}</button>)}</div>
          <label className="select-field"><span className="sr-only">Filter run hero status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PoolStatus)}><option value="all">All states</option><option value="available">Available</option><option value="completed">Completed</option><option value="eliminated">Eliminated</option><option value="recent">Recently used</option></select><ChevronDown size={15} /></label>
        </div>
        {filteredHeroes.length ? (
          <div className={cn('hero-grid', compactCards && 'is-compact')}>
            {filteredHeroes.map((item) => {
              const state = run.heroRecords[item.name];
              const status = cardStatus(item.name);
              const selectable = eligibleNames.has(item.name) && run.currentHero !== item.name;
              const detail = status === 'available' || status === 'recent' ? state.lives + ' life' + (state.lives === 1 ? '' : 's') + ' · ' + state.wins + 'W ' + state.losses + 'L' : undefined;
              return <HeroCard key={item.name} hero={item} compact={compactCards} status={status} detail={detail} disabled={!selectable && status !== 'selected'} onSelect={() => pickHero(item.name)} />;
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
        <button type="button" className="mobile-loss" onClick={requestLoss} disabled={!hero}><X size={22} /><span>Loss</span></button>
        <button type="button" className="mobile-win" onClick={() => recordResult('win')} disabled={!hero}><Check size={22} /><span>Win</span></button>
      </nav>

      <Modal open={settingsOpen} onClose={onSettingsClose} title="Active run settings" eyebrow="Nuzlocke controls" size="drawer">
        <div className="settings-stack">
          <section className="settings-section">
            <h3>Current rules</h3>
            <div className="rule-summary-list">
              <span><small>Roles</small><strong>{run.rules.roles.join(', ')}</strong></span>
              <span><small>Removal</small><strong>{run.rules.removeRule === 'both' ? 'Win or loss' : run.rules.removeRule}</strong></span>
              <span><small>Hero lives</small><strong>{run.rules.livesPerHero}</strong></span>
              <span><small>Win goal</small><strong>{run.rules.requiredWins}</strong></span>
              <span><small>Duplicates</small><strong>{run.rules.duplicateSelections ? 'Allowed' : 'Off'}</strong></span>
              <span><small>Role queue</small><strong>{run.rules.roleQueue ? 'On' : 'Off'}</strong></span>
            </div>
          </section>
          <section className="settings-section">
            <h3>Display</h3>
            <Toggle checked={run.rules.showEliminated} onChange={updateDisplayRule} title="Show eliminated heroes" description="Keep eliminated cards visible in the roster." />
          </section>
          <section className="settings-section settings-section--danger">
            <h3>End this run</h3><p>The current stats will be saved to your recent run history. This does not change normal mode.</p>
            <button type="button" className="button button--danger" onClick={() => setEndConfirm(true)}><Skull size={16} />End Nuzlocke run</button>
          </section>
        </div>
      </Modal>

      <ConfirmDialog open={lossConfirm} title="Confirm this loss" message={<p>This result will {record && record.lives <= 1 ? <strong>use {hero?.name}&apos;s final life</strong> : <strong>remove {hero?.name} from the run</strong>}. It will also reduce the shared run lives to {Math.max(0, run.remainingLives - 1)}.</p>} confirmLabel="Record loss" onCancel={() => setLossConfirm(false)} onConfirm={() => { setLossConfirm(false); recordResult('loss'); }} />
      <ConfirmDialog open={endConfirm} title="End this Nuzlocke run?" message={<p>Your results will be archived, but the active run cannot continue unless you use Undo immediately from the results state.</p>} confirmLabel="End run" onCancel={() => setEndConfirm(false)} onConfirm={() => { setEndConfirm(false); onSettingsClose(); applyRun(endNuzlockeRun, 'Run ended and archived.'); }} />
    </div>
  );
}

function NuzlockeResults({ run, compactCards, onRetry, onNewSetup, notify }: { run: NuzlockeRun; compactCards: boolean; onRetry: () => void; onNewSetup: () => void; notify: (message: string) => void }) {
  const summary = summarizeRun(run);
  const completed = HEROES.filter((hero) => run.heroRecords[hero.name].state === 'completed');
  const eliminated = HEROES.filter((hero) => run.heroRecords[hero.name].state === 'eliminated');
  const remaining = HEROES.filter((hero) => run.rules.roles.includes(hero.role) && !run.rules.excludedHeroes.includes(hero.name) && run.heroRecords[hero.name].state === 'available' && run.heroRecords[hero.name].lives > 0);
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
      ['COMPLETED', String(summary.heroesCompleted)],
      ['ELIMINATED', String(summary.heroesEliminated)],
      ['LONGEST STREAK', String(run.longestStreak)],
      ['LIVES LEFT', String(run.remainingLives)],
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
        <p>{endReasonLabel(run.endReason ?? 'ended')}. You finished with {run.wins} wins, {run.losses} losses, and {run.remainingLives} shared lives remaining.</p>
        <div className="results-hero__actions"><button type="button" className="button button--primary button--large" onClick={onRetry}><RotateCcw size={18} />Retry same rules</button><button type="button" className="button button--secondary" onClick={onNewSetup}><Swords size={18} />New setup</button><button type="button" className="button button--glass" onClick={exportImage}><Download size={17} />Share image</button></div>
      </section>

      <section className="metrics-row results-metrics">
        <Metric label="Final record" value={run.wins + '–' + run.losses} detail={Math.round((run.wins / Math.max(1, run.wins + run.losses)) * 100) + '% win rate'} icon={<Trophy size={18} />} />
        <Metric label="Heroes used" value={summary.heroesUsed} detail={completed.length + ' completed'} icon={<Swords size={18} />} />
        <Metric label="Longest streak" value={run.longestStreak} detail={run.currentStreak + ' final streak'} icon={<Flame size={18} />} />
        <Metric label="Duration" value={formatDuration(summary.durationMs)} detail={remaining.length + ' heroes left'} icon={<History size={18} />} />
      </section>

      <section className="result-rosters">
        <ResultRoster title="Completed heroes" heroes={completed} empty="No heroes were completed." status="completed" compact={compactCards} />
        <ResultRoster title="Eliminated heroes" heroes={eliminated} empty="No heroes were eliminated." status="eliminated" compact={compactCards} />
        <ResultRoster title="Remaining heroes" heroes={remaining} empty="No eligible heroes remained." status="available" compact={compactCards} />
      </section>

      <section className="history-panel">
        <header className="section-heading"><div><span className="eyebrow">Complete timeline</span><h2>Run history</h2><p>{run.events.length} recorded decisions and results.</p></div></header>
        <div className="run-timeline">{[...run.events].reverse().map((event) => <article key={event.id} className={cn('run-event', 'event-' + event.type)}><span className="run-event__icon">{event.type === 'win' ? <Check size={17} /> : event.type === 'loss' ? <Skull size={17} /> : <Sparkles size={17} />}</span><HeroPortrait hero={HERO_BY_NAME[event.hero ?? '']} decorative /><span><strong>{event.detail}</strong><small>{eventTime(event.at)} · {event.wins}W–{event.losses}L · {event.remainingLives} lives</small></span></article>)}</div>
      </section>
    </div>
  );
}

function ResultRoster({ title, heroes, empty, status, compact }: { title: string; heroes: typeof HEROES; empty: string; status: HeroCardStatus; compact: boolean }) {
  return (
    <section className="result-roster"><header><h2>{title}</h2><span>{heroes.length}</span></header>{heroes.length ? <div className={cn('hero-grid', 'result-hero-grid', compact && 'is-compact')}>{heroes.map((hero) => <HeroCard key={hero.name} hero={hero} compact status={status} disabled />)}</div> : <p>{empty}</p>}</section>
  );
}
