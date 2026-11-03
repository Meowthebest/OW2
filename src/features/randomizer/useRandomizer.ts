import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HEROES, HERO_BY_ID, ROLES, type Hero, type Role } from '../../data/heroes';
import { buildReel, drawHero, filterPool, remainingPool } from '../../lib/randomizer';
import { readJson, writeJson } from '../../lib/storage';
import { useSystemReducedMotion } from '../../hooks/useMediaQuery';

export type MotionPref = 'full' | 'fast' | 'off';

export interface HistoryEntry {
  id: string;
  at: number;
  reroll: boolean;
}

export interface RandomizerState {
  roles: Role[];
  excluded: string[];
  noRepeats: boolean;
  motion: MotionPref;
  used: string[];
  history: HistoryEntry[];
  currentId: string | null;
  rolls: number;
}

export interface Spin {
  winner: Hero;
  tiles: Hero[];
  winnerIndex: number;
  duration: number;
}

interface PendingResult {
  winner: Hero;
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

const DEFAULT_STATE: RandomizerState = {
  roles: [...ROLES],
  excluded: [],
  noRepeats: false,
  motion: 'full',
  used: [],
  history: [],
  currentId: null,
  rolls: 0,
};

function loadState(): RandomizerState {
  const saved = readJson<Partial<RandomizerState>>(STORAGE_KEY);
  if (!saved || typeof saved !== 'object') return DEFAULT_STATE;
  const knownIds = (ids: unknown) => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id in HERO_BY_ID) : []);
  const roles = Array.isArray(saved.roles) ? ROLES.filter((role) => saved.roles?.includes(role)) : [];
  return {
    roles: roles.length ? roles : [...ROLES],
    excluded: knownIds(saved.excluded),
    noRepeats: saved.noRepeats === true,
    motion: saved.motion === 'fast' || saved.motion === 'off' ? saved.motion : 'full',
    used: knownIds(saved.used),
    history: Array.isArray(saved.history)
      ? saved.history.filter((entry) => entry && entry.id in HERO_BY_ID && typeof entry.at === 'number').slice(0, HISTORY_LIMIT)
      : [],
    currentId: typeof saved.currentId === 'string' && saved.currentId in HERO_BY_ID ? saved.currentId : null,
    rolls: typeof saved.rolls === 'number' && saved.rolls > 0 ? saved.rolls : 0,
  };
}

export function useRandomizer(notify: (message: string) => void) {
  const [state, setState] = useState<RandomizerState>(loadState);
  const [spin, setSpin] = useState<Spin | null>(null);
  const [revealKey, setRevealKey] = useState(0);
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

  const commit = useCallback(
    (result: PendingResult) => {
      setState((current) => ({
        ...current,
        currentId: result.winner.id,
        used: result.used,
        rolls: current.rolls + 1,
        history: [{ id: result.winner.id, at: Date.now(), reroll: result.reroll }, ...current.history].slice(0, HISTORY_LIMIT),
      }));
      setSpin(null);
      setRevealKey((key) => key + 1);
      setAnnouncement(`Selected ${result.winner.name}, ${result.winner.role}.`);
      if (result.cycleRestarted) notifyRef.current('Every eligible hero has come up, so the no-repeat cycle started over.');
    },
    [],
  );

  const roll = useCallback(
    (reroll = false) => {
      if (spinning) return;
      const draw = drawHero(HEROES, { ...state, reroll });
      if (draw.kind === 'empty') {
        notify('No heroes are eligible. Allow a role or include some heroes first.');
        return;
      }
      const result: PendingResult = { winner: draw.hero, used: draw.used, reroll, cycleRestarted: draw.cycleRestarted };
      if (motion === 'off' || draw.candidates.length < 2) {
        commit(result);
        return;
      }
      const profile = SPIN_PROFILES[motion][reroll ? 'reroll' : 'roll'];
      pending.current = result;
      setAnnouncement('Randomizing hero.');
      setSpin({
        winner: draw.hero,
        tiles: buildReel(draw.candidates, draw.hero, profile.tiles, profile.winner),
        winnerIndex: profile.winner,
        duration: profile.duration,
      });
    },
    [commit, motion, notify, spinning, state],
  );

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

  const resetAll = useCallback(() => {
    if (spinning) return null;
    const snapshot = state;
    setState({ ...DEFAULT_STATE, motion: state.motion });
    return () => setState(snapshot);
  }, [spinning, state]);

  return {
    state,
    motion,
    systemReduced,
    spin,
    spinning,
    revealKey,
    announcement,
    pool,
    remaining,
    current: state.currentId ? HERO_BY_ID[state.currentId] : null,
    roll,
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
