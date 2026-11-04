import type { BalanceChange, CardGroup, HeroClass, PatchCounts } from './types';

export interface HeroRollup {
  classification: HeroClass;
  buffs: number;
  nerfs: number;
  /** Buffs and nerfs that only apply in specific situations. */
  situationalBuffs: number;
  situationalNerfs: number;
  neutral: number;
  qol: number;
  fixes: number;
  review: number;
  sixVsSix: number;
  lean: 'buff' | 'nerf' | null;
}

export const cardGroup = (change: Pick<BalanceChange, 'scope'>): CardGroup =>
  change.scope === 'stadium' ? 'stadium' : change.scope === 'limited' ? 'limited' : 'standard';

/** A hero's overall class. Bug fixes never change it, and unreviewed lines are reported rather than guessed. */
export function rollupHero(changes: BalanceChange[]): HeroRollup {
  const count = (test: (change: BalanceChange) => boolean) => changes.filter(test).length;
  const buffs = count((change) => change.direction === 'buff');
  const nerfs = count((change) => change.direction === 'nerf');
  const situationalBuffs = count((change) => change.direction === 'buff' && change.situational);
  const situationalNerfs = count((change) => change.direction === 'nerf' && change.situational);
  const neutral = count((change) => change.direction === 'neutral');
  const qol = count((change) => change.direction === 'qol');
  const fixes = count((change) => change.direction === 'bugfix');
  const review = count((change) => change.direction === 'needs-review');
  const sixVsSix = count((change) => change.scope === '6v6');

  let classification: HeroClass;
  if (buffs > 0 && nerfs > 0) classification = 'mixed';
  else if (buffs > 0) classification = 'buff';
  else if (nerfs > 0) classification = 'nerf';
  else if (review > 0) classification = 'needs-review';
  else if (neutral > 0 || qol > 0) classification = 'neutral';
  else classification = 'fix';

  // A situational change weighs less than a direct one when judging which way a mixed result leans.
  const buffWeight = buffs - situationalBuffs * 0.5;
  const nerfWeight = nerfs - situationalNerfs * 0.5;
  const lean = classification !== 'mixed' || buffWeight === nerfWeight ? null : buffWeight > nerfWeight ? 'buff' : 'nerf';

  return { classification, buffs, nerfs, situationalBuffs, situationalNerfs, neutral, qol, fixes, review, sixVsSix, lean };
}

/** Headline numbers. Counts are unique heroes in standard play, with Stadium and limited modes kept apart. */
export function countPatch(changes: BalanceChange[], otherBugFixes: number): PatchCounts {
  const byHero = (group: CardGroup) => {
    const map = new Map<string, BalanceChange[]>();
    for (const change of changes) {
      if (cardGroup(change) !== group) continue;
      map.set(change.heroId, [...(map.get(change.heroId) ?? []), change]);
    }
    return map;
  };

  const standard = byHero('standard');
  const classes = [...standard.values()].map((list) => rollupHero(list).classification);
  const lines = changes.filter((change) => cardGroup(change) === 'standard');
  const stadium = changes.filter((change) => change.scope === 'stadium' && change.direction !== 'bugfix');
  const limited = changes.filter((change) => change.scope === 'limited' && change.direction !== 'bugfix');
  const countLines = (direction: BalanceChange['direction']) => lines.filter((change) => change.direction === direction).length;
  const stadiumHeroes = new Set(stadium.map((change) => change.heroId)).size;
  const limitedHeroes = new Set(limited.map((change) => change.heroId)).size;
  const buffs = countLines('buff');
  const nerfs = countLines('nerf');
  const neutral = countLines('neutral');
  const needsReview = countLines('needs-review');

  return {
    heroesBuffed: classes.filter((item) => item === 'buff').length,
    heroesNerfed: classes.filter((item) => item === 'nerf').length,
    heroesMixed: classes.filter((item) => item === 'mixed').length,
    heroesNeutral: classes.filter((item) => item === 'neutral').length,
    heroesNeedsReview: classes.filter((item) => item === 'needs-review').length,
    buffs,
    nerfs,
    neutral,
    qol: countLines('qol'),
    needsReview,
    sixVsSix: lines.filter((change) => change.scope === '6v6' && change.direction !== 'bugfix').length,
    gameplayChanges: buffs + nerfs + neutral + needsReview,
    stadiumHeroes,
    stadiumChanges: stadium.length,
    limitedHeroes,
    limitedChanges: limited.length,
    bugFixes: changes.filter((change) => change.direction === 'bugfix').length + otherBugFixes,
  };
}
