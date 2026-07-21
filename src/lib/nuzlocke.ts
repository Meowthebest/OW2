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

function makeEvent(run: NuzlockeRun, type: NuzlockeEvent['type'], hero: string | null, detail: string): NuzlockeEvent {
  return {
    id: uid('event'),
    at: Date.now(),
    type,
    hero,
    detail,
    wins: run.wins,
    losses: run.losses,
    remainingLives: run.remainingLives,
  };
}

export function snapshotRun(run: NuzlockeRun): NuzlockeSnapshot {
  return clone({
    currentHero: run.currentHero,
    lastHero: run.lastHero,
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

function availableForRole(run: NuzlockeRun, heroes: Hero[], role?: Role) {
  return heroes.filter((hero) => {
    if (!run.rules.roles.includes(hero.role)) return false;
    if (role && hero.role !== role) return false;
    if (run.rules.excludedHeroes.includes(hero.name)) return false;
    const record = run.heroRecords[hero.name];
    if (!record || record.state !== 'available' || record.lives <= 0) return false;
    if (!run.rules.duplicateSelections && record.selections > 0) return false;
    return true;
  });
}

export function getEligibleHeroes(run: NuzlockeRun, heroes: Hero[] = HEROES) {
  const base = availableForRole(run, heroes);
  if (!run.rules.roleQueue || run.rules.roles.length < 2 || base.length === 0) return base;
  for (let offset = 0; offset < run.rules.roles.length; offset += 1) {
    const role = run.rules.roles[(run.roleCursor + offset) % run.rules.roles.length];
    const rolePool = availableForRole(run, heroes, role);
    if (rolePool.length > 0) return rolePool;
  }
  return [];
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
  run.currentHero = null;
  run.events.push(makeEvent(run, 'end', run.lastHero, endReasonLabel(reason)));
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
  if (!run.currentHero && getEligibleHeroes(run).length === 0) {
    finish(run, 'no-heroes');
    return true;
  }
  return false;
}

function selectNextMutable(run: NuzlockeRun, type: 'pick' | 'reroll' | 'skip', previousHero: string | null) {
  let pool = getEligibleHeroes(run);
  if (!run.rules.duplicateSelections && previousHero && pool.length > 1) {
    pool = pool.filter((hero) => hero.name !== previousHero);
  }
  if (pool.length === 0) {
    run.currentHero = null;
    evaluateEnd(run);
    return;
  }
  const hero = randomFrom(pool);
  const record = run.heroRecords[hero.name];
  record.selections += 1;
  record.lastUsedAt = Date.now();
  run.lastHero = previousHero;
  run.currentHero = hero.name;
  advanceRoleCursor(run, hero);
  const detail = type === 'pick' ? 'Selected ' + hero.name : type === 'reroll' ? 'Rerolled to ' + hero.name : 'Skipped to ' + hero.name;
  run.events.push(makeEvent(run, type, hero.name, detail));
}

export function createNuzlockeRun(rules: NuzlockeRules): NuzlockeRun {
  const sanitizedRules: NuzlockeRules = {
    ...clone(rules),
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
    currentHero: null,
    lastHero: null,
    heroRecords,
    wins: 0,
    losses: 0,
    remainingLives: sanitizedRules.totalLives,
    currentStreak: 0,
    longestStreak: 0,
    roleCursor: 0,
    events: [],
    undoSnapshot: null,
  };
  run.events.push(makeEvent(run, 'start', null, 'Nuzlocke run started'));
  selectNextMutable(run, 'pick', null);
  return run;
}

export function pickNextHero(run: NuzlockeRun) {
  if (run.phase !== 'active' || run.currentHero) return run;
  const next = withUndo(run);
  selectNextMutable(next, 'pick', next.lastHero);
  return next;
}

export function chooseNuzlockeHero(run: NuzlockeRun, heroName: string) {
  if (run.phase !== 'active') return run;
  const eligible = getEligibleHeroes(run);
  if (!eligible.some((hero) => hero.name === heroName)) return run;
  const next = withUndo(run);
  const previous = next.currentHero;
  const record = next.heroRecords[heroName];
  record.selections += 1;
  record.lastUsedAt = Date.now();
  next.lastHero = previous;
  next.currentHero = heroName;
  advanceRoleCursor(next, HEROES.find((hero) => hero.name === heroName));
  next.events.push(makeEvent(next, 'pick', heroName, 'Manually selected ' + heroName));
  return next;
}

export function recordNuzlockeResult(run: NuzlockeRun, result: 'win' | 'loss') {
  if (run.phase !== 'active' || !run.currentHero) return run;
  const next = withUndo(run);
  const heroName = next.currentHero;
  const record = next.heroRecords[heroName];
  next.lastHero = heroName;

  if (result === 'win') {
    next.wins += 1;
    next.currentStreak += 1;
    next.longestStreak = Math.max(next.longestStreak, next.currentStreak);
    record.wins += 1;
    if (next.rules.removeRule === 'win' || next.rules.removeRule === 'both' || !next.rules.duplicateSelections) {
      record.state = 'completed';
    }
    next.events.push(makeEvent(next, 'win', heroName, heroName + ' survived the match'));
  } else {
    next.losses += 1;
    next.currentStreak = 0;
    next.remainingLives = Math.max(0, next.remainingLives - 1);
    record.losses += 1;
    record.lives = Math.max(0, record.lives - 1);
    if (record.lives === 0 || next.rules.removeRule === 'loss' || next.rules.removeRule === 'both') {
      record.state = 'eliminated';
      if (next.rules.removeRule === 'loss' || next.rules.removeRule === 'both') record.lives = 0;
    }
    next.events.push(makeEvent(next, 'loss', heroName, record.state === 'eliminated' ? heroName + ' was eliminated' : heroName + ' lost a life'));
  }

  next.currentHero = null;
  if (evaluateEnd(next)) return next;
  if (next.rules.autoAdvance) selectNextMutable(next, 'pick', heroName);
  return next;
}

export function rerollNuzlockeHero(run: NuzlockeRun, kind: 'reroll' | 'skip') {
  if (run.phase !== 'active' || !run.currentHero) return run;
  const next = withUndo(run);
  const previous = next.currentHero;
  next.currentHero = null;
  selectNextMutable(next, kind, previous);
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
    heroesCompleted: records.filter((record) => record.state === 'completed').length,
    heroesEliminated: records.filter((record) => record.state === 'eliminated').length,
    remainingLives: run.remainingLives,
    durationMs: Math.max(0, endedAt - run.startedAt),
    rules: clone(run.rules),
    events: clone(run.events),
  };
}

export function endReasonLabel(reason: Exclude<NuzlockeEndReason, null>) {
  if (reason === 'goal') return 'Goal completed';
  if (reason === 'no-lives') return 'No run lives remaining';
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
