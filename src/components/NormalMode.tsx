import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Check,
  ChevronDown,
  Clipboard,
  Download,
  Edit3,
  Filter,
  History,
  RotateCcw,
  Shuffle,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { HEROES, HERO_BY_NAME, ROLES } from '../data/heroes';
import { createRankChallenge, endRankChallenge, recordRankChallengeResult, undoRankChallenge } from '../lib/rankChallenge';
import type { NormalSession, PlayerId, RankChallenge, RankChallengeConfig, RoleFilter } from '../types';
import { createDefaultNormalSession } from '../lib/storage';
import RankChallengePanel from './RankChallengePanel';
import { ConfirmDialog, EmptyState, HeroCard, HeroPortrait, Metric, Modal, ProgressBar, RoleIcon, SearchField, Toggle, cn, type HeroCardStatus } from './ui';

type Props = {
  session: NormalSession;
  setSession: Dispatch<SetStateAction<NormalSession>>;
  rankChallenge: RankChallenge | null;
  setRankChallenge: Dispatch<SetStateAction<RankChallenge | null>>;
  settingsOpen: boolean;
  onSettingsClose: () => void;
  compactCards: boolean;
  notify: (message: string) => void;
  fail: (message: string) => void;
};

type PoolStatus = 'all' | 'available' | 'selected' | 'completed' | 'excluded';

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function relativeTime(at: number) {
  const diff = Date.now() - at;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return new Date(at).toLocaleDateString();
}

export default function NormalMode({ session, setSession, rankChallenge, setRankChallenge, settingsOpen, onSettingsClose, compactCards, notify, fail }: Props) {
  const [activePlayerId, setActivePlayerId] = useState<PlayerId>(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [statusFilter, setStatusFilter] = useState<PoolStatus>('all');
  const [poolEditing, setPoolEditing] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const activePlayers = session.players.slice(0, session.playerCount);
  const activePlayer = activePlayers.find((player) => player.id === activePlayerId) ?? activePlayers[0];
  const currentHero = HERO_BY_NAME[activePlayer.currentHero ?? ''];
  const wins = session.matches.filter((match) => match.result === 'W').length;
  const losses = session.matches.length - wins;
  const winRate = session.matches.length ? Math.round((wins / session.matches.length) * 100) : 0;
  const completedTotal = activePlayers.reduce((sum, player) => sum + player.completedHeroes.length, 0);

  const selectedNames = useMemo(
    () => new Set(activePlayers.map((player) => player.currentHero).filter((hero): hero is string => !!hero)),
    [activePlayers],
  );

  const filteredHeroes = useMemo(() => HEROES.filter((hero) => {
    if (search && !hero.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'All' && hero.role !== roleFilter) return false;
    const excluded = session.excludedHeroes.includes(hero.name);
    const selected = selectedNames.has(hero.name);
    const completed = activePlayer.completedHeroes.includes(hero.name);
    if (statusFilter === 'available' && (excluded || completed || (session.uniqueHeroes && selected))) return false;
    if (statusFilter === 'selected' && !selected) return false;
    if (statusFilter === 'completed' && !completed) return false;
    if (statusFilter === 'excluded' && !excluded) return false;
    return true;
  }), [activePlayer.completedHeroes, roleFilter, search, selectedNames, session.excludedHeroes, session.uniqueHeroes, statusFilter]);

  const updatePlayer = (id: PlayerId, patch: Partial<(typeof session.players)[number]>) => {
    setSession((current) => ({
      ...current,
      players: current.players.map((player) => player.id === id ? { ...player, ...patch } : player),
    }));
  };

  const candidatePool = (playerId: PlayerId, taken: Set<string>) => {
    const player = session.players.find((item) => item.id === playerId);
    if (!player) return [];
    return HEROES.filter((hero) => {
      if (player.role !== 'All' && hero.role !== player.role) return false;
      if (session.excludedHeroes.includes(hero.name)) return false;
      if (player.completedHeroes.includes(hero.name)) return false;
      if (session.uniqueHeroes && taken.has(hero.name)) return false;
      return true;
    });
  };

  const weightedPick = (pool: typeof HEROES) => {
    const weighted = pool.flatMap((hero) => session.favoriteHeroes.includes(hero.name) ? [hero, hero, hero] : [hero]);
    return weighted.length ? randomItem(weighted) : null;
  };

  const rollLineup = () => {
    setRolling(true);
    window.setTimeout(() => {
      setSession((current) => {
        const taken = new Set<string>();
        let picked = 0;
        const players = current.players.map((player) => {
          if (player.id > current.playerCount) return player;
          const pool = HEROES.filter((hero) => {
            if (player.role !== 'All' && hero.role !== player.role) return false;
            if (current.excludedHeroes.includes(hero.name)) return false;
            if (player.completedHeroes.includes(hero.name)) return false;
            if (current.uniqueHeroes && taken.has(hero.name)) return false;
            return true;
          });
          const weighted = pool.flatMap((hero) => current.favoriteHeroes.includes(hero.name) ? [hero, hero, hero] : [hero]);
          const hero = weighted.length ? randomItem(weighted) : null;
          if (hero) {
            taken.add(hero.name);
            picked += 1;
          }
          return { ...player, currentHero: hero?.name ?? null };
        });
        if (picked === 0) window.setTimeout(() => fail('No eligible heroes. Check player roles, exclusions, and completed heroes.'), 0);
        else window.setTimeout(() => notify('Fresh lineup ready.'), 0);
        return { ...current, players };
      });
      setRolling(false);
    }, 320);
  };

  const rerollPlayer = (id: PlayerId) => {
    const taken = new Set(activePlayers.filter((player) => player.id !== id).map((player) => player.currentHero).filter((hero): hero is string => !!hero));
    const pick = weightedPick(candidatePool(id, taken));
    if (!pick) {
      fail('No eligible hero is available for this player.');
      return;
    }
    updatePlayer(id, { currentHero: pick.name });
    notify(pick.name + ' selected.');
  };

  const selectHero = (heroName: string) => {
    if (poolEditing) {
      setSession((current) => ({
        ...current,
        excludedHeroes: current.excludedHeroes.includes(heroName)
          ? current.excludedHeroes.filter((name) => name !== heroName)
          : [...current.excludedHeroes, heroName],
      }));
      return;
    }
    if (session.excludedHeroes.includes(heroName)) {
      fail('This hero is excluded. Use Manage pool to include them again.');
      return;
    }
    const usedBy = activePlayers.find((player) => player.id !== activePlayer.id && player.currentHero === heroName);
    if (session.uniqueHeroes && usedBy) {
      fail(heroName + ' is already assigned to ' + usedBy.name + '.');
      return;
    }
    updatePlayer(activePlayer.id, { currentHero: heroName });
    notify(heroName + ' assigned to ' + activePlayer.name + '.');
  };

  const toggleFavorite = (heroName: string) => {
    setSession((current) => ({
      ...current,
      favoriteHeroes: current.favoriteHeroes.includes(heroName)
        ? current.favoriteHeroes.filter((name) => name !== heroName)
        : [...current.favoriteHeroes, heroName],
    }));
  };

  const toggleComplete = () => {
    if (!activePlayer.currentHero) return;
    const heroName = activePlayer.currentHero;
    const wasComplete = activePlayer.completedHeroes.includes(heroName);
    setSession((current) => ({
      ...current,
      completionStreak: wasComplete ? 0 : current.completionStreak + 1,
      bestCompletionStreak: wasComplete ? current.bestCompletionStreak : Math.max(current.bestCompletionStreak, current.completionStreak + 1),
      players: current.players.map((player) => player.id !== activePlayer.id ? player : {
        ...player,
        completedHeroes: wasComplete ? player.completedHeroes.filter((name) => name !== heroName) : [...player.completedHeroes, heroName],
      }),
    }));
    notify(wasComplete ? 'Completion removed.' : heroName + ' marked complete.');
  };

  const recordMatch = (result: 'W' | 'L') => {
    const challengeAfterResult = rankChallenge?.phase === 'active'
      ? recordRankChallengeResult(rankChallenge, result, activePlayer.currentHero)
      : rankChallenge;
    if (challengeAfterResult) setRankChallenge(challengeAfterResult);
    setSession((current) => ({
      ...current,
      matches: [...current.matches, {
        id: 'match-' + Date.now(),
        at: Date.now(),
        result,
        heroes: current.players.slice(0, current.playerCount).map((player) => ({ player: player.name, hero: player.currentHero, role: player.role })),
        rankPlayerId: rankChallenge?.phase === 'active' ? activePlayer.id : undefined,
      }],
      players: challengeAfterResult?.phase === 'active' && challengeAfterResult.config.randomizeAfterMatch
        ? current.players.map((player) => {
            if (player.id !== activePlayer.id) return player;
            const taken = new Set(current.players.slice(0, current.playerCount).filter((item) => item.id !== player.id).map((item) => item.currentHero).filter((hero): hero is string => !!hero));
            let pool = HEROES.filter((hero) => {
              if (player.role !== 'All' && hero.role !== player.role) return false;
              if (current.excludedHeroes.includes(hero.name) || player.completedHeroes.includes(hero.name)) return false;
              if (current.uniqueHeroes && taken.has(hero.name)) return false;
              return true;
            });
            if (pool.length > 1) pool = pool.filter((hero) => hero.name !== player.currentHero);
            const weighted = pool.flatMap((hero) => current.favoriteHeroes.includes(hero.name) ? [hero, hero, hero] : [hero]);
            return { ...player, currentHero: weighted.length ? randomItem(weighted).name : player.currentHero };
          })
        : current.players,
    }));
    notify(challengeAfterResult?.phase === 'completed' ? 'Result recorded — Rank Challenge complete.' : result === 'W' ? 'Win recorded.' : 'Loss recorded.');
  };

  const undoMatch = () => {
    if (!session.matches.length) return;
    const challengeResultUndo = rankChallenge?.undoAction === 'result';
    setSession((current) => {
      const lastMatch = current.matches[current.matches.length - 1];
      const randomizedPlayerId = lastMatch?.rankPlayerId ?? activePlayer.id;
      const previousHero = lastMatch?.heroes[current.players.slice(0, current.playerCount).findIndex((player) => player.id === randomizedPlayerId)]?.hero ?? null;
      return {
        ...current,
        matches: current.matches.slice(0, -1),
        players: challengeResultUndo && rankChallenge?.config.randomizeAfterMatch
          ? current.players.map((player) => player.id === randomizedPlayerId ? { ...player, currentHero: previousHero } : player)
          : current.players,
      };
    });
    if (challengeResultUndo && rankChallenge) setRankChallenge(undoRankChallenge(rankChallenge));
    notify('Last result removed.');
  };

  const startRankChallenge = (config: RankChallengeConfig) => {
    const role: RoleFilter = config.queue === 'Tank' || config.queue === 'Damage' || config.queue === 'Support' ? config.queue : 'All';
    const taken = new Set(activePlayers.filter((player) => player.id !== activePlayer.id).map((player) => player.currentHero).filter((hero): hero is string => !!hero));
    const pool = HEROES.filter((hero) => {
      if (role !== 'All' && hero.role !== role) return false;
      if (session.excludedHeroes.includes(hero.name) || activePlayer.completedHeroes.includes(hero.name)) return false;
      if (session.uniqueHeroes && taken.has(hero.name)) return false;
      return true;
    });
    const pick = weightedPick(pool);
    if (!pick) {
      fail('No eligible hero is available for that Rank Challenge queue.');
      return;
    }
    updatePlayer(activePlayer.id, { role, currentHero: pick.name });
    setRankChallenge(createRankChallenge('normal', config));
    notify('Rank Challenge started with ' + pick.name + '.');
  };

  const copyLineup = async () => {
    const text = activePlayers.map((player) => player.name + ': ' + (player.currentHero ?? 'No hero')).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify('Lineup copied.');
    } catch {
      fail('Clipboard access is unavailable in this browser.');
    }
  };

  const exportImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const context = canvas.getContext('2d');
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 1200, 675);
    gradient.addColorStop(0, '#08101c');
    gradient.addColorStop(1, '#18151a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 675);
    context.fillStyle = '#ff9d3d';
    context.font = '800 22px Inter, sans-serif';
    context.fillText('HERO SELECTOR', 64, 72);
    context.fillStyle = '#f8fafc';
    context.font = '800 46px Inter, sans-serif';
    context.fillText('Session lineup', 64, 126);
    context.fillStyle = '#91a0b5';
    context.font = '500 20px Inter, sans-serif';
    context.fillText(wins + ' wins  ·  ' + losses + ' losses  ·  ' + completedTotal + ' heroes completed', 64, 166);
    activePlayers.forEach((player, index) => {
      const y = 220 + index * 78;
      context.fillStyle = 'rgba(255,255,255,.06)';
      context.roundRect(64, y, 1072, 62, 16);
      context.fill();
      context.fillStyle = '#f8fafc';
      context.font = '700 20px Inter, sans-serif';
      context.fillText(player.name, 88, y + 38);
      context.fillStyle = '#ffb361';
      context.fillText(player.currentHero ?? 'No hero selected', 390, y + 38);
      context.fillStyle = '#91a0b5';
      context.font = '600 16px Inter, sans-serif';
      context.fillText(player.role, 990, y + 38);
    });
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = 'ow2-lineup-' + Date.now() + '.png';
    anchor.click();
    notify('Lineup image exported.');
  };

  const cardStatus = (heroName: string): HeroCardStatus => {
    if (session.excludedHeroes.includes(heroName)) return 'excluded';
    if (activePlayer.currentHero === heroName) return 'selected';
    if (activePlayer.completedHeroes.includes(heroName)) return 'completed';
    if (selectedNames.has(heroName)) return 'locked';
    return 'available';
  };

  return (
    <div className="mode-page normal-mode">
      <section className="mode-intro">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Classic selector</span>
          <h1>Build a lineup without the clutter.</h1>
          <p>Roll a full team or focus on one player. Your exclusions, results, and completed heroes stay saved automatically.</p>
        </div>
        <div className="mode-intro__actions">
          <button type="button" className="button button--primary button--large" onClick={rollLineup} disabled={rolling}><Shuffle size={19} />{rolling ? 'Rolling…' : 'Roll lineup'}</button>
          <button type="button" className="button button--secondary" onClick={() => rerollPlayer(activePlayer.id)}><Swords size={18} />Roll {activePlayer.name}</button>
        </div>
      </section>

      <section className="metrics-row" aria-label="Session summary">
        <Metric label="Lineup" value={activePlayers.filter((player) => player.currentHero).length + '/' + activePlayers.length} detail="heroes ready" icon={<Users size={18} />} />
        <Metric label="Record" value={wins + '–' + losses} detail={winRate + '% win rate'} icon={<Trophy size={18} />} />
        <Metric label="Completed" value={completedTotal} detail={'best streak ' + session.bestCompletionStreak} icon={<Target size={18} />} />
      </section>

      <RankChallengePanel mode="normal" challenge={rankChallenge} currentHero={activePlayer.currentHero} onStart={startRankChallenge} onChange={setRankChallenge} notify={notify} fail={fail} />

      <section className="normal-dashboard">
        <div className={cn('current-hero-panel', currentHero && 'has-hero', currentHero && 'role-' + currentHero.role.toLowerCase())}>
          {currentHero ? (
            <>
              <HeroPortrait hero={currentHero} className="current-hero-panel__backdrop" decorative />
              <div className="current-hero-panel__art"><HeroPortrait hero={currentHero} decorative /></div>
              <div className="current-hero-panel__content">
                <span className="hero-role-pill"><RoleIcon role={currentHero.role} />{currentHero.role}</span>
                <span className="current-hero-panel__player">Current pick for {activePlayer.name}</span>
                <h2>{currentHero.name}</h2>
                <p>{activePlayer.completedHeroes.includes(currentHero.name) ? 'Completed for this player. You can undo it or choose another hero.' : 'Ready for the next match.'}</p>
                <div className="current-hero-panel__actions">
                  <button type="button" className={cn('button', activePlayer.completedHeroes.includes(currentHero.name) ? 'button--success' : 'button--primary')} onClick={toggleComplete}><Check size={18} />{activePlayer.completedHeroes.includes(currentHero.name) ? 'Completed' : 'Mark completed'}</button>
                  <button type="button" className="button button--glass" onClick={() => rerollPlayer(activePlayer.id)}><RotateCcw size={17} />Reroll</button>
                  <button type="button" className="button button--glass" onClick={() => document.getElementById('normal-hero-pool')?.scrollIntoView({ behavior: 'smooth' })}><Edit3 size={17} />Choose hero</button>
                </div>
              </div>
            </>
          ) : (
            <div className="current-hero-empty">
              <span><Shuffle size={34} /></span>
              <div><small>{activePlayer.name}</small><h2>Ready for a hero</h2><p>Roll randomly or choose from the pool below.</p></div>
              <button type="button" className="button button--primary" onClick={() => rerollPlayer(activePlayer.id)}><Shuffle size={18} />Roll hero</button>
            </div>
          )}
        </div>

        <aside className="lineup-rail" aria-label="Player lineup">
          <header className="panel-heading"><div><span className="eyebrow">Active lineup</span><h2>Players</h2></div><button type="button" className="icon-button" onClick={() => setSession((current) => ({ ...current, players: current.players.map((player) => ({ ...player, currentHero: null })) }))} title="Clear lineup" aria-label="Clear lineup"><RotateCcw size={17} /></button></header>
          <div className="player-slot-list">
            {activePlayers.map((player) => {
              const hero = HERO_BY_NAME[player.currentHero ?? ''];
              return (
                <button type="button" key={player.id} className={cn('player-slot', player.id === activePlayer.id && 'is-active')} onClick={() => setActivePlayerId(player.id)}>
                  <HeroPortrait hero={hero} decorative />
                  <span><small>{player.name}</small><strong>{hero?.name ?? 'No hero selected'}</strong><em>{player.role}</em></span>
                  {hero && player.completedHeroes.includes(hero.name) && <Check size={16} className="player-slot__complete" />}
                </button>
              );
            })}
          </div>
          <ProgressBar value={activePlayer.completedHeroes.length} max={activePlayer.progressTarget} label={activePlayer.name + ' progress'} tone="orange" />
          <div className="quick-results">
            <button type="button" className="result-action result-action--win" onClick={() => recordMatch('W')}><Check size={18} /><span><strong>Win</strong><small>Record result</small></span></button>
            <button type="button" className="result-action result-action--loss" onClick={() => recordMatch('L')}><X size={18} /><span><strong>Loss</strong><small>Record result</small></span></button>
          </div>
          <button type="button" className="text-button" onClick={undoMatch} disabled={!session.matches.length}><RotateCcw size={14} />Undo last result</button>
        </aside>
      </section>

      <section className="hero-pool-panel" id="normal-hero-pool">
        <header className="section-heading">
          <div><span className="eyebrow">Hero pool</span><h2>Choose for {activePlayer.name}</h2><p>{poolEditing ? 'Pool editing is on. Select heroes to include or exclude them.' : 'Select a hero directly, or filter the roster first.'}</p></div>
          <button type="button" className={cn('button', poolEditing ? 'button--primary' : 'button--secondary')} onClick={() => setPoolEditing((value) => !value)}><Filter size={17} />{poolEditing ? 'Done editing' : 'Manage pool'}</button>
        </header>
        <div className="hero-pool-toolbar">
          <SearchField value={search} onChange={setSearch} />
          <div className="segmented" role="group" aria-label="Filter heroes by role">
            {(['All', ...ROLES] as RoleFilter[]).map((role) => <button type="button" key={role} className={roleFilter === role ? 'is-active' : ''} onClick={() => setRoleFilter(role)}>{role}</button>)}
          </div>
          <label className="select-field"><span className="sr-only">Filter hero status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PoolStatus)}><option value="all">All states</option><option value="available">Available</option><option value="selected">Selected</option><option value="completed">Completed</option><option value="excluded">Excluded</option></select><ChevronDown size={15} /></label>
        </div>
        {filteredHeroes.length ? (
          <div className={cn('hero-grid', compactCards && 'is-compact')}>
            {filteredHeroes.map((hero) => (
              <HeroCard
                key={hero.name}
                hero={hero}
                compact={compactCards}
                status={cardStatus(hero.name)}
                favorite={session.favoriteHeroes.includes(hero.name)}
                detail={poolEditing ? (session.excludedHeroes.includes(hero.name) ? 'Click to include' : 'Click to exclude') : undefined}
                disabled={!poolEditing && session.excludedHeroes.includes(hero.name)}
                onSelect={() => selectHero(hero.name)}
                onFavorite={poolEditing ? undefined : () => toggleFavorite(hero.name)}
              />
            ))}
          </div>
        ) : <EmptyState icon={<Filter size={26} />} title="No heroes match" description="Clear a filter or include more heroes in this pool." />}
      </section>

      <section className="history-panel">
        <header className="section-heading">
          <div><span className="eyebrow">Session timeline</span><h2>Match history</h2><p>Results retain the lineup that played each match.</p></div>
          <div className="section-actions"><button type="button" className="button button--ghost" onClick={copyLineup}><Clipboard size={16} />Copy lineup</button><button type="button" className="button button--ghost" onClick={exportImage}><Download size={16} />Share image</button></div>
        </header>
        {session.matches.length ? (
          <div className="timeline-list">
            {[...session.matches].reverse().slice(0, 12).map((match) => (
              <details key={match.id} className={cn('timeline-entry', match.result === 'W' ? 'is-win' : 'is-loss')}>
                <summary><span className="timeline-entry__result">{match.result === 'W' ? 'WIN' : 'LOSS'}</span><span>{relativeTime(match.at)}</span><div className="timeline-entry__portraits">{match.heroes.map((entry, index) => <HeroPortrait key={match.id + '-' + index} hero={HERO_BY_NAME[entry.hero ?? '']} decorative />)}</div><ChevronDown size={16} /></summary>
                <div className="timeline-entry__details">{match.heroes.map((entry, index) => <div key={match.id + '-detail-' + index}><HeroPortrait hero={HERO_BY_NAME[entry.hero ?? '']} decorative /><span><strong>{entry.player}</strong><small>{entry.hero ?? 'No hero'} · {entry.role}</small></span></div>)}</div>
              </details>
            ))}
          </div>
        ) : <EmptyState icon={<History size={27} />} title="No matches yet" description="Record a win or loss from the player panel to start the timeline." />}
      </section>

      <Modal open={settingsOpen} onClose={onSettingsClose} title="Normal mode settings" eyebrow="Session controls" size="drawer">
        <div className="settings-stack">
          <section className="settings-section">
            <h3>Lineup</h3>
            <label className="field"><span>Number of players</span><select value={session.playerCount} onChange={(event) => setSession((current) => ({ ...current, playerCount: Number(event.target.value) }))}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} player{count === 1 ? '' : 's'}</option>)}</select></label>
            <Toggle checked={session.uniqueHeroes} onChange={(checked) => setSession((current) => ({ ...current, uniqueHeroes: checked }))} title="Unique lineup" description="Prevent the same hero appearing in two player slots." />
          </section>
          <section className="settings-section">
            <h3>Player profiles</h3>
            <div className="player-settings-list">
              {activePlayers.map((player) => (
                <article key={player.id} className="player-settings-card">
                  <span className="player-number">{player.id}</span>
                  <label className="field"><span>Name</span><input value={player.name} onChange={(event) => updatePlayer(player.id, { name: event.target.value })} /></label>
                  <label className="field"><span>Role</span><select value={player.role} onChange={(event) => updatePlayer(player.id, { role: event.target.value as RoleFilter })}>{(['All', ...ROLES] as RoleFilter[]).map((role) => <option key={role}>{role}</option>)}</select></label>
                  <label className="field"><span>Goal</span><input type="number" min={1} max={999} value={player.progressTarget} onChange={(event) => updatePlayer(player.id, { progressTarget: Math.max(1, Number(event.target.value) || 1) })} /></label>
                  <label className="field field--wide"><span>Notes</span><input value={player.notes} onChange={(event) => updatePlayer(player.id, { notes: event.target.value })} placeholder="Optional player note" /></label>
                </article>
              ))}
            </div>
          </section>
          <section className="settings-section settings-section--danger">
            <h3>Reset normal session</h3><p>Clears the normal lineup, completed heroes, exclusions, favorites, and match history. Nuzlocke progress is not affected.</p>
            <button type="button" className="button button--danger" onClick={() => setResetOpen(true)}><RotateCcw size={16} />Reset normal mode</button>
          </section>
        </div>
      </Modal>

      <ConfirmDialog open={resetOpen} title="Reset normal mode?" message={<p>This permanently clears the normal selector session and concludes its active Rank Challenge. Your separate Nuzlocke run will stay untouched.</p>} confirmLabel="Reset normal mode" onCancel={() => setResetOpen(false)} onConfirm={() => { setSession(createDefaultNormalSession()); if (rankChallenge?.phase === 'active') setRankChallenge(endRankChallenge(rankChallenge)); setResetOpen(false); onSettingsClose(); notify('Normal mode reset.'); }} />
    </div>
  );
}
