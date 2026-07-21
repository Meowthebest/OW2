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
  detail: string;
  wins: number;
  losses: number;
  remainingLives: number;
};

export type NuzlockeEndReason = 'goal' | 'no-lives' | 'no-heroes' | 'ended' | null;

export type NuzlockeSnapshot = {
  currentHero: string | null;
  lastHero: string | null;
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

export type NuzlockeRun = {
  id: string;
  version: 1;
  phase: 'active' | 'completed';
  rules: NuzlockeRules;
  startedAt: number;
  endedAt: number | null;
  endReason: NuzlockeEndReason;
  currentHero: string | null;
  lastHero: string | null;
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
