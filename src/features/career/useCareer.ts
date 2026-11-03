import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../../lib/storage';
import { careerStore } from './api';
import { requestKey, type CareerRequest } from './api/requests';
import type { Entry, RefreshOutcome } from './api/store';
import type { PlatformFilter, PlayerSummary, StatsSummary } from './api/types';

const IDLE: Entry = { status: 'idle', revalidating: false };
const noop = () => () => undefined;

export function useResource<T>(request: CareerRequest | null): Entry<T> {
  const key = request ? requestKey(request) : null;
  // The key fully identifies the request, so it is the only dependency these need.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subscribe = useCallback((listener: () => void) => (request ? careerStore.subscribe(request, listener) : noop()), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getSnapshot = useCallback(() => (request ? careerStore.getEntry<T>(request) : (IDLE as Entry<T>)), [key]);
  const entry = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (request) careerStore.ensure(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return entry;
}

export function isEmptyStats(stats: StatsSummary | undefined) {
  if (!stats) return true;
  return !stats.general && !stats.roles && !stats.heroes;
}

export function useCareerProfile(playerId: string, platform: PlatformFilter) {
  const requests = useMemo(() => {
    const stats = (mode: 'all' | 'quickplay' | 'competitive'): CareerRequest => ({ endpoint: 'stats-summary', playerId, mode, platform });
    return {
      summary: { endpoint: 'summary', playerId } as CareerRequest,
      all: stats('all'),
      quickplay: stats('quickplay'),
      competitive: stats('competitive'),
    };
  }, [playerId, platform]);

  const summary = useResource<PlayerSummary>(requests.summary);
  const all = useResource<StatsSummary>(requests.all);
  const quickplay = useResource<StatsSummary>(requests.quickplay);
  const competitive = useResource<StatsSummary>(requests.competitive);

  useEffect(() => {
    if (summary.data?.username) rememberPlayer(playerId, summary.data);
  }, [playerId, summary.data]);

  const entries: Entry[] = [summary, all, quickplay, competitive];
  const times = entries.map((entry) => entry.meta?.snapshotAt).filter((time): time is number => typeof time === 'number');

  return {
    requests,
    summary,
    stats: { all, quickplay, competitive },
    /** Oldest copy on screen, so the timestamp never overstates how current the page is. */
    lastUpdated: times.length ? Math.min(...times) : null,
    expired: entries.some((entry) => entry.meta && careerStore.isStale(entry)),
    revalidating: entries.some((entry) => entry.revalidating),
    refreshError: entries.find((entry) => entry.error && entry.data !== undefined)?.error,
    fatalError: entries.find((entry) => entry.status === 'error')?.error,
    initialLoad: entries.every((entry) => entry.data === undefined) && entries.some((entry) => entry.status === 'loading' || entry.status === 'idle'),
    layer: entries.find((entry) => entry.meta)?.meta?.layer,
  };
}

export type CareerProfile = ReturnType<typeof useCareerProfile>;

/** Seconds until a manual refresh is allowed, ticking down while the page is open. */
export function useRefreshCooldown(playerId: string) {
  const [seconds, setSeconds] = useState(() => Math.ceil(careerStore.refreshWaitMs(playerId) / 1000));
  const sync = useCallback(() => setSeconds(Math.ceil(careerStore.refreshWaitMs(playerId) / 1000)), [playerId]);
  useEffect(() => {
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, [sync]);
  return { seconds, sync };
}

export async function refreshPlayer(playerId: string, requests: CareerRequest[]): Promise<RefreshOutcome> {
  return careerStore.refreshPlayer(playerId, requests);
}

export interface RecentPlayer {
  id: string;
  name: string;
  title?: string | null;
  avatar?: string | null;
  seenAt: number;
}

const RECENT_KEY = 'ow2.career.recent.v1';

export function readRecentPlayers(): RecentPlayer[] {
  const saved = readJson<RecentPlayer[]>(RECENT_KEY);
  return Array.isArray(saved) ? saved.filter((player) => player && typeof player.id === 'string') : [];
}

function rememberPlayer(id: string, summary: PlayerSummary) {
  const next: RecentPlayer = { id, name: summary.username ?? id, title: summary.title, avatar: summary.avatar, seenAt: Date.now() };
  writeJson(RECENT_KEY, [next, ...readRecentPlayers().filter((player) => player.id !== id)].slice(0, 6));
}

export function forgetRecentPlayers() {
  writeJson(RECENT_KEY, []);
}
