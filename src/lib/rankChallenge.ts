import type {
  AppMode,
  RankChallenge,
  RankChallengeConfig,
  RankChallengeEndReason,
  RankChallengeEvent,
  RankChallengeEventType,
  RankChallengeSnapshot,
  RankDivision,
  RankName,
  RankPosition,
} from '../types';

export const RANKS: RankName[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster'];
export const DIVISIONS: RankDivision[] = [5, 4, 3, 2, 1];

export const RANK_BADGES: Record<RankName, string> = {
  Bronze: '/OW2/ranks/bronze.png',
  Silver: '/OW2/ranks/silver.png',
  Gold: '/OW2/ranks/gold.png',
  Platinum: '/OW2/ranks/platinum.png',
  Diamond: '/OW2/ranks/diamond.png',
  Master: '/OW2/ranks/master.png',
  Grandmaster: '/OW2/ranks/grandmaster.png',
};

export const DEFAULT_RANK_CHALLENGE_CONFIG: RankChallengeConfig = {
  startingPosition: { rank: 'Bronze', division: 5 },
  goalPosition: { rank: 'Gold', division: 5 },
  queue: 'All',
  randomizeAfterMatch: true,
  requiredWins: null,
  matchLimit: null,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uid(prefix: string) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export function rankScore(position: RankPosition) {
  if (position.rank === 'Placements') return -1;
  return RANKS.indexOf(position.rank) * 5 + (5 - (position.division ?? 5));
}

export function compareRankPositions(left: RankPosition, right: RankPosition) {
  return rankScore(left) - rankScore(right);
}

export function rankLabel(position: RankPosition) {
  return position.rank === 'Placements' ? 'Placements' : position.rank + ' ' + position.division;
}

export function rankProgress(challenge: RankChallenge) {
  const start = rankScore(challenge.config.startingPosition);
  const goal = rankScore(challenge.config.goalPosition);
  const current = rankScore(challenge.currentPosition);
  if (goal <= start) return current >= goal ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((current - start) / (goal - start)) * 100)));
}

function snapshot(challenge: RankChallenge): RankChallengeSnapshot {
  return clone({
    phase: challenge.phase,
    currentPosition: challenge.currentPosition,
    wins: challenge.wins,
    losses: challenge.losses,
    heroesUsed: challenge.heroesUsed,
    events: challenge.events,
    endedAt: challenge.endedAt,
    endReason: challenge.endReason,
  });
}

function withUndo(challenge: RankChallenge, action: RankChallengeEventType) {
  const next = clone(challenge);
  next.undoSnapshot = snapshot(challenge);
  next.undoAction = action;
  return next;
}

function event(challenge: RankChallenge, type: RankChallengeEventType, detail: string, hero: string | null = null, result: 'W' | 'L' | null = null): RankChallengeEvent {
  return {
    id: uid('rank-event'),
    at: Date.now(),
    type,
    detail,
    hero,
    result,
    position: clone(challenge.currentPosition),
    wins: challenge.wins,
    losses: challenge.losses,
  };
}

function finish(challenge: RankChallenge, reason: Exclude<RankChallengeEndReason, null>) {
  challenge.phase = 'completed';
  challenge.endReason = reason;
  challenge.endedAt = Date.now();
  const detail = reason === 'rank-goal'
    ? 'Reached ' + rankLabel(challenge.config.goalPosition)
    : reason === 'required-wins'
      ? 'Reached the required win target'
      : reason === 'match-limit'
        ? 'Reached the configured match limit'
        : reason === 'nuzlocke-ended'
          ? 'Nuzlocke run ended'
          : 'Rank challenge ended';
  challenge.events.push(event(challenge, 'end', detail));
}

function evaluate(challenge: RankChallenge) {
  if (compareRankPositions(challenge.currentPosition, challenge.config.goalPosition) >= 0) {
    finish(challenge, 'rank-goal');
    return;
  }
  if (challenge.config.requiredWins && challenge.wins >= challenge.config.requiredWins) {
    finish(challenge, 'required-wins');
    return;
  }
  if (challenge.config.matchLimit && challenge.wins + challenge.losses >= challenge.config.matchLimit) {
    finish(challenge, 'match-limit');
  }
}

export function createRankChallenge(mode: AppMode, config: RankChallengeConfig): RankChallenge {
  const challenge: RankChallenge = {
    id: uid('rank-challenge'),
    version: 1,
    mode,
    phase: 'active',
    config: clone(config),
    currentPosition: clone(config.startingPosition),
    wins: 0,
    losses: 0,
    heroesUsed: [],
    events: [],
    startedAt: Date.now(),
    endedAt: null,
    endReason: null,
    undoSnapshot: null,
    undoAction: null,
  };
  challenge.events.push(event(challenge, 'start', 'Started at ' + rankLabel(config.startingPosition)));
  return challenge;
}

export function recordRankChallengeResult(challenge: RankChallenge, result: 'W' | 'L', hero: string | null) {
  if (challenge.phase !== 'active') return challenge;
  const next = withUndo(challenge, 'result');
  if (result === 'W') next.wins += 1;
  else next.losses += 1;
  if (hero && !next.heroesUsed.includes(hero)) next.heroesUsed.push(hero);
  next.events.push(event(next, 'result', (result === 'W' ? 'Win' : 'Loss') + (hero ? ' with ' + hero : ''), hero, result));
  evaluate(next);
  return next;
}

export function updateRankChallengePosition(challenge: RankChallenge, position: RankPosition) {
  if (challenge.phase !== 'active' || compareRankPositions(challenge.currentPosition, position) === 0) return challenge;
  const next = withUndo(challenge, 'rank');
  next.currentPosition = clone(position);
  next.events.push(event(next, 'rank', 'Rank updated to ' + rankLabel(position)));
  evaluate(next);
  return next;
}

export function endRankChallenge(challenge: RankChallenge, reason: Exclude<RankChallengeEndReason, null> = 'ended') {
  if (challenge.phase !== 'active') return challenge;
  const next = withUndo(challenge, 'end');
  finish(next, reason);
  return next;
}

export function undoRankChallenge(challenge: RankChallenge) {
  if (!challenge.undoSnapshot) return challenge;
  const restored = clone(challenge);
  Object.assign(restored, clone(challenge.undoSnapshot));
  restored.undoSnapshot = null;
  restored.undoAction = null;
  return restored;
}

export function rankChallengeGoalAchieved(challenge: RankChallenge) {
  return challenge.endReason === 'rank-goal' || challenge.endReason === 'required-wins';
}

export function rankChallengeDuration(challenge: RankChallenge) {
  return Math.max(0, (challenge.endedAt ?? Date.now()) - challenge.startedAt);
}
