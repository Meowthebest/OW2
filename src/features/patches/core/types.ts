import type { Role } from '../../../data/heroes';

/** How one change line affects a hero. "needs-review" means no rule or reviewer could say with confidence. */
export type Direction = 'buff' | 'nerf' | 'neutral' | 'qol' | 'bugfix' | 'needs-review';

/** A hero's overall result in one patch and one format. */
export type HeroClass = 'buff' | 'nerf' | 'mixed' | 'neutral' | 'fix' | 'needs-review';

/** Standard play is 5v5. 6v6 values, Stadium and limited-time modes are always kept apart from it. */
export type Scope = 'standard' | '6v6' | 'stadium' | 'limited';

/** Formats that get separate hero cards. 6v6 lines sit on the standard card, labeled and counted separately. */
export type CardGroup = 'standard' | 'stadium' | 'limited';

/** "all" unless Blizzard's line names one queue. */
export type Queue = 'all' | 'competitive' | 'quickplay';

export type ChangeKind = 'base' | 'weapon' | 'ability' | 'ultimate' | 'passive' | 'perk-minor' | 'perk-major' | 'perk' | 'power' | 'item' | 'fix';

export type StatCategory = 'health' | 'armor' | 'damage' | 'healing' | 'cooldown' | 'mobility' | 'ammo';

export type ClassifiedBy = 'rule' | 'review' | 'none';

export interface BalanceChange {
  /** patch/scope/hero/ability/line. Stable unless Blizzard reorders a block. */
  id: string;
  /** Links the same stat across patches. Null when the line has no numbers to compare. */
  series: string | null;
  heroId: string;
  heroName: string;
  /** From the patch's own section where it has one, because heroes can move roles. Null if the source gives none. */
  role: Role | null;
  scope: Scope;
  queue: Queue;
  kind: ChangeKind;
  /** Null for base stats such as health. */
  ability: string | null;
  stat: string | null;
  categories: StatCategory[];
  /** Only ever values Blizzard published. Null when the source does not state one. */
  previous: number | null;
  next: number | null;
  /** The stated change when a line gives only a difference, such as "reduced by 25%". */
  changeBy: number | null;
  unit: string | null;
  qualifier: string | null;
  /** A short factual label for a line with no numbers, such as "Removed". Written for this site. */
  note: string | null;
  percentChange: number | null;
  direction: Direction;
  situational: boolean;
  classifiedBy: ClassifiedBy;
  /** Written for this site. Never Blizzard's wording, which stays on their page. */
  summary: string | null;
  /** Fingerprint of the official line, used to detect edits without storing the text. */
  sourceHash: string;
}

export interface HeroNote {
  heroId: string;
  group: CardGroup;
  hasDeveloperComment: boolean;
  /** Written for this site as a summary of the published comment. */
  devIntent: string | null;
  summary: string | null;
}

export interface OtherItem {
  id: string;
  section: 'event' | 'general' | 'bugfix';
  group: string | null;
  title: string | null;
  summary: string | null;
  sourceHash: string | null;
}

export interface PatchRevision {
  detectedAt: string;
  previousHash: string;
  added: number;
  removed: number;
  changed: number;
}

export interface PatchCounts {
  /** Unique heroes in standard play, including 6v6-specific lines. Stadium and limited modes are separate. */
  heroesBuffed: number;
  heroesNerfed: number;
  heroesMixed: number;
  heroesNeutral: number;
  heroesNeedsReview: number;
  /** Individual lines in standard play. */
  buffs: number;
  nerfs: number;
  neutral: number;
  qol: number;
  needsReview: number;
  sixVsSix: number;
  gameplayChanges: number;
  stadiumHeroes: number;
  stadiumChanges: number;
  limitedHeroes: number;
  limitedChanges: number;
  bugFixes: number;
}

export type PatchType = 'season' | 'balance' | 'hotfix' | 'limited' | 'update';

export interface SeasonRef {
  id: string;
  label: string;
  year: number;
  number: number;
}

export interface PatchMeta {
  id: string;
  title: string;
  /** YYYY-MM-DD, taken from Blizzard's anchor for the patch. */
  date: string;
  type: PatchType;
  season: SeasonRef | null;
  sourceUrl: string;
  forumUrl: string | null;
  contentHash: string;
  firstImportedAt: string;
  lastVerifiedAt: string;
  reviewedAt: string | null;
  revisions: PatchRevision[];
  counts: PatchCounts;
}

export interface PatchFile extends PatchMeta {
  schema: 1;
  notes: HeroNote[];
  changes: BalanceChange[];
  other: OtherItem[];
}

export interface SeasonInfo {
  year: number;
  number: number;
  start: string;
}

export interface PatchIndex {
  schema: 1;
  source: string;
  lastCheckedAt: string;
  lastChangedAt: string;
  seasons: SeasonInfo[];
  patches: PatchMeta[];
}

/** Per-patch tallies for one hero and format, for history views that should not load every patch. */
export interface HeroPatchTally {
  patch: string;
  date: string;
  group: CardGroup;
  classification: HeroClass;
  buffs: number;
  nerfs: number;
  other: number;
  review: number;
}

export interface HeroHistoryIndex {
  schema: 1;
  heroes: Record<string, HeroPatchTally[]>;
}

export const OFFICIAL_ARCHIVE = 'https://overwatch.blizzard.com/en-us/news/patch-notes/live';
