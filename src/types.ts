export type AppMode = 'normal' | 'nuzlocke';
export type ThemeMode = 'dark' | 'light';
export type Role = 'Tank' | 'Damage' | 'Support';
export type RoleFilter = 'All' | Role;
export type PlayerId = 1 | 2 | 3 | 4 | 5;

export type Hero = {
  name: string;
  role: Role;
  image: string;
};

export type NormalPlayer = {
  id: PlayerId;
  name: string;
  role: RoleFilter;
  currentHero: string | null;
  completedHeroes: string[];
  progressTarget: number;
  notes: string;
};

export type NormalMatch = {
  id: string;
  at: number;
  result: 'W' | 'L';
  heroes: { player: string; hero: string | null; role: RoleFilter }[];
  rankPlayerId?: PlayerId;
};

export type NormalSession = {
  version: 3;
  playerCount: number;
  players: NormalPlayer[];
  excludedHeroes: string[];
  favoriteHeroes: string[];
  uniqueHeroes: boolean;
  matches: NormalMatch[];
  completionStreak: number;
  bestCompletionStreak: number;
};

export type RemoveRule = 'never' | 'win' | 'loss' | 'both';

export type NuzlockeRules = {
  playerCount: number;
  playerNames: string[];
  playerRoles: Role[][];
  roles: Role[];
  excludedHeroes: string[];
  duplicateSelections: boolean;
  removeRule: RemoveRule;
  livesPerHero: number;
  totalLives: number;
  requiredWins: number;
  roleQueue: boolean;
  autoAdvance: boolean;
  showEliminated: boolean;
  customRules: string;
};

export type NuzlockeHeroState = 'available' | 'completed' | 'eliminated';

export type NuzlockeHeroRecord = {
  lives: number;
  wins: number;
  losses: number;
  selections: number;
  state: NuzlockeHeroState;
  lastUsedAt: number | null;
};

export type NuzlockeEventType = 'start' | 'win' | 'loss' | 'reroll' | 'skip' | 'pick' | 'end';

export type NuzlockeEvent = {
  id: string;
  at: number;
  type: NuzlockeEventType;
  hero: string | null;
  heroes: string[];
  detail: string;
  wins: number;
  losses: number;
  remainingLives: number;
};

export type NuzlockeEndReason = 'goal' | 'no-lives' | 'no-heroes' | 'ended' | null;

export type NuzlockeSnapshot = {
  players: NuzlockePlayer[];
  heroRecords: Record<string, NuzlockeHeroRecord>;
  wins: number;
  losses: number;
  remainingLives: number;
  currentStreak: number;
  longestStreak: number;
  roleCursor: number;
  events: NuzlockeEvent[];
  phase: 'active' | 'completed';
  endedAt: number | null;
  endReason: NuzlockeEndReason;
};

export type NuzlockePlayer = {
  id: PlayerId;
  name: string;
  currentHero: string | null;
  lastHero: string | null;
};

export type NuzlockeRun = {
  id: string;
  version: 1;
  phase: 'active' | 'completed';
  rules: NuzlockeRules;
  startedAt: number;
  endedAt: number | null;
  endReason: NuzlockeEndReason;
  players: NuzlockePlayer[];
  heroRecords: Record<string, NuzlockeHeroRecord>;
  wins: number;
  losses: number;
  remainingLives: number;
  currentStreak: number;
  longestStreak: number;
  roleCursor: number;
  events: NuzlockeEvent[];
  undoSnapshot: NuzlockeSnapshot | null;
};

export type NuzlockeSummary = {
  id: string;
  startedAt: number;
  endedAt: number;
  endReason: Exclude<NuzlockeEndReason, null>;
  wins: number;
  losses: number;
  longestStreak: number;
  heroesUsed: number;
  heroesCompleted: number;
  heroesEliminated: number;
  remainingLives: number;
  durationMs: number;
  rules: NuzlockeRules;
  events: NuzlockeEvent[];
};

export type NuzlockeStore = {
  version: 1;
  draftRules: NuzlockeRules;
  currentRun: NuzlockeRun | null;
  runHistory: NuzlockeSummary[];
};

export type AppPreferences = {
  version: 1;
  mode: AppMode;
  theme: ThemeMode;
  compactCards: boolean;
  reducedEffects: boolean;
};

export type RankName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master' | 'Grandmaster';
export type RankTier = 'Placements' | RankName;
export type RankDivision = 5 | 4 | 3 | 2 | 1;
export type RankQueue = 'All' | Role | 'Open Queue';

export type RankPosition = {
  rank: RankTier;
  division: RankDivision | null;
};

export type RankChallengeConfig = {
  startingPosition: RankPosition;
  goalPosition: RankPosition;
  queue: RankQueue;
  randomizeAfterMatch: boolean;
  requiredWins: number | null;
  matchLimit: number | null;
};

export type RankChallengeEventType = 'start' | 'result' | 'rank' | 'end';
export type RankChallengeEndReason = 'rank-goal' | 'required-wins' | 'match-limit' | 'ended' | 'nuzlocke-ended' | null;

export type RankChallengeEvent = {
  id: string;
  at: number;
  type: RankChallengeEventType;
  detail: string;
  hero: string | null;
  result: 'W' | 'L' | null;
  position: RankPosition;
  wins: number;
  losses: number;
};

export type RankChallengeSnapshot = {
  phase: 'active' | 'completed';
  currentPosition: RankPosition;
  wins: number;
  losses: number;
  heroesUsed: string[];
  events: RankChallengeEvent[];
  endedAt: number | null;
  endReason: RankChallengeEndReason;
};

export type RankChallenge = {
  id: string;
  version: 1;
  mode: AppMode;
  phase: 'active' | 'completed';
  config: RankChallengeConfig;
  currentPosition: RankPosition;
  wins: number;
  losses: number;
  heroesUsed: string[];
  events: RankChallengeEvent[];
  startedAt: number;
  endedAt: number | null;
  endReason: RankChallengeEndReason;
  undoSnapshot: RankChallengeSnapshot | null;
  undoAction: RankChallengeEventType | null;
};

export type RankChallengeStore = {
  version: 1;
  normal: RankChallenge | null;
  nuzlocke: RankChallenge | null;
};
