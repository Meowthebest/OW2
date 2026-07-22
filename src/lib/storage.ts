import { useEffect, useState } from 'react';
import { HEROES } from '../data/heroes';
import { DEFAULT_RANK_CHALLENGE_CONFIG, DIVISIONS, RANKS } from './rankChallenge';
import type {
  AppPreferences,
  NormalMatch,
  NormalPlayer,
  NormalSession,
  NuzlockeRules,
  NuzlockeRun,
  NuzlockeStore,
  PlayerId,
  RankChallenge,
  RankChallengeConfig,
  RankChallengeEndReason,
  RankChallengeEvent,
  RankChallengeSnapshot,
  RankChallengeStore,
  RankPosition,
  RoleFilter,
} from '../types';

export const NORMAL_STORAGE_KEY = 'ow2_normal_v3';
export const NUZLOCKE_STORAGE_KEY = 'ow2_nuzlocke_v1';
export const PREFERENCES_STORAGE_KEY = 'ow2_preferences_v1';
export const RANK_CHALLENGE_STORAGE_KEY = 'ow2_rank_challenges_v1';

const playerIds: PlayerId[] = [1, 2, 3, 4, 5];

export const DEFAULT_NUZLOCKE_RULES: NuzlockeRules = {
  playerCount: 1,
  playerNames: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'],
  playerRoles: Array.from({ length: 5 }, () => ['Tank', 'Damage', 'Support']),
  roles: ['Tank', 'Damage', 'Support'],
  excludedHeroes: [],
  duplicateSelections: false,
  reuseCompletedHeroes: true,
  removeRule: 'both',
  livesPerHero: 1,
  totalLives: 12,
  requiredWins: 10,
  roleQueue: false,
  autoAdvance: true,
  showEliminated: true,
  customRules: '',
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  mode: 'normal',
  theme: 'dark',
  compactCards: false,
  reducedEffects: false,
};

function safeRead<T>(key: string): T | null {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function recordValue<T>(record: Record<string, T> | null, id: PlayerId, fallback: T): T {
  if (!record) return fallback;
  return record[String(id)] ?? record[id as unknown as string] ?? fallback;
}

function clampedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

function normalizeNuzlockeRules(input: Partial<NuzlockeRules> | null | undefined): NuzlockeRules {
  const roles = Array.isArray(input?.roles)
    ? input.roles.filter((role) => role === 'Tank' || role === 'Damage' || role === 'Support')
    : [];
  const removeRule = input?.removeRule;
  return {
    ...DEFAULT_NUZLOCKE_RULES,
    playerCount: clampedNumber(input?.playerCount, DEFAULT_NUZLOCKE_RULES.playerCount, 1, 5),
    playerNames: Array.from({ length: 5 }, (_, index) => typeof input?.playerNames?.[index] === 'string' && input.playerNames[index].trim() ? input.playerNames[index].trim().slice(0, 24) : 'Player ' + (index + 1)),
    playerRoles: Array.from({ length: 5 }, (_, index) => {
      const selected = Array.isArray(input?.playerRoles?.[index]) ? input.playerRoles[index].filter((role) => roles.includes(role)) : [];
      return selected.length ? selected : [...(roles.length ? roles : DEFAULT_NUZLOCKE_RULES.roles)];
    }),
    roles: roles.length ? roles : [...DEFAULT_NUZLOCKE_RULES.roles],
    excludedHeroes: Array.isArray(input?.excludedHeroes)
      ? input.excludedHeroes.filter((hero): hero is string => typeof hero === 'string')
      : [],
    duplicateSelections: typeof input?.duplicateSelections === 'boolean' ? input.duplicateSelections : DEFAULT_NUZLOCKE_RULES.duplicateSelections,
    reuseCompletedHeroes: typeof input?.reuseCompletedHeroes === 'boolean' ? input.reuseCompletedHeroes : DEFAULT_NUZLOCKE_RULES.reuseCompletedHeroes,
    removeRule: removeRule === 'never' || removeRule === 'win' || removeRule === 'loss' || removeRule === 'both'
      ? removeRule
      : DEFAULT_NUZLOCKE_RULES.removeRule,
    livesPerHero: clampedNumber(input?.livesPerHero, DEFAULT_NUZLOCKE_RULES.livesPerHero, 1, 9),
    totalLives: clampedNumber(input?.totalLives, DEFAULT_NUZLOCKE_RULES.totalLives, 1, 999),
    requiredWins: clampedNumber(input?.requiredWins, DEFAULT_NUZLOCKE_RULES.requiredWins, 1, 999),
    roleQueue: typeof input?.roleQueue === 'boolean' ? input.roleQueue : DEFAULT_NUZLOCKE_RULES.roleQueue,
    autoAdvance: typeof input?.autoAdvance === 'boolean' ? input.autoAdvance : DEFAULT_NUZLOCKE_RULES.autoAdvance,
    showEliminated: typeof input?.showEliminated === 'boolean' ? input.showEliminated : DEFAULT_NUZLOCKE_RULES.showEliminated,
    customRules: typeof input?.customRules === 'string' ? input.customRules : '',
  };
}

export function createDefaultNormalSession(): NormalSession {
  return {
    version: 3,
    playerCount: 3,
    players: playerIds.map((id) => ({
      id,
      name: 'Player ' + id,
      role: 'All',
      currentHero: null,
      completedHeroes: [],
      progressTarget: 10,
      notes: '',
    })),
    excludedHeroes: [],
    favoriteHeroes: [],
    uniqueHeroes: true,
    matches: [],
    completionStreak: 0,
    bestCompletionStreak: 0,
  };
}

export function normalizeNormalSession(input: Partial<NormalSession>): NormalSession {
  const defaults = createDefaultNormalSession();
  const inputPlayers = Array.isArray(input.players) ? input.players : [];
  const players = defaults.players.map((fallback) => {
    const candidate = inputPlayers.find((player) => player && player.id === fallback.id) as Partial<NormalPlayer> | undefined;
    return {
      ...fallback,
      ...candidate,
      id: fallback.id,
      name: typeof candidate?.name === 'string' && candidate.name.trim() ? candidate.name : fallback.name,
      role: ['All', 'Tank', 'Damage', 'Support'].includes(candidate?.role ?? '') ? (candidate?.role as RoleFilter) : fallback.role,
      currentHero: typeof candidate?.currentHero === 'string' ? candidate.currentHero : null,
      completedHeroes: Array.isArray(candidate?.completedHeroes) ? candidate.completedHeroes.filter((hero): hero is string => typeof hero === 'string') : [],
      progressTarget: Math.max(1, Math.min(999, Number(candidate?.progressTarget) || 10)),
      notes: typeof candidate?.notes === 'string' ? candidate.notes : '',
    };
  });

  return {
    version: 3,
    playerCount: Math.max(1, Math.min(5, Number(input.playerCount) || defaults.playerCount)),
    players,
    excludedHeroes: Array.isArray(input.excludedHeroes) ? input.excludedHeroes.filter((hero): hero is string => typeof hero === 'string') : [],
    favoriteHeroes: Array.isArray(input.favoriteHeroes) ? input.favoriteHeroes.filter((hero): hero is string => typeof hero === 'string') : [],
    uniqueHeroes: typeof input.uniqueHeroes === 'boolean' ? input.uniqueHeroes : true,
    matches: Array.isArray(input.matches) ? input.matches.filter((match): match is NormalMatch => !!match && (match.result === 'W' || match.result === 'L')) : [],
    completionStreak: Math.max(0, Number(input.completionStreak) || 0),
    bestCompletionStreak: Math.max(0, Number(input.bestCompletionStreak) || 0),
  };
}

export function readNormalSession(): NormalSession {
  const current = safeRead<NormalSession>(NORMAL_STORAGE_KEY);
  if (current && typeof current === 'object') return normalizeNormalSession(current);

  const defaults = createDefaultNormalSession();
  const names = safeRead<Record<string, string>>('ow2_names');
  const roles = safeRead<Record<string, RoleFilter>>('ow2_roles');
  const lineup = safeRead<Record<string, string | null>>('ow2_lineup');
  const completed = safeRead<Record<string, string[]>>('ow2_completed_heroes');
  const progress = safeRead<Record<string, { completed?: number; target?: number; notes?: string }>>('ow2_progress');
  const disabled = safeRead<Record<string, boolean>>('ow2_disabled_heroes');
  const favorites = safeRead<Record<string, boolean>>('ow2_favorites');
  const legacyLog = safeRead<Array<{ id?: string; at?: number; result?: 'W' | 'L'; slots?: Array<{ name?: string; hero?: string | null; role?: RoleFilter }> }>>('ow2_match_log');

  const players = defaults.players.map((player) => {
    const playerProgress = recordValue(progress, player.id, {});
    return {
      ...player,
      name: recordValue(names, player.id, player.name),
      role: recordValue(roles, player.id, player.role),
      currentHero: recordValue(lineup, player.id, null),
      completedHeroes: recordValue(completed, player.id, []),
      progressTarget: Math.max(1, Number(playerProgress.target) || 10),
      notes: typeof playerProgress.notes === 'string' ? playerProgress.notes : '',
    };
  });

  const migrated: NormalSession = {
    ...defaults,
    playerCount: Math.max(1, Math.min(5, safeRead<number>('ow2_player_count') ?? 3)),
    players,
    excludedHeroes: disabled ? Object.keys(disabled).filter((hero) => disabled[hero]) : [],
    favoriteHeroes: favorites ? Object.keys(favorites).filter((hero) => favorites[hero]) : [],
    uniqueHeroes: safeRead<boolean>('ow2_unique_team') ?? true,
    completionStreak: safeRead<number>('ow2_completion_streak') ?? 0,
    bestCompletionStreak: safeRead<number>('ow2_completion_streak_best') ?? 0,
    matches: Array.isArray(legacyLog)
      ? legacyLog.filter((entry) => entry.result === 'W' || entry.result === 'L').map((entry, index) => ({
          id: entry.id ?? 'legacy-' + index,
          at: Number(entry.at) || Date.now(),
          result: entry.result as 'W' | 'L',
          heroes: Array.isArray(entry.slots)
            ? entry.slots.map((slot, slotIndex) => ({
                player: slot.name ?? 'Player ' + (slotIndex + 1),
                hero: slot.hero ?? null,
                role: slot.role ?? 'All',
              }))
            : [],
        }))
      : [],
  };
  return normalizeNormalSession(migrated);
}

export function migrateLegacyNormalBackup(input: Record<string, unknown>): NormalSession {
  const defaults = createDefaultNormalSession();
  const names = input.playerNames as Record<string, string> | undefined;
  const roles = input.playerRoles as Record<string, RoleFilter> | undefined;
  const lineup = input.lineup as Record<string, string | null> | undefined;
  const completed = input.completedHeroes as Record<string, string[]> | undefined;
  const progress = input.progress as Record<string, { target?: number; notes?: string }> | undefined;
  const disabled = input.disabledHeroes as Record<string, boolean> | undefined;
  const favorites = input.favorites as Record<string, boolean> | undefined;
  const matchLog = input.matchLog as Array<{ id?: string; at?: number; result?: 'W' | 'L'; slots?: Array<{ name?: string; hero?: string | null; role?: RoleFilter }> }> | undefined;
  return normalizeNormalSession({
    ...defaults,
    playerCount: Math.max(1, Math.min(5, Number(input.playerCount) || 3)),
    players: defaults.players.map((player) => ({
      ...player,
      name: recordValue(names ?? null, player.id, player.name),
      role: recordValue(roles ?? null, player.id, player.role),
      currentHero: recordValue(lineup ?? null, player.id, null),
      completedHeroes: recordValue(completed ?? null, player.id, []),
      progressTarget: Math.max(1, Number(recordValue(progress ?? null, player.id, {}).target) || 10),
      notes: recordValue(progress ?? null, player.id, {}).notes ?? '',
    })),
    excludedHeroes: disabled ? Object.keys(disabled).filter((hero) => disabled[hero]) : [],
    favoriteHeroes: favorites ? Object.keys(favorites).filter((hero) => favorites[hero]) : [],
    uniqueHeroes: typeof input.uniqueTeam === 'boolean' ? input.uniqueTeam : true,
    matches: Array.isArray(matchLog) ? matchLog.filter((entry) => entry.result === 'W' || entry.result === 'L').map((entry, index) => ({
      id: entry.id ?? 'import-' + index,
      at: Number(entry.at) || Date.now(),
      result: entry.result as 'W' | 'L',
      heroes: Array.isArray(entry.slots) ? entry.slots.map((slot, slotIndex) => ({ player: slot.name ?? 'Player ' + (slotIndex + 1), hero: slot.hero ?? null, role: slot.role ?? 'All' })) : [],
    })) : [],
    completionStreak: Math.max(0, Number(input.completionStreak) || 0),
    bestCompletionStreak: Math.max(0, Number(input.bestCompletionStreak) || 0),
  });
}

export function createDefaultNuzlockeStore(): NuzlockeStore {
  return {
    version: 1,
    draftRules: { ...DEFAULT_NUZLOCKE_RULES },
    currentRun: null,
    runHistory: [],
  };
}

export function readNuzlockeStore(): NuzlockeStore {
  const stored = safeRead<Partial<NuzlockeStore>>(NUZLOCKE_STORAGE_KEY);
  return normalizeNuzlockeStore(stored);
}

export function normalizeNuzlockeStore(stored: Partial<NuzlockeStore> | null | undefined): NuzlockeStore {
  const defaults = createDefaultNuzlockeStore();
  if (!stored || typeof stored !== 'object') return defaults;
  const draftRules = normalizeNuzlockeRules(stored.draftRules);

  let currentRun: NuzlockeRun | null = null;
  const candidate = stored.currentRun;
  if (candidate && candidate.version === 1 && (candidate.phase === 'active' || candidate.phase === 'completed') && candidate.rules && candidate.heroRecords) {
    const runRules = normalizeNuzlockeRules({ ...draftRules, ...candidate.rules });
    const heroRecords = { ...candidate.heroRecords };
    HEROES.forEach((hero) => {
      const record = heroRecords[hero.name];
      const recordLives = Number(record?.lives);
      heroRecords[hero.name] = {
        lives: record?.state === 'eliminated'
          ? 0
          : Math.max(0, Number.isFinite(recordLives) ? Math.floor(recordLives) : runRules.livesPerHero),
        wins: Math.max(0, Number(record?.wins) || 0),
        losses: Math.max(0, Number(record?.losses) || 0),
        selections: Math.max(0, Number(record?.selections) || 0),
        state: record?.state === 'completed' || record?.state === 'eliminated' ? record.state : 'available',
        lastUsedAt: typeof record?.lastUsedAt === 'number' ? record.lastUsedAt : null,
      };
    });
    const legacyCandidate = candidate as typeof candidate & { currentHero?: unknown; lastHero?: unknown };
    const normalizePlayers = (players: unknown, legacyCurrent?: unknown, legacyLast?: unknown, legacyLives?: unknown) => Array.from({ length: runRules.playerCount }, (_, index) => {
      const source = Array.isArray(players) ? players.find((player) => player && typeof player === 'object' && Number((player as { id?: unknown }).id) === index + 1) as { name?: unknown; currentHero?: unknown; lastHero?: unknown; remainingLives?: unknown } | undefined : undefined;
      const currentHero = source?.currentHero ?? (index === 0 ? legacyCurrent : null);
      const lastHero = source?.lastHero ?? (index === 0 ? legacyLast : null);
      return {
        id: (index + 1) as PlayerId,
        name: typeof source?.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 24) : runRules.playerNames[index],
        currentHero: typeof currentHero === 'string' && heroRecords[currentHero] ? currentHero : null,
        lastHero: typeof lastHero === 'string' && heroRecords[lastHero] ? lastHero : null,
        remainingLives: clampedNumber(source?.remainingLives, Number(legacyLives) || runRules.totalLives, 0, runRules.totalLives),
      };
    });
    const players = normalizePlayers(candidate.players, legacyCandidate.currentHero, legacyCandidate.lastHero, candidate.remainingLives);
    const undoCandidate = candidate.undoSnapshot as (typeof candidate.undoSnapshot & { currentHero?: unknown; lastHero?: unknown }) | null;
    const undoSnapshot = undoCandidate && typeof undoCandidate === 'object' ? {
      ...undoCandidate,
      players: normalizePlayers(undoCandidate.players, undoCandidate.currentHero, undoCandidate.lastHero, undoCandidate.remainingLives),
      events: Array.isArray(undoCandidate.events) ? undoCandidate.events.map((event) => ({ ...event, heroes: Array.isArray(event.heroes) ? event.heroes : event.hero ? [event.hero] : [] })) : [],
    } : null;
    if (undoSnapshot) undoSnapshot.remainingLives = undoSnapshot.players.reduce((total, player) => total + player.remainingLives, 0);
    currentRun = {
      ...candidate,
      rules: runRules,
      heroRecords,
      players,
      wins: Math.max(0, Number(candidate.wins) || 0),
      losses: Math.max(0, Number(candidate.losses) || 0),
      remainingLives: players.reduce((total, player) => total + player.remainingLives, 0),
      currentStreak: Math.max(0, Number(candidate.currentStreak) || 0),
      longestStreak: Math.max(0, Number(candidate.longestStreak) || 0),
      roleCursor: Math.max(0, Number(candidate.roleCursor) || 0),
      events: Array.isArray(candidate.events) ? candidate.events.map((event) => ({ ...event, heroes: Array.isArray(event.heroes) ? event.heroes : event.hero ? [event.hero] : [] })) : [],
      undoSnapshot,
    };
  }

  return {
    version: 1,
    draftRules,
    currentRun,
    runHistory: Array.isArray(stored.runHistory) ? stored.runHistory.filter((summary) =>
      summary && typeof summary.id === 'string' && typeof summary.wins === 'number' && typeof summary.losses === 'number' && typeof summary.longestStreak === 'number',
    ).slice(0, 12) : [],
  };
}

export function readPreferences(): AppPreferences {
  const stored = safeRead<Partial<AppPreferences>>(PREFERENCES_STORAGE_KEY);
  const legacyTheme = safeRead<'dark' | 'light'>('ow2_theme');
  return normalizePreferences(stored, legacyTheme);
}

export function normalizePreferences(input: Partial<AppPreferences> | null | undefined, legacyTheme?: 'dark' | 'light' | null): AppPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    version: 1,
    mode: input?.mode === 'nuzlocke' ? 'nuzlocke' : 'normal',
    theme: input?.theme === 'light' || legacyTheme === 'light' ? 'light' : 'dark',
    compactCards: typeof input?.compactCards === 'boolean' ? input.compactCards : DEFAULT_PREFERENCES.compactCards,
    reducedEffects: typeof input?.reducedEffects === 'boolean' ? input.reducedEffects : DEFAULT_PREFERENCES.reducedEffects,
  };
}

function normalizeRankPosition(input: Partial<RankPosition> | null | undefined, fallback: RankPosition, allowPlacements = true): RankPosition {
  if (allowPlacements && input?.rank === 'Placements') return { rank: 'Placements', division: null };
  const fallbackRank = fallback.rank === 'Placements' ? DEFAULT_RANK_CHALLENGE_CONFIG.startingPosition.rank : fallback.rank;
  const fallbackDivision = fallback.division ?? DEFAULT_RANK_CHALLENGE_CONFIG.startingPosition.division;
  const rank = RANKS.includes(input?.rank as typeof RANKS[number]) ? input?.rank as typeof RANKS[number] : fallbackRank;
  const division = DIVISIONS.includes(Number(input?.division) as typeof DIVISIONS[number]) ? Number(input?.division) as typeof DIVISIONS[number] : fallbackDivision;
  return { rank, division };
}

function normalizeRankConfig(input: Partial<RankChallengeConfig> | null | undefined): RankChallengeConfig {
  const queue = input?.queue;
  return {
    startingPosition: normalizeRankPosition(input?.startingPosition, DEFAULT_RANK_CHALLENGE_CONFIG.startingPosition),
    goalPosition: normalizeRankPosition(input?.goalPosition, DEFAULT_RANK_CHALLENGE_CONFIG.goalPosition, false),
    queue: queue === 'Tank' || queue === 'Damage' || queue === 'Support' || queue === 'Open Queue' || queue === 'All' ? queue : 'All',
    randomizeAfterMatch: typeof input?.randomizeAfterMatch === 'boolean' ? input.randomizeAfterMatch : true,
    requiredWins: input?.requiredWins == null ? null : clampedNumber(input.requiredWins, 1, 1, 999),
    matchLimit: input?.matchLimit == null ? null : clampedNumber(input.matchLimit, 1, 1, 999),
  };
}

function validRankEndReason(value: unknown): RankChallengeEndReason {
  return value === 'rank-goal' || value === 'required-wins' || value === 'match-limit' || value === 'ended' || value === 'nuzlocke-ended' ? value : null;
}

function normalizeRankEvents(input: unknown, fallback: RankPosition): RankChallengeEvent[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is RankChallengeEvent => !!item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => ({
      ...item,
      at: Number(item.at) || Date.now(),
      type: item.type === 'result' || item.type === 'rank' || item.type === 'end' ? item.type : 'start',
      detail: typeof item.detail === 'string' ? item.detail : '',
      hero: typeof item.hero === 'string' ? item.hero : null,
      result: item.result === 'W' || item.result === 'L' ? item.result : null,
      position: normalizeRankPosition(item.position, fallback),
      wins: Math.max(0, Number(item.wins) || 0),
      losses: Math.max(0, Number(item.losses) || 0),
    }));
}

function normalizeRankSnapshot(input: Partial<RankChallengeSnapshot> | null | undefined, fallback: RankPosition): RankChallengeSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  return {
    phase: input.phase === 'completed' ? 'completed' : 'active',
    currentPosition: normalizeRankPosition(input.currentPosition, fallback),
    wins: Math.max(0, Number(input.wins) || 0),
    losses: Math.max(0, Number(input.losses) || 0),
    heroesUsed: Array.isArray(input.heroesUsed) ? input.heroesUsed.filter((hero): hero is string => typeof hero === 'string' && !!HEROES.find((item) => item.name === hero)) : [],
    events: normalizeRankEvents(input.events, fallback),
    endedAt: typeof input.endedAt === 'number' ? input.endedAt : null,
    endReason: validRankEndReason(input.endReason),
  };
}

function normalizeRankChallenge(input: Partial<RankChallenge> | null | undefined, mode: 'normal' | 'nuzlocke'): RankChallenge | null {
  if (!input || input.version !== 1 || typeof input.id !== 'string') return null;
  const config = normalizeRankConfig(input.config);
  const currentPosition = normalizeRankPosition(input.currentPosition, config.startingPosition);
  const phase = input.phase === 'completed' ? 'completed' : 'active';
  const endReason = phase === 'completed' ? validRankEndReason(input.endReason) ?? 'ended' : null;
  return {
    id: input.id,
    version: 1,
    mode,
    phase,
    config,
    currentPosition,
    wins: Math.max(0, Number(input.wins) || 0),
    losses: Math.max(0, Number(input.losses) || 0),
    heroesUsed: Array.isArray(input.heroesUsed) ? input.heroesUsed.filter((hero): hero is string => typeof hero === 'string' && !!HEROES.find((item) => item.name === hero)) : [],
    events: normalizeRankEvents(input.events, currentPosition),
    startedAt: Number(input.startedAt) || Date.now(),
    endedAt: phase === 'completed' ? Number(input.endedAt) || Date.now() : null,
    endReason,
    undoSnapshot: normalizeRankSnapshot(input.undoSnapshot, currentPosition),
    undoAction: input.undoAction === 'result' || input.undoAction === 'rank' || input.undoAction === 'end' ? input.undoAction : null,
  };
}

export function createDefaultRankChallengeStore(): RankChallengeStore {
  return { version: 1, normal: null, nuzlocke: null };
}

export function normalizeRankChallengeStore(input: Partial<RankChallengeStore> | null | undefined): RankChallengeStore {
  if (!input || typeof input !== 'object') return createDefaultRankChallengeStore();
  return {
    version: 1,
    normal: normalizeRankChallenge(input.normal, 'normal'),
    nuzlocke: normalizeRankChallenge(input.nuzlocke, 'nuzlocke'),
  };
}

export function readRankChallengeStore(): RankChallengeStore {
  return normalizeRankChallengeStore(safeRead<Partial<RankChallengeStore>>(RANK_CHALLENGE_STORAGE_KEY));
}

export function usePersistentState<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory session still works.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
