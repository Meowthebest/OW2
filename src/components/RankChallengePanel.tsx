import { useEffect, useState } from 'react';
import { Check, ChevronDown, Flag, History, RotateCcw, Shuffle, Target, Trophy, Undo2, X } from 'lucide-react';
import { HERO_BY_NAME } from '../data/heroes';
import {
  DEFAULT_RANK_CHALLENGE_CONFIG,
  DIVISIONS,
  RANKS,
  RANK_BADGES,
  compareRankPositions,
  endRankChallenge,
  rankChallengeDuration,
  rankChallengeGoalAchieved,
  rankLabel,
  rankProgress,
  undoRankChallenge,
  updateRankChallengePosition,
} from '../lib/rankChallenge';
import type { AppMode, RankChallenge, RankChallengeConfig, RankDivision, RankName, RankPosition, RankQueue } from '../types';
import { ConfirmDialog, HeroPortrait, Metric, Modal, ProgressBar, Toggle, cn } from './ui';

type Props = {
  mode: AppMode;
  challenge: RankChallenge | null;
  currentHero: string | null;
  onStart: (config: RankChallengeConfig) => void;
  onChange: (challenge: RankChallenge | null) => void;
  notify: (message: string) => void;
  fail: (message: string) => void;
};

function durationLabel(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes >= 60) return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  if (minutes > 0) return minutes + 'm';
  return Math.max(1, Math.floor(milliseconds / 1000)) + 's';
}

export function RankBadge({ position, size = 'medium' }: { position: RankPosition; size?: 'small' | 'medium' | 'large' }) {
  return (
    <span className={cn('rank-badge', 'rank-badge--' + size)}>
      <img src={RANK_BADGES[position.rank]} alt="" />
      <span><strong>{position.rank}</strong><small>Division {position.division}</small></span>
    </span>
  );
}

export default function RankChallengePanel({ mode, challenge, currentHero, onStart, onChange, notify, fail }: Props) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [config, setConfig] = useState<RankChallengeConfig>({ ...DEFAULT_RANK_CHALLENGE_CONFIG });
  const [pendingPosition, setPendingPosition] = useState<RankPosition>(challenge?.currentPosition ?? DEFAULT_RANK_CHALLENGE_CONFIG.startingPosition);

  useEffect(() => {
    if (challenge) setPendingPosition(challenge.currentPosition);
  }, [challenge?.currentPosition.division, challenge?.currentPosition.rank, challenge?.id]);

  const openSetup = (nextConfig?: RankChallengeConfig) => {
    setConfig(nextConfig ? JSON.parse(JSON.stringify(nextConfig)) : { ...DEFAULT_RANK_CHALLENGE_CONFIG, startingPosition: { ...DEFAULT_RANK_CHALLENGE_CONFIG.startingPosition }, goalPosition: { ...DEFAULT_RANK_CHALLENGE_CONFIG.goalPosition } });
    setSetupOpen(true);
  };

  const setPosition = (key: 'startingPosition' | 'goalPosition', patch: Partial<RankPosition>) => {
    setConfig((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const start = () => {
    if (compareRankPositions(config.goalPosition, config.startingPosition) <= 0) {
      fail('Choose a goal rank above the current rank.');
      return;
    }
    if (config.requiredWins && config.matchLimit && config.requiredWins > config.matchLimit) {
      fail('Required wins cannot be higher than the match limit.');
      return;
    }
    onStart(config);
    setSetupOpen(false);
  };

  if (!challenge) {
    return (
      <>
        <section className="rank-challenge-launch">
          <span className="rank-challenge-launch__icon"><Target size={24} /></span>
          <div><span className="eyebrow">Optional ranked climb</span><h2>Set a rank goal</h2><p>Pair random heroes with a current rank, target rank, queue, and match limits.</p></div>
          <button type="button" className="button button--secondary" onClick={() => openSetup()}><Flag size={17} />Configure challenge</button>
        </section>
        <RankSetupModal mode={mode} open={setupOpen} config={config} onClose={() => setSetupOpen(false)} onConfig={setConfig} onPosition={setPosition} onStart={start} />
      </>
    );
  }

  const matches = challenge.wins + challenge.losses;
  const winRate = matches ? Math.round((challenge.wins / matches) * 100) : 0;
  const goalReached = rankChallengeGoalAchieved(challenge);
  const hero = HERO_BY_NAME[currentHero ?? ''];

  if (challenge.phase === 'completed') {
    return (
      <section className={cn('rank-challenge-results', goalReached ? 'is-cleared' : 'is-ended')}>
        <div className="rank-results__headline">
          <span className="rank-results__status">{goalReached ? <Trophy size={26} /> : <Flag size={26} />}</span>
          <div><span className="eyebrow">Rank Challenge results</span><h2>{goalReached ? 'Challenge goal achieved.' : 'Rank climb concluded.'}</h2><p>{rankLabel(challenge.config.startingPosition)} to {rankLabel(challenge.currentPosition)} · {durationLabel(rankChallengeDuration(challenge))}</p></div>
          <span className={cn('goal-result-pill', goalReached && 'is-success')}>{goalReached ? <Check size={15} /> : <X size={15} />}{goalReached ? 'Goal achieved' : 'Goal not reached'}</span>
        </div>
        <div className="rank-route rank-route--results">
          <RankBadge position={challenge.config.startingPosition} size="large" /><span className="rank-route__line"><i style={{ width: rankProgress(challenge) + '%' }} /></span><RankBadge position={challenge.currentPosition} size="large" />
        </div>
        <div className="metrics-row rank-results__metrics">
          <Metric label="Final record" value={challenge.wins + '–' + challenge.losses} detail={winRate + '% win rate'} icon={<Trophy size={17} />} />
          <Metric label="Matches" value={matches} detail={challenge.config.matchLimit ? 'limit ' + challenge.config.matchLimit : 'no limit'} icon={<History size={17} />} />
          <Metric label="Heroes used" value={challenge.heroesUsed.length} detail={challenge.config.queue} icon={<Shuffle size={17} />} />
        </div>
        {challenge.heroesUsed.length > 0 && <div className="rank-used-heroes"><span>Heroes used</span><div>{challenge.heroesUsed.map((name) => <span key={name} title={name}><HeroPortrait hero={HERO_BY_NAME[name]} decorative /></span>)}</div></div>}
        <div className="rank-results__actions">
          <button type="button" className="button button--primary" onClick={() => onStart(challenge.config)}><RotateCcw size={16} />Retry challenge</button>
          <button type="button" className="button button--secondary" onClick={() => { onChange(null); window.setTimeout(() => openSetup(), 0); }}><Target size={16} />New goal</button>
          {challenge.undoSnapshot && <button type="button" className="button button--ghost" onClick={() => { onChange(undoRankChallenge(challenge)); notify('Challenge completion undone.'); }}><Undo2 size={16} />Undo last update</button>}
          <button type="button" className="text-button" onClick={() => onChange(null)}>Dismiss results</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="rank-challenge-panel">
        <header className="rank-challenge-panel__header">
          <div><span className="eyebrow"><Flag size={13} /> Rank Challenge live</span><h2>{rankLabel(challenge.currentPosition)} → {rankLabel(challenge.config.goalPosition)}</h2><p>{challenge.config.queue} · {challenge.config.randomizeAfterMatch ? 'New random hero after every match' : 'Keep current hero after results'}</p></div>
          <button type="button" className="icon-button" onClick={() => setEndOpen(true)} title="End rank challenge" aria-label="End rank challenge"><X size={17} /></button>
        </header>
        <div className="rank-route">
          <RankBadge position={challenge.currentPosition} size="large" />
          <span className="rank-route__progress"><span><strong>{rankProgress(challenge)}%</strong><small>to goal</small></span><i><b style={{ width: rankProgress(challenge) + '%' }} /></i></span>
          <RankBadge position={challenge.config.goalPosition} size="large" />
        </div>
        <div className="rank-live-grid">
          <div className="rank-live-stats">
            <Metric label="Record" value={challenge.wins + '–' + challenge.losses} detail={winRate + '% win rate'} icon={<Trophy size={17} />} />
            <Metric label="Matches" value={matches} detail={challenge.config.matchLimit ? (challenge.config.matchLimit - matches) + ' remaining' : 'unlimited'} icon={<History size={17} />} />
            <Metric label="Heroes used" value={challenge.heroesUsed.length} detail={hero?.name ?? 'Awaiting hero'} icon={<Shuffle size={17} />} />
          </div>
          <div className="rank-update-card">
            <span><strong>Update current rank</strong><small>Adjust this after the competitive rank screen changes.</small></span>
            <div className="rank-update-controls">
              <label className="select-field"><select aria-label="Updated current rank" value={pendingPosition.rank} onChange={(event) => setPendingPosition((current) => ({ ...current, rank: event.target.value as RankName }))}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select><ChevronDown size={14} /></label>
              <label className="select-field"><select aria-label="Updated current division" value={pendingPosition.division} onChange={(event) => setPendingPosition((current) => ({ ...current, division: Number(event.target.value) as RankDivision }))}>{DIVISIONS.map((division) => <option key={division} value={division}>Division {division}</option>)}</select><ChevronDown size={14} /></label>
              <button type="button" className="button button--secondary" disabled={compareRankPositions(pendingPosition, challenge.currentPosition) === 0} onClick={() => { const next = updateRankChallengePosition(challenge, pendingPosition); onChange(next); notify(next.phase === 'completed' ? 'Rank goal reached!' : 'Current rank updated.'); }}><Check size={16} />Save rank</button>
            </div>
            <div className="rank-update-foot">
              <span>{challenge.config.requiredWins ? challenge.wins + '/' + challenge.config.requiredWins + ' required wins' : 'No win target'}</span>
              <button type="button" className="text-button" disabled={!challenge.undoSnapshot} onClick={() => { onChange(undoRankChallenge(challenge)); notify('Last challenge update undone.'); }}><Undo2 size={14} />Undo challenge update</button>
            </div>
          </div>
        </div>
        <ProgressBar value={rankProgress(challenge)} max={100} label="Rank goal progress" tone="green" />
      </section>
      <ConfirmDialog open={endOpen} title="End this Rank Challenge?" message={<p>Your final rank, record, heroes, and duration will be kept on the results card. This does not reset the underlying {mode === 'nuzlocke' ? 'Nuzlocke run' : 'normal session'}.</p>} confirmLabel="End challenge" onCancel={() => setEndOpen(false)} onConfirm={() => { onChange(endRankChallenge(challenge)); setEndOpen(false); notify('Rank Challenge ended.'); }} />
    </>
  );
}

function RankSetupModal({ mode, open, config, onClose, onConfig, onPosition, onStart }: {
  mode: AppMode;
  open: boolean;
  config: RankChallengeConfig;
  onClose: () => void;
  onConfig: (config: RankChallengeConfig) => void;
  onPosition: (key: 'startingPosition' | 'goalPosition', patch: Partial<RankPosition>) => void;
  onStart: () => void;
}) {
  const queues: RankQueue[] = ['All', 'Tank', 'Damage', 'Support', 'Open Queue'];
  return (
    <Modal open={open} onClose={onClose} title="Configure Rank Challenge" eyebrow={mode === 'nuzlocke' ? 'Nuzlocke ranked climb' : 'Random hero ranked climb'} size="large">
      <div className="rank-setup">
        <div className="rank-setup__route">
          <div><span>Current rank</span><RankBadge position={config.startingPosition} size="large" /><div className="rank-position-selects"><label className="select-field"><select aria-label="Starting rank" value={config.startingPosition.rank} onChange={(event) => onPosition('startingPosition', { rank: event.target.value as RankName })}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select><ChevronDown size={14} /></label><label className="select-field"><select aria-label="Starting division" value={config.startingPosition.division} onChange={(event) => onPosition('startingPosition', { division: Number(event.target.value) as RankDivision })}>{DIVISIONS.map((division) => <option key={division} value={division}>Division {division}</option>)}</select><ChevronDown size={14} /></label></div></div>
          <span className="rank-setup__arrow">→</span>
          <div><span>Goal rank</span><RankBadge position={config.goalPosition} size="large" /><div className="rank-position-selects"><label className="select-field"><select aria-label="Goal rank" value={config.goalPosition.rank} onChange={(event) => onPosition('goalPosition', { rank: event.target.value as RankName })}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select><ChevronDown size={14} /></label><label className="select-field"><select aria-label="Goal division" value={config.goalPosition.division} onChange={(event) => onPosition('goalPosition', { division: Number(event.target.value) as RankDivision })}>{DIVISIONS.map((division) => <option key={division} value={division}>Division {division}</option>)}</select><ChevronDown size={14} /></label></div></div>
        </div>
        <section className="rank-setup__section"><h3>Queue</h3><div className="rank-queue-grid">{queues.map((queue) => <button type="button" key={queue} className={config.queue === queue ? 'is-active' : ''} onClick={() => onConfig({ ...config, queue })} aria-pressed={config.queue === queue}>{queue}</button>)}</div></section>
        <section className="rank-setup__section"><h3>Challenge rules</h3><Toggle checked={config.randomizeAfterMatch} onChange={(randomizeAfterMatch) => onConfig({ ...config, randomizeAfterMatch })} title="Random hero after every match" description={mode === 'nuzlocke' ? 'Uses the next eligible Nuzlocke hero and preserves elimination rules.' : 'Automatically rerolls the active player after recording a result.'} /><div className="rank-limit-grid"><label className="field"><span>Required wins <small>Optional</small></span><input aria-label="Optional required wins" type="number" min={1} max={999} value={config.requiredWins ?? ''} placeholder="No win target" onChange={(event) => onConfig({ ...config, requiredWins: event.target.value ? Math.max(1, Number(event.target.value)) : null })} /></label><label className="field"><span>Match limit <small>Optional</small></span><input aria-label="Optional match limit" type="number" min={1} max={999} value={config.matchLimit ?? ''} placeholder="Unlimited" onChange={(event) => onConfig({ ...config, matchLimit: event.target.value ? Math.max(1, Number(event.target.value)) : null })} /></label></div></section>
        <div className="rank-setup__summary"><Target size={18} /><span><strong>{rankLabel(config.startingPosition)} to {rankLabel(config.goalPosition)}</strong><small>{config.queue} · {config.randomizeAfterMatch ? 'Randomize after matches' : 'Keep heroes'} · {config.matchLimit ? config.matchLimit + ' match limit' : 'No match limit'}</small></span></div>
        <div className="modal-actions"><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={onStart}><Flag size={17} />Start Rank Challenge</button></div>
      </div>
    </Modal>
  );
}
