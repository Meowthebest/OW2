import { HEROES } from '../data/heroes';
import type {
  Hero,
  NuzlockeEndReason,
  NuzlockeEvent,
  NuzlockeHeroRecord,
  NuzlockeRules,
  NuzlockeRun,
  NuzlockeSnapshot,
  NuzlockeSummary,
  Role,
} from '../types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uid(prefix: string) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function makeEvent(run: NuzlockeRun, type: NuzlockeEvent['type'], heroes: string[], detail: string): NuzlockeEvent {
  return {
    id: uid('event'),
    at: Date.now(),
    type,
    hero: heroes[0] ?? null,
    heroes,
    detail,
    wins: run.wins,
    losses: run.losses,
    remainingLives: run.remainingLives,
  };
}

export function snapshotRun(run: NuzlockeRun): NuzlockeSnapshot {
  return clone({
    players: run.players,
    heroRecords: run.heroRecords,
    wins: run.wins,
    losses: run.losses,
    remainingLives: run.remainingLives,
    currentStreak: run.currentStreak,
    longestStreak: run.longestStreak,
    roleCursor: run.roleCursor,
    events: run.events,
    phase: run.phase,
    endedAt: run.endedAt,
    endReason: run.endReason,
  });
}

function withUndo(run: NuzlockeRun) {
  const next = clone(run);
  next.undoSnapshot = snapshotRun(run);
  return next;
}

function playerRolePool(run: NuzlockeRun, playerId?: number) {
  if (!playerId) return run.rules.roles;
  const selected = run.rules.playerRoles[playerId - 1]?.filter((role) => run.rules.roles.includes(role)) ?? [];
  return selected.length ? selected : run.rules.roles;
}

function availableForRole(run: NuzlockeRun, heroes: Hero[], role?: Role, playerId?: number, winnerPool = false) {
  const selectedHeroes = new Set(run.players.map((player) => player.currentHero).filter((hero): hero is string => !!hero));
  const allowedRoles = playerRolePool(run, playerId);
  return heroes.filter((hero) => {
    if (!run.rules.roles.includes(hero.role)) return false;
    if (!allowedRoles.includes(hero.role)) return false;
    if (role && hero.role !== role) return false;
    if (run.rules.excludedHeroes.includes(hero.name)) return false;
    if (selectedHeroes.has(hero.name)) return false;
    const record = run.heroRecords[hero.name];
    if (!record || record.lives <= 0) return false;
    const reusableWinner = run.rules.reuseCompletedHeroes && record.wins > 0 && record.state !== 'eliminated';
    if (winnerPool ? !reusableWinner : record.state !== 'available') return false;
    if (!winnerPool && !run.rules.duplicateSelections && record.selections > 0) return false;
    return true;
  });
}

function eligibleStatePool(run: NuzlockeRun, heroes: Hero[], playerId: number | undefined, winnerPool: boolean) {
  const base = availableForRole(run, heroes, undefined, playerId, winnerPool);
  if (!run.rules.roleQueue || run.rules.roles.length < 2 || base.length === 0) return base;
  for (let offset = 0; offset < run.rules.roles.length; offset += 1) {
    const role = run.rules.roles[(run.roleCursor + offset) % run.rules.roles.length];
    const rolePool = availableForRole(run, heroes, role, playerId, winnerPool);
    if (rolePool.length > 0) return rolePool;
  }
  return [];
}

export function getEligibleHeroes(run: NuzlockeRun, heroes: Hero[] = HEROES, playerId?: number) {
  if (playerId && (run.players.find((player) => player.id === playerId)?.remainingLives ?? 0) <= 0) return [];
  const fresh = eligibleStatePool(run, heroes, playerId, false);
  if (fresh.length > 0 || !run.rules.reuseCompletedHeroes) return fresh;
  return eligibleStatePool(run, heroes, playerId, true);
}

export function getSelectableHeroes(run: NuzlockeRun, heroes: Hero[] = HEROES, playerId?: number) {
  if (playerId && (run.players.find((player) => player.id === playerId)?.remainingLives ?? 0) <= 0) return [];
  const fresh = eligibleStatePool(run, heroes, playerId, false);
  if (!run.rules.reuseCompletedHeroes) return fresh;
  const freshNames = new Set(fresh.map((hero) => hero.name));
  return [...fresh, ...eligibleStatePool(run, heroes, playerId, true).filter((hero) => !freshNames.has(hero.name))];
}

function randomFrom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function advanceRoleCursor(run: NuzlockeRun, hero: Hero | undefined) {
  if (!run.rules.roleQueue || !hero) return;
  const index = run.rules.roles.indexOf(hero.role);
  if (index >= 0) run.roleCursor = (index + 1) % run.rules.roles.length;
}

function finish(run: NuzlockeRun, reason: Exclude<NuzlockeEndReason, null>) {
  run.phase = 'completed';
  run.endReason = reason;
  run.endedAt = Date.now();
  const finalHeroes = run.players.map((player) => player.currentHero ?? player.lastHero).filter((hero): hero is string => !!hero);
  run.players.forEach((player) => { player.currentHero = null; });
  run.events.push(makeEvent(run, 'end', finalHeroes, endReasonLabel(reason)));
}

function evaluateEnd(run: NuzlockeRun) {
  if (run.wins >= run.rules.requiredWins) {
    finish(run, 'goal');
    return true;
  }
  if (run.remainingLives <= 0) {
    finish(run, 'no-lives');
    return true;
  }
  if (!run.players.some((player) => player.currentHero) && !run.players.some((player) => player.remainingLives > 0 && getEligibleHeroes(run, HEROES, player.id).length > 0)) {
    finish(run, 'no-heroes');
    return true;
  }
  return false;
}

function selectNextMutable(run: NuzlockeRun, type: 'pick' | 'reroll' | 'skip', playerId: number, previousHero: string | null) {
  const player = run.players.find((item) => item.id === playerId);
  if (!player || player.remainingLives <= 0) return;
  let pool = getEligibleHeroes(run, HEROES, playerId);
  if (!run.rules.duplicateSelections && previousHero && pool.length > 1) {
    pool = pool.filter((hero) => hero.name !== previousHero);
  }
  if (pool.length === 0) {
    player.currentHero = null;
    evaluateEnd(run);
    return;
  }
  const hero = randomFrom(pool);
  const record = run.heroRecords[hero.name];
  record.selections += 1;
  record.lastUsedAt = Date.now();
  player.lastHero = previousHero;
  player.currentHero = hero.name;
  advanceRoleCursor(run, hero);
  const detail = type === 'pick' ? player.name + ' drew ' + hero.name : type === 'reroll' ? player.name + ' rerolled to ' + hero.name : player.name + ' skipped to ' + hero.name;
  run.events.push(makeEvent(run, type, [hero.name], detail));
}

function fillOpenPlayersMutable(run: NuzlockeRun) {
  for (const player of run.players) {
    if (run.phase !== 'active') break;
    if (player.remainingLives > 0 && !player.currentHero) selectNextMutable(run, 'pick', player.id, player.lastHero);
  }
}

export function createNuzlockeRun(rules: NuzlockeRules): NuzlockeRun {
  const sanitizedRules: NuzlockeRules = {
    ...clone(rules),
    playerCount: Math.max(1, Math.min(5, Math.floor(rules.playerCount) || 1)),
    playerNames: Array.from({ length: 5 }, (_, index) => rules.playerNames?.[index]?.trim() || 'Player ' + (index + 1)),
    playerRoles: Array.from({ length: 5 }, (_, index) => {
      const selected = rules.playerRoles?.[index]?.filter((role) => rules.roles.includes(role)) ?? [];
      return selected.length ? selected : [...rules.roles];
    }),
    roles: rules.roles.length ? [...rules.roles] : ['Tank', 'Damage', 'Support'],
    livesPerHero: Math.max(1, Math.min(9, Math.floor(rules.livesPerHero) || 1)),
    totalLives: Math.max(1, Math.min(999, Math.floor(rules.totalLives) || 1)),
    requiredWins: Math.max(1, Math.min(999, Math.floor(rules.requiredWins) || 1)),
  };
  const heroRecords: Record<string, NuzlockeHeroRecord> = {};
  HEROES.forEach((hero) => {
    heroRecords[hero.name] = {
      lives: sanitizedRules.livesPerHero,
      wins: 0,
      losses: 0,
      selections: 0,
      state: 'available',
      lastUsedAt: null,
    };
  });

  const run: NuzlockeRun = {
    id: uid('run'),
    version: 1,
    phase: 'active',
    rules: sanitizedRules,
    startedAt: Date.now(),
    endedAt: null,
    endReason: null,
    players: Array.from({ length: sanitizedRules.playerCount }, (_, index) => ({
      id: (index + 1) as 1 | 2 | 3 | 4 | 5,
      name: sanitizedRules.playerNames[index],
      currentHero: null,
      lastHero: null,
      remainingLives: sanitizedRules.totalLives,
    })),
    heroRecords,
    wins: 0,
    losses: 0,
    remainingLives: sanitizedRules.totalLives * sanitizedRules.playerCount,
    currentStreak: 0,
    longestStreak: 0,
    roleCursor: 0,
    events: [],
    undoSnapshot: null,
  };
  run.events.push(makeEvent(run, 'start', [], sanitizedRules.playerCount > 1 ? sanitizedRules.playerCount + '-player Nuzlocke run started' : 'Nuzlocke run started'));
  fillOpenPlayersMutable(run);
  return run;
}

export function pickNextHero(run: NuzlockeRun, playerId?: number) {
  if (run.phase !== 'active') return run;
  if (playerId && run.players.find((player) => player.id === playerId)?.currentHero) return run;
  if (!playerId && run.players.every((player) => player.currentHero)) return run;
  const next = withUndo(run);
  if (playerId) {
    const player = next.players.find((item) => item.id === playerId);
    if (player) selectNextMutable(next, 'pick', player.id, player.lastHero);
  } else {
    fillOpenPlayersMutable(next);
  }
  return next;
}

export function chooseNuzlockeHero(run: NuzlockeRun, heroName: string, playerId: number = run.players[0]?.id ?? 1) {
  if (run.phase !== 'active') return run;
  const next = withUndo(run);
  const player = next.players.find((item) => item.id === playerId);
  if (!player || player.remainingLives <= 0) return run;
  const previous = player.currentHero;
  player.currentHero = null;
  const eligible = getSelectableHeroes(next, HEROES, playerId);
  if (!eligible.some((hero) => hero.name === heroName)) return run;
  const record = next.heroRecords[heroName];
  record.selections += 1;
  record.lastUsedAt = Date.now();
  player.lastHero = previous;
  player.currentHero = heroName;
  advanceRoleCursor(next, HEROES.find((hero) => hero.name === heroName));
  next.events.push(makeEvent(next, 'pick', [heroName], player.name + ' selected ' + heroName));
  return next;
}

export function recordNuzlockeResult(run: NuzlockeRun, result: 'win' | 'loss') {
  const activePlayers = run.players.filter((player) => player.currentHero);
  if (run.phase !== 'active' || activePlayers.length === 0) return run;
  const next = withUndo(run);
  const lineup = next.players.filter((player) => player.currentHero);
  const heroNames = lineup.map((player) => player.currentHero as string);
  lineup.forEach((player) => { player.lastHero = player.currentHero; });

  if (result === 'win') {
    next.wins += 1;
    next.currentStreak += 1;
    next.longestStreak = Math.max(next.longestStreak, next.currentStreak);
    heroNames.forEach((heroName) => {
      const record = next.heroRecords[heroName];
      record.wins += 1;
      if (!next.rules.reuseCompletedHeroes && (next.rules.removeRule === 'win' || next.rules.removeRule === 'both' || !next.rules.duplicateSelections)) record.state = 'completed';
      else if (record.state !== 'eliminated') record.state = 'available';
    });
    next.events.push(makeEvent(next, 'win', heroNames, heroNames.length > 1 ? 'The party survived with ' + heroNames.join(', ') : heroNames[0] + ' survived the match'));
  } else {
    next.losses += 1;
    next.currentStreak = 0;
    lineup.forEach((player) => { player.remainingLives = Math.max(0, player.remainingLives - 1); });
    next.remainingLives = next.players.reduce((total, player) => total + player.remainingLives, 0);
    const eliminated: string[] = [];
    heroNames.forEach((heroName) => {
      const record = next.heroRecords[heroName];
      record.losses += 1;
      record.lives = Math.max(0, record.lives - 1);
      if (record.lives === 0 || next.rules.removeRule === 'loss' || next.rules.removeRule === 'both') {
        record.state = 'eliminated';
        if (next.rules.removeRule === 'loss' || next.rules.removeRule === 'both') record.lives = 0;
        eliminated.push(heroName);
      }
    });
    const detail = heroNames.length > 1
      ? (eliminated.length ? 'Party loss — eliminated ' + eliminated.join(', ') : 'The party lost one hero life each')
      : (eliminated.length ? heroNames[0] + ' was eliminated' : heroNames[0] + ' lost a life');
    next.events.push(makeEvent(next, 'loss', heroNames, detail));
  }

  next.players.forEach((player) => { player.currentHero = null; });
  if (evaluateEnd(next)) return next;
  if (next.rules.autoAdvance) fillOpenPlayersMutable(next);
  return next;
}

export function rerollNuzlockeHero(run: NuzlockeRun, kind: 'reroll' | 'skip', playerId: number = run.players[0]?.id ?? 1) {
  const target = run.players.find((player) => player.id === playerId);
  if (run.phase !== 'active' || !target?.currentHero) return run;
  const next = withUndo(run);
  const player = next.players.find((item) => item.id === playerId);
  if (!player) return run;
  const previous = player.currentHero;
  player.currentHero = null;
  selectNextMutable(next, kind, player.id, previous);
  return next;
}

export function undoNuzlockeAction(run: NuzlockeRun) {
  if (!run.undoSnapshot) return run;
  const restored = clone(run);
  Object.assign(restored, clone(run.undoSnapshot));
  restored.undoSnapshot = null;
  return restored;
}

export function endNuzlockeRun(run: NuzlockeRun) {
  if (run.phase !== 'active') return run;
  const next = withUndo(run);
  finish(next, 'ended');
  return next;
}

export function summarizeRun(run: NuzlockeRun): NuzlockeSummary {
  const endedAt = run.endedAt ?? Date.now();
  const records = Object.values(run.heroRecords);
  return {
    id: run.id,
    startedAt: run.startedAt,
    endedAt,
    endReason: run.endReason ?? 'ended',
    wins: run.wins,
    losses: run.losses,
    longestStreak: run.longestStreak,
    heroesUsed: records.filter((record) => record.selections > 0).length,
    heroesCompleted: records.filter((record) => record.wins > 0).length,
    heroesEliminated: records.filter((record) => record.state === 'eliminated').length,
    remainingLives: run.remainingLives,
    durationMs: Math.max(0, endedAt - run.startedAt),
    rules: clone(run.rules),
    events: clone(run.events),
  };
}

export function endReasonLabel(reason: Exclude<NuzlockeEndReason, null>) {
  if (reason === 'goal') return 'Goal completed';
  if (reason === 'no-lives') return 'No player lives remaining';
  if (reason === 'no-heroes') return 'No eligible heroes remaining';
  return 'Run ended';
}

export function formatDuration(durationMs: number) {
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
  if (minutes > 0) return minutes + 'm';
  return Math.max(1, Math.floor(durationMs / 1000)) + 's';
}
