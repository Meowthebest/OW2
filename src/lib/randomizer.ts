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

/** Heroes the next roll can land on, not counting a no-repeats cycle restart. */
export function remainingPool(heroes: Hero[], input: PoolFilters & { noRepeats: boolean; used: string[] }): Hero[] {
  const pool = filterPool(heroes, input);
  if (!input.noRepeats) return pool;
  const usedIds = new Set(input.used);
  return pool.filter((hero) => !usedIds.has(hero.id));
}

export type PlayerRole = Role | 'any';

export interface LineupSlot {
  slot: number;
  role: PlayerRole;
  previousId: string | null;
  /** A reroll: land on someone else when any other hero is available. */
  avoidPrevious?: boolean;
}

export interface LineupInput extends PoolFilters {
  noRepeats: boolean;
  used: string[];
  slots: LineupSlot[];
  /** Heroes held by teammates who are not being rolled. */
  locked?: string[];
}

export interface LineupPick {
  slot: number;
  /** Null when no eligible hero is left for this player. */
  hero: Hero | null;
  candidates: Hero[];
}

export interface LineupDraw {
  picks: LineupPick[];
  used: string[];
  cycleRestarted: boolean;
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = rng(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Draws a different hero for each slot, uniformly from what that slot may play.
 * Role-locked players draw before "any role" players, so an open slot can never take the last
 * hero a locked teammate needed. Ties draw in random order, so no seat has an advantage.
 */
export function drawLineup(heroes: Hero[], input: LineupInput, rng: Rng = secureRandomInt): LineupDraw {
  const pool = filterPool(heroes, input);
  const poolFor = (slot: LineupSlot) => (slot.role === 'any' ? pool : pool.filter((hero) => hero.role === slot.role));
  const order = shuffled(input.slots, rng).sort((a, b) => poolFor(a).length - poolFor(b).length);

  const taken = new Set(input.locked ?? []);
  let used = input.used;
  let cycleRestarted = false;
  const picks: LineupPick[] = [];

  for (const slot of order) {
    const open = poolFor(slot).filter((hero) => !taken.has(hero.id));
    if (open.length === 0) {
      picks.push({ slot: slot.slot, hero: null, candidates: [] });
      continue;
    }

    const usedIds = new Set(used);
    let candidates = input.noRepeats ? open.filter((hero) => !usedIds.has(hero.id)) : open;
    let restarted = false;
    if (candidates.length === 0) {
      // Only this slot's pool starts over, so heroes used under other filters stay used.
      const poolIds = new Set(poolFor(slot).map((hero) => hero.id));
      used = used.filter((id) => !poolIds.has(id));
      candidates = open;
      restarted = true;
      cycleRestarted = true;
    }

    if ((slot.avoidPrevious || restarted) && candidates.length > 1) {
      candidates = candidates.filter((hero) => hero.id !== slot.previousId);
    }

    const hero = candidates[rng(candidates.length)];
    taken.add(hero.id);
    if (!used.includes(hero.id)) used = [...used, hero.id];
    picks.push({ slot: slot.slot, hero, candidates });
  }

  picks.sort((a, b) => a.slot - b.slot);
  return { picks, used, cycleRestarted };
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
