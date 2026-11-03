// Shapes returned by OverFast API (v4). Every statistic is optional: Blizzard's public
// profile can omit any of them, and the UI shows a dash rather than guessing a value.

export type GameMode = 'quickplay' | 'competitive';
export type ModeFilter = 'all' | GameMode;
export type Platform = 'pc' | 'console';
export type PlatformFilter = 'all' | Platform;

export interface PlayerSearchResult {
  player_id: string;
  name: string;
  avatar?: string | null;
  namecard?: string | null;
  title?: string | null;
  blizzard_id?: string;
  last_updated_at?: number | null;
  is_public?: boolean | null;
}

export interface PlayerSearchResponse {
  total: number;
  results: PlayerSearchResult[];
}

export interface CompetitiveRank {
  division: string;
  tier: number;
  role_icon?: string;
  rank_icon?: string;
  tier_icon?: string;
}

export interface PlatformRanks {
  season?: number | null;
  tank?: CompetitiveRank | null;
  damage?: CompetitiveRank | null;
  support?: CompetitiveRank | null;
  open?: CompetitiveRank | null;
}

export interface PlayerSummary {
  username?: string;
  avatar?: string | null;
  namecard?: string | null;
  title?: string | null;
  endorsement?: { level?: number; frame?: string } | null;
  competitive?: { pc?: PlatformRanks | null; console?: PlatformRanks | null } | null;
  last_updated_at?: number | null;
}

export interface StatGroup {
  eliminations?: number | null;
  assists?: number | null;
  deaths?: number | null;
  damage?: number | null;
  healing?: number | null;
}

export interface StatsBlock {
  games_played?: number | null;
  games_won?: number | null;
  games_lost?: number | null;
  /** Seconds. */
  time_played?: number | null;
  /** Percent, 0 to 100. */
  winrate?: number | null;
  kda?: number | null;
  total?: StatGroup | null;
  /** Per 10 minutes of play. */
  average?: StatGroup | null;
}

export interface StatsSummary {
  general?: StatsBlock | null;
  roles?: Partial<Record<'tank' | 'damage' | 'support', StatsBlock | null>> | null;
  heroes?: Record<string, StatsBlock | null> | null;
}

/** hero key ("all-heroes", "ana", ...) to category ("combat", "best", ...) to stat to value. */
export type CareerStats = Record<string, Record<string, Record<string, number | null> | null> | null>;
