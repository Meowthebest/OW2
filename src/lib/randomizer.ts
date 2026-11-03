import type { Hero, Role } from '../data/heroes';

export type Rng = (maxExclusive: number) => number;

/** Unbiased integer in [0, max) using rejection sampling over crypto random values. */
export const secureRandomInt: Rng = (max) => {
  if (max <= 0) throw new RangeError('max must be positive');
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) return Math.floor(Math.random() * max);
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
};

export interface PoolFilters {
  roles: Role[];
  excluded: string[];
}

/** Heroes that pass the role and manual include/exclude filters. */
export function filterPool(heroes: Hero[], { roles, excluded }: PoolFilters): Hero[] {
  const excludedIds = new Set(excluded);
  return heroes.filter((hero) => roles.includes(hero.role) && !excludedIds.has(hero.id));
}

export interface DrawInput extends PoolFilters {
  noRepeats: boolean;
  used: string[];
  currentId: string | null;
  reroll?: boolean;
}

export type Draw =
  | { kind: 'empty' }
  | { kind: 'hero'; hero: Hero; candidates: Hero[]; used: string[]; cycleRestarted: boolean };

/** Heroes the next roll can land on, not counting a no-repeats cycle restart. */
export function remainingPool(heroes: Hero[], input: PoolFilters & { noRepeats: boolean; used: string[] }): Hero[] {
  const pool = filterPool(heroes, input);
  if (!input.noRepeats) return pool;
  const usedIds = new Set(input.used);
  return pool.filter((hero) => !usedIds.has(hero.id));
}

export function drawHero(heroes: Hero[], input: DrawInput, rng: Rng = secureRandomInt): Draw {
  const pool = filterPool(heroes, input);
  if (pool.length === 0) return { kind: 'empty' };

  let used = input.used;
  let candidates = remainingPool(heroes, input);
  let cycleRestarted = false;

  if (candidates.length === 0) {
    // Only the current pool starts over, so heroes used under other filters stay used.
    const poolIds = new Set(pool.map((hero) => hero.id));
    used = used.filter((id) => !poolIds.has(id));
    candidates = pool;
    cycleRestarted = true;
  }

  if ((input.reroll || cycleRestarted) && candidates.length > 1) {
    candidates = candidates.filter((hero) => hero.id !== input.currentId);
  }

  const hero = candidates[rng(candidates.length)];
  return {
    kind: 'hero',
    hero,
    candidates,
    used: used.includes(hero.id) ? used : [...used, hero.id],
    cycleRestarted,
  };
}

/** Decoy strip for the spin animation. It never influences the result: the winner is already drawn. */
export function buildReel(candidates: Hero[], winner: Hero, length: number, winnerIndex: number, rng: Rng = secureRandomInt): Hero[] {
  const tiles: Hero[] = [];
  for (let index = 0; index < length; index += 1) {
    if (index === winnerIndex) {
      tiles.push(winner);
      continue;
    }
    let pick = candidates[rng(candidates.length)];
    const previous = tiles[index - 1];
    const blocked = (hero: Hero) => hero.id === previous?.id || (index === winnerIndex - 1 && hero.id === winner.id);
    if (candidates.length > 2) {
      while (blocked(pick)) pick = candidates[rng(candidates.length)];
    }
    tiles.push(pick);
  }
  return tiles;
}
