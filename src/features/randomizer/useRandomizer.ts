import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HEROES, HERO_BY_ID, ROLES, type Hero, type Role } from '../../data/heroes';
import { buildReel, drawLineup, filterPool, remainingPool, type LineupPick, type PlayerRole } from '../../lib/randomizer';
import { readJson, writeJson } from '../../lib/storage';
import { useSystemReducedMotion } from '../../hooks/useMediaQuery';

export type MotionPref = 'full' | 'fast' | 'off';

export const MAX_PLAYERS = 5;
export const PLAYER_NAME_LIMIT = 16;

export interface HistoryEntry {
  id: string;
  at: number;
  reroll: boolean;
  /** Who it was rolled for, when rolling for a team. */
  who?: string;
}

export interface Player {
  /** Empty until renamed. The display name falls back to "Player N". */
  name: string;
  role: PlayerRole;
  heroId: string | null;
}

export interface RandomizerState {
  roles: Role[];
  excluded: string[];
  noRepeats: boolean;
  motion: MotionPref;
  used: string[];
  history: HistoryEntry[];
  partySize: number;
  players: Player[];
  rolls: number;
}

export interface SlotSpin {
  slot: number;
  winner: Hero;
  tiles: Hero[];
  winnerIndex: number;
  duration: number;
}

export interface Spin {
  reels: SlotSpin[];
  duration: number;
}

interface PendingResult {
  picks: LineupPick[];
  used: string[];
  reroll: boolean;
  cycleRestarted: boolean;
}

const STORAGE_KEY = 'ow2.randomizer.v1';
const HISTORY_LIMIT = 30;

const SPIN_PROFILES = {
  full: { roll: { duration: 2600, tiles: 46, winner: 40 }, reroll: { duration: 1500, tiles: 28, winner: 22 } },
  fast: { roll: { duration: 1050, tiles: 24, winner: 18 }, reroll: { duration: 700, tiles: 16, winner: 11 } },
};

/** Team reels stop one after another, left to right. */
function teamSpinProfile(motion: 'full' | 'fast', reroll: boolean, order: number) {
  const fast = motion === 'fast';
  const duration = (fast ? (reroll ? 550 : 750) : reroll ? 1200 : 1700) + order * (fast ? 120 : 320);
  const tiles = Math.round(duration / (fast ? 55 : 70));
  return { duration, tiles, winner: tiles - 1 };
}

/** Role assignments for a team, following the game's 1 tank, 2 damage, 2 support queue. */
const TEAM_ROLES: Record<number, PlayerRole[]> = {
  1: ['any'],
  2: ['damage', 'support'],
  3: ['tank', 'damage', 'support'],
  4: ['tank', 'damage', 'damage', 'support'],
  5: ['tank', 'damage', 'damage', 'support', 'support'],
};

const emptyPlayers = (): Player[] => Array.from({ length: MAX_PLAYERS }, () => ({ name: '', role: 'any' as PlayerRole, heroId: null }));

const DEFAULT_STATE: RandomizerState = {
  roles: [...ROLES],
  excluded: [],
  noRepeats: false,
  motion: 'full',
  used: [],
  history: [],
  partySize: 1,
  players: emptyPlayers(),
  rolls: 0,
};

export function playerName(player: Player, index: number) {
  return player.name.trim() || `Player ${index + 1}`;
}

function loadPlayers(saved: unknown, legacyHeroId: unknown): Player[] {
  const list = Array.isArray(saved) ? saved : [];
  const isHero = (id: unknown): id is string => typeof id === 'string' && id in HERO_BY_ID;
  const seen = new Set<string>();
  const players = emptyPlayers().map((blank, index) => {
    const entry = list[index] ?? {};
    const heroId = isHero(entry.heroId) && !seen.has(entry.heroId) ? entry.heroId : null;
    if (heroId) seen.add(heroId);
    return {
      name: typeof entry.name === 'string' ? entry.name.slice(0, PLAYER_NAME_LIMIT) : blank.name,
      role: entry.role === 'tank' || entry.role === 'damage' || entry.role === 'support' ? (entry.role as PlayerRole) : 'any',
      heroId,
    };
  });
  // Saves from before teams existed held one hero in `currentId`.
  if (!players[0].heroId && isHero(legacyHeroId)) players[0].heroId = legacyHeroId;
  return players;
}

function loadState(): RandomizerState {
  const saved = readJson<Partial<RandomizerState> & { currentId?: unknown }>(STORAGE_KEY);
  if (!saved || typeof saved !== 'object') return DEFAULT_STATE;
  const knownIds = (ids: unknown) => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id in HERO_BY_ID) : []);
  const roles = Array.isArray(saved.roles) ? ROLES.filter((role) => saved.roles?.includes(role)) : [];
  const partySize = Number(saved.partySize);
  return {
    roles: roles.length ? roles : [...ROLES],
    excluded: knownIds(saved.excluded),
    noRepeats: saved.noRepeats === true,
    motion: saved.motion === 'fast' || saved.motion === 'off' ? saved.motion : 'full',
    used: knownIds(saved.used),
    history: Array.isArray(saved.history)
      ? saved.history.filter((entry) => entry && entry.id in HERO_BY_ID && typeof entry.at === 'number').slice(0, HISTORY_LIMIT)
      : [],
    partySize: Number.isInteger(partySize) && partySize >= 1 && partySize <= MAX_PLAYERS ? partySize : 1,
    players: loadPlayers(saved.players, saved.currentId),
    rolls: typeof saved.rolls === 'number' && saved.rolls > 0 ? saved.rolls : 0,
  };
}

export function useRandomizer(notify: (message: string) => void) {
  const [state, setState] = useState<RandomizerState>(loadState);
  const [spin, setSpin] = useState<Spin | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const [revealSlots, setRevealSlots] = useState<number[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef<PendingResult | null>(null);
  // Held in a ref so a re-render during a spin cannot restart the timer below.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const systemReduced = useSystemReducedMotion();
  const motion: MotionPref = systemReduced ? 'off' : state.motion;
  const spinning = spin !== null;

  useEffect(() => {
    writeJson(STORAGE_KEY, state);
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  const pool = useMemo(() => filterPool(HEROES, state), [state]);
  const remaining = useMemo(() => remainingPool(HEROES, state), [state]);

  const commit = useCallback((result: PendingResult) => {
    const at = Date.now();
    setState((current) => {
      const players = [...current.players];
      const entries: HistoryEntry[] = [];
      for (const pick of result.picks) {
        players[pick.slot] = { ...players[pick.slot], heroId: pick.hero?.id ?? null };
        if (pick.hero) {
          entries.push({ id: pick.hero.id, at, reroll: result.reroll, ...(current.partySize > 1 ? { who: playerName(players[pick.slot], pick.slot) } : {}) });
        }
      }
      return { ...current, players, used: result.used, rolls: current.rolls + 1, history: [...entries, ...current.history].slice(0, HISTORY_LIMIT) };
    });
    setSpin(null);
    setRevealKey((key) => key + 1);
    setRevealSlots(result.picks.map((pick) => pick.slot));
    setAnnouncement(
      result.picks
        .map((pick) => (pick.hero ? `${pick.hero.name}, ${pick.hero.role}` : 'no eligible hero'))
        .map((text, index) => (result.picks.length > 1 ? `Player ${result.picks[index].slot + 1}: ${text}` : `Selected ${text}`))
        .join('. ') + '.',
    );
    const missing = result.picks.filter((pick) => !pick.hero);
    if (missing.length > 0) {
      notifyRef.current(`Not enough eligible heroes for ${missing.length === 1 ? 'one player' : `${missing.length} players`}. Allow more roles or include more heroes.`);
    } else if (result.cycleRestarted) {
      notifyRef.current('Every eligible hero has come up, so the no-repeat cycle started over.');
    }
  }, []);

  const rollSlots = useCallback(
    (slots: number[], reroll: boolean) => {
      if (spinning) return;
      const rolling = new Set(slots);
      const locked = state.players
        .slice(0, state.partySize)
        .filter((_, index) => !rolling.has(index))
        .flatMap((player) => (player.heroId ? [player.heroId] : []));

      const draw = drawLineup(HEROES, {
        ...state,
        locked,
        slots: slots.map((slot) => ({ slot, role: state.players[slot].role, previousId: state.players[slot].heroId, avoidPrevious: reroll })),
      });
      const filled = draw.picks.filter((pick): pick is LineupPick & { hero: Hero } => pick.hero !== null);
      if (filled.length === 0) {
        notifyRef.current('No heroes are eligible. Allow a role or include some heroes first.');
        return;
      }

      const result: PendingResult = { picks: draw.picks, used: draw.used, reroll, cycleRestarted: draw.cycleRestarted };
      if (motion === 'off' || filled.every((pick) => pick.candidates.length < 2)) {
        commit(result);
        return;
      }

      const activeMotion = motion;
      const reels = filled.map((pick, order): SlotSpin => {
        const profile = state.partySize > 1 ? teamSpinProfile(activeMotion, reroll, order) : SPIN_PROFILES[activeMotion][reroll ? 'reroll' : 'roll'];
        return {
          slot: pick.slot,
          winner: pick.hero,
          tiles: buildReel(pick.candidates, pick.hero, profile.tiles, profile.winner),
          winnerIndex: profile.winner,
          duration: profile.duration,
        };
      });
      pending.current = result;
      setAnnouncement(state.partySize > 1 ? 'Randomizing team.' : 'Randomizing hero.');
      setSpin({ reels, duration: Math.max(...reels.map((reel) => reel.duration)) });
    },
    [commit, motion, spinning, state],
  );

  const roll = useCallback(
    (reroll = false) => rollSlots(Array.from({ length: state.partySize }, (_, index) => index), reroll),
    [rollSlots, state.partySize],
  );
  const rerollPlayer = useCallback((slot: number) => rollSlots([slot], true), [rollSlots]);

  // The result is committed by this timer, not by the animation, so leaving the page mid-spin never loses a roll.
  useEffect(() => {
    if (!spin) return;
    const timer = window.setTimeout(() => {
      if (pending.current) commit(pending.current);
      pending.current = null;
    }, spin.duration + 40);
    return () => window.clearTimeout(timer);
  }, [commit, spin]);

  const update = useCallback(
    (patch: (current: RandomizerState) => RandomizerState) => {
      if (spinning) return;
      setState(patch);
    },
    [spinning],
  );

  const focusRole = useCallback(
    (role: Role | 'all') => update((current) => ({ ...current, roles: role === 'all' ? [...ROLES] : [role] })),
    [update],
  );

  const toggleRole = useCallback(
    (role: Role) =>
      update((current) => {
        const roles = current.roles.includes(role) ? current.roles.filter((item) => item !== role) : ROLES.filter((item) => item === role || current.roles.includes(item));
        return roles.length ? { ...current, roles } : current;
      }),
    [update],
  );

  const toggleHero = useCallback(
    (id: string) =>
      update((current) => ({
        ...current,
        excluded: current.excluded.includes(id) ? current.excluded.filter((item) => item !== id) : [...current.excluded, id],
      })),
    [update],
  );

  const setExcluded = useCallback(
    (ids: string[], excluded: boolean) =>
      update((current) => {
        const next = new Set(current.excluded);
        ids.forEach((id) => (excluded ? next.add(id) : next.delete(id)));
        return { ...current, excluded: [...next] };
      }),
    [update],
  );

  const setNoRepeats = useCallback((noRepeats: boolean) => update((current) => ({ ...current, noRepeats })), [update]);
  const setMotion = useCallback((value: MotionPref) => update((current) => ({ ...current, motion: value })), [update]);
  const clearUsed = useCallback(() => update((current) => ({ ...current, used: [] })), [update]);
  const clearHistory = useCallback(() => update((current) => ({ ...current, history: [], used: [] })), [update]);

  const setPartySize = useCallback(
    (partySize: number) => update((current) => ({ ...current, partySize: Math.min(MAX_PLAYERS, Math.max(1, partySize)) })),
    [update],
  );

  const patchPlayer = useCallback(
    (slot: number, patch: Partial<Player>) =>
      update((current) => ({ ...current, players: current.players.map((player, index) => (index === slot ? { ...player, ...patch } : player)) })),
    [update],
  );
  const setPlayerName = useCallback((slot: number, name: string) => patchPlayer(slot, { name: name.slice(0, PLAYER_NAME_LIMIT) }), [patchPlayer]);
  const setPlayerRole = useCallback((slot: number, role: PlayerRole) => patchPlayer(slot, { role }), [patchPlayer]);

  const assignTeamRoles = useCallback(
    () =>
      update((current) => {
        const roles = TEAM_ROLES[current.partySize];
        return { ...current, players: current.players.map((player, index) => (index < roles.length ? { ...player, role: roles[index] } : player)) };
      }),
    [update],
  );
  const clearPlayerRoles = useCallback(
    () => update((current) => ({ ...current, players: current.players.map((player) => ({ ...player, role: 'any' })) })),
    [update],
  );

  const resetAll = useCallback(() => {
    if (spinning) return null;
    const snapshot = state;
    setState({
      ...DEFAULT_STATE,
      motion: state.motion,
      partySize: state.partySize,
      players: state.players.map((player) => ({ ...player, role: 'any', heroId: null })),
    });
    return () => setState(snapshot);
  }, [spinning, state]);

  const team = useMemo(
    () =>
      state.players.slice(0, state.partySize).map((player, index) => ({
        ...player,
        index,
        displayName: playerName(player, index),
        hero: player.heroId ? HERO_BY_ID[player.heroId] : null,
      })),
    [state.partySize, state.players],
  );

  return {
    state,
    motion,
    systemReduced,
    spin,
    spinning,
    revealKey,
    revealSlots,
    announcement,
    pool,
    remaining,
    team,
    /** The first player's hero, which is the whole result when playing solo. */
    current: team[0].hero,
    roll,
    rerollPlayer,
    setPartySize,
    setPlayerName,
    setPlayerRole,
    assignTeamRoles,
    clearPlayerRoles,
    focusRole,
    toggleRole,
    toggleHero,
    setExcluded,
    setNoRepeats,
    setMotion,
    clearUsed,
    clearHistory,
    resetAll,
  };
}

export type RandomizerApi = ReturnType<typeof useRandomizer>;
export type TeamMember = RandomizerApi['team'][number];
