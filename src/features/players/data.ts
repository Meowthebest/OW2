import { useEffect, useState, useSyncExternalStore } from 'react';
import { parseHours, parseLatest, parseSamples, type HourRow, type LatestFile, type Sample } from './core';

// Visitors never call Steam. A scheduled job records the count, and every visitor reads the same stored files,
// which GitHub caches for about five minutes. Steam also blocks direct browser requests.
const DATA_URL = import.meta.env.VITE_PLAYER_DATA_URL || 'https://raw.githubusercontent.com/Meowthebest/OW2/player-data/';

const POLL_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

export interface PlayerState {
  /** "empty" means recording has not started yet, so there is nothing to show and nothing has failed. */
  status: 'loading' | 'ready' | 'empty' | 'error';
  latest: LatestFile | null;
  /** When this browser last got a good answer. */
  fetchedAt: number | null;
  /** True if the most recent check failed while older data is still on screen. */
  checkFailed: boolean;
}

let state: PlayerState = { status: 'loading', latest: null, fetchedAt: null, checkFailed: false };
const listeners = new Set<() => void>();
let timer: number | null = null;
let failures = 0;
let inFlight: Promise<void> | null = null;

function setState(next: Partial<PlayerState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function schedule() {
  if (timer !== null) window.clearTimeout(timer);
  if (listeners.size === 0) return;
  // Wait longer after each failure, so an outage doesn't mean repeated requests from every open tab.
  const delay = Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
  timer = window.setTimeout(() => void refreshPlayers(), delay);
}

/** Reads the latest file. A failed or damaged read keeps what is already on screen. Calls made at once share one request. */
export function refreshPlayers(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch(`${DATA_URL}latest.json`, { cache: 'no-cache' });
      if (response.status === 404) {
        failures = 0;
        setState(state.latest ? { checkFailed: true } : { status: 'empty' });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const latest = parseLatest(await response.json());
      if (!latest) throw new Error('Unexpected data');
      failures = 0;
      setState({ status: 'ready', latest, fetchedAt: Date.now(), checkFailed: false });
    } catch {
      failures += 1;
      setState(state.latest ? { checkFailed: true } : { status: 'error' });
    } finally {
      inFlight = null;
      schedule();
    }
  })();
  return inFlight;
}

function onVisibility() {
  if (document.visibilityState !== 'visible') return;
  if (state.fetchedAt === null || Date.now() - state.fetchedAt >= POLL_MS) void refreshPlayers();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibility);
    if (state.fetchedAt === null || Date.now() - state.fetchedAt >= POLL_MS) void refreshPlayers();
    else schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }
  };
}

/** Shared across the widget and the full page, so both use one poll. */
export function usePlayerData(): PlayerState {
  return useSyncExternalStore(subscribe, () => state);
}

const fileCache = new Map<string, { version: string; request: Promise<unknown> }>();

function loadFile<T>(file: string, version: string, parse: (value: unknown) => T | null): Promise<T> {
  const cached = fileCache.get(file);
  if (cached && cached.version === version) return cached.request as Promise<T>;
  const request = fetch(`${DATA_URL}${file}`, { cache: 'no-cache' }).then(async (response) => {
    if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status})`);
    const parsed = parse(await response.json());
    if (parsed === null) throw new Error(`Unexpected data in ${file}`);
    return parsed;
  });
  fileCache.set(file, { version, request });
  request.catch(() => fileCache.delete(file));
  return request;
}

/** Version strings tie cached history to the latest reading, so charts refresh when new data arrives. */
export const loadRecent = (version: string) => loadFile<Sample[]>('recent.json', version, parseSamples);
export const loadHourly = (version: string) => loadFile<HourRow[]>('hourly.json', version, parseHours);

export interface HistoryState<T> {
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  retry: () => void;
}

/** Keeps the previous result until the new one arrives, so a chart holds its frame while refreshing. */
export function useHistory<T>(load: (version: string) => Promise<T>, version: string | null, enabled = true): HistoryState<T> {
  const [result, setResult] = useState<{ status: HistoryState<T>['status']; data: T | null }>({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!version || !enabled) return undefined;
    let live = true;
    setResult((current) => ({ status: 'loading', data: current.data }));
    load(version).then(
      (data) => {
        if (live) setResult({ status: 'ready', data });
      },
      () => {
        if (live) setResult((current) => ({ status: 'error', data: current.data }));
      },
    );
    return () => {
      live = false;
    };
  }, [load, version, enabled, attempt]);

  return { ...result, retry: () => setAttempt((value) => value + 1) };
}

/** A clock for relative times and stale checks. */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
