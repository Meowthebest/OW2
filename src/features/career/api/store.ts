import { CareerError } from './errors';
import type { CareerProvider } from './provider';
import { requestKey, type CareerRequest } from './requests';

export interface EntryMeta {
  fetchedAt: number;
  snapshotAt: number;
  expiresAt: number;
  layer: string;
}

export interface Entry<T = unknown> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: T;
  meta?: EntryMeta;
  /** A network request is running, possibly behind cached data that is already on screen. */
  revalidating: boolean;
  /** Most recent failure. Can coexist with older cached data. */
  error?: CareerError;
  errorAt?: number;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RefreshOutcome =
  | { kind: 'cooldown'; waitMs: number }
  | { kind: 'done'; changed: boolean; error?: CareerError };

interface StoredRecord {
  data: unknown;
  fetchedAt: number;
  snapshotAt: number;
  expiresAt: number;
  layer: string;
}

const STORAGE_PREFIX = 'ow2.career.v1|';
const INDEX_KEY = 'ow2.career.v1.index';
const REFRESH_KEY = 'ow2.career.v1.refresh';

const HOUR = 60 * 60 * 1000;
export const CAREER_TTL_MS = HOUR;
export const SEARCH_TTL_MS = 10 * 60 * 1000;
export const RETENTION_MS = 14 * 24 * HOUR;
export const REFRESH_COOLDOWN_MS = 60 * 1000;
const MAX_STORED_CHARS = 3_500_000;
const MAX_CONCURRENT = 3;
const MAX_AUTO_RETRY_WAIT_SEC = 8;
const DEFAULT_BACKOFF_SEC = 30;
const ERROR_QUIET_MS = 15 * 1000;

const IDLE: Entry = { status: 'idle', revalidating: false };

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/**
 * Stale-while-revalidate cache for career data. Anything already held is returned at once,
 * then refreshed in the background once its TTL has passed. Failures never discard a good
 * copy, except "player not found", which removes it so a deleted profile is not kept alive.
 */
export class CareerStore {
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<() => void>>();
  private inflight = new Map<string, Promise<{ changed: boolean; error?: CareerError }>>();
  private waiting: Array<() => void> = [];
  private active = 0;
  private pausedUntil = 0;
  private index: Record<string, { at: number; size: number }>;
  private refreshes: Record<string, number>;
  private storage: StorageLike;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  readonly provider: CareerProvider;

  constructor(provider: CareerProvider, options: { storage?: StorageLike | null; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
    this.provider = provider;
    this.storage = options.storage ?? memoryStorage();
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.index = this.readJson(INDEX_KEY) ?? {};
    this.refreshes = this.readJson(REFRESH_KEY) ?? {};
    this.pruneExpired();
  }

  subscribe(request: CareerRequest, listener: () => void) {
    const key = requestKey(request);
    const set = this.listeners.get(key) ?? new Set();
    set.add(listener);
    this.listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  }

  /** Stable reference between changes, as useSyncExternalStore requires. */
  getEntry<T>(request: CareerRequest): Entry<T> {
    const key = requestKey(request);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = this.hydrate(key) ?? IDLE;
      this.entries.set(key, entry);
    }
    return entry as Entry<T>;
  }

  isStale(entry: Entry) {
    return !entry.meta || this.now() >= entry.meta.expiresAt;
  }

  /** Load when missing, revalidate when expired, otherwise leave the cached copy alone. */
  ensure(request: CareerRequest) {
    const entry = this.getEntry(request);
    if (entry.data !== undefined && !this.isStale(entry)) return;
    if (entry.errorAt && this.now() - entry.errorAt < ERROR_QUIET_MS) return;
    void this.run(request, false);
  }

  retry(request: CareerRequest) {
    return this.run(request, false);
  }

  /** Milliseconds until a manual refresh is allowed for this player. */
  refreshWaitMs(playerId: string) {
    const last = this.refreshes[playerId];
    const cooldown = last === undefined ? 0 : last + REFRESH_COOLDOWN_MS - this.now();
    return Math.max(0, cooldown, this.pausedUntil - this.now());
  }

  async refreshPlayer(playerId: string, requests: CareerRequest[]): Promise<RefreshOutcome> {
    const waitMs = this.refreshWaitMs(playerId);
    if (waitMs > 0) return { kind: 'cooldown', waitMs };
    this.refreshes[playerId] = this.now();
    this.writeJson(REFRESH_KEY, this.refreshes);
    const results = await Promise.all(requests.map((request) => this.run(request, true)));
    return {
      kind: 'done',
      changed: results.some((result) => result.changed),
      error: results.find((result) => result.error)?.error,
    };
  }

  private run(request: CareerRequest, force: boolean) {
    const key = requestKey(request);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const job = this.execute(request, key, force).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  private async execute(request: CareerRequest, key: string, force: boolean): Promise<{ changed: boolean; error?: CareerError }> {
    const previous = this.getEntry(request);
    this.patch(key, {
      status: previous.data !== undefined ? 'ready' : 'loading',
      revalidating: true,
      error: undefined,
      errorAt: undefined,
    });

    await this.acquire();
    try {
      const result = await this.fetchWithRetry(request, force);
      const ttl = request.endpoint === 'search' ? SEARCH_TTL_MS : CAREER_TTL_MS;
      const meta: EntryMeta = {
        fetchedAt: result.fetchedAt,
        snapshotAt: result.snapshotAt,
        expiresAt: result.fetchedAt + Math.max(ttl, (result.maxAgeSec ?? 0) * 1000),
        layer: result.layer,
      };
      const changed = JSON.stringify(previous.data) !== JSON.stringify(result.data);
      this.patch(key, { status: 'ready', data: result.data, meta, revalidating: false });
      if (result.noStore) this.forget(key);
      else this.persist(key, { data: result.data, ...meta });
      return { changed };
    } catch (cause) {
      const error = cause instanceof CareerError ? cause : new CareerError('server', 'Unexpected error while loading career data.');
      if (error.kind === 'rate-limited' || error.kind === 'busy') {
        this.pausedUntil = Math.max(this.pausedUntil, this.now() + (error.retryAfterSec ?? DEFAULT_BACKOFF_SEC) * 1000);
      }
      if (error.kind === 'not-found') {
        this.forget(key);
        this.patch(key, { status: 'error', data: undefined, meta: undefined, revalidating: false, error, errorAt: this.now() });
      } else {
        this.patch(key, { status: previous.data !== undefined ? 'ready' : 'error', revalidating: false, error, errorAt: this.now() });
      }
      return { changed: false, error };
    } finally {
      this.release();
    }
  }

  private async fetchWithRetry(request: CareerRequest, force: boolean) {
    const paused = this.pausedUntil - this.now();
    if (paused > 0) {
      throw new CareerError('rate-limited', 'Waiting for the data source rate limit to clear.', { retryAfterSec: Math.ceil(paused / 1000) });
    }
    try {
      return await this.provider.get(request, { force });
    } catch (error) {
      const retryable = error instanceof CareerError && (error.kind === 'rate-limited' || error.kind === 'busy');
      const wait = retryable ? error.retryAfterSec : undefined;
      if (!wait || wait > MAX_AUTO_RETRY_WAIT_SEC) throw error;
      await this.sleep(wait * 1000);
      return this.provider.get(request, { force });
    }
  }

  private acquire() {
    if (this.active < MAX_CONCURRENT) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active -= 1;
  }

  private patch(key: string, change: Partial<Entry>) {
    this.entries.set(key, { ...(this.entries.get(key) ?? IDLE), ...change });
    this.listeners.get(key)?.forEach((listener) => listener());
  }

  private hydrate(key: string): Entry | null {
    const record = this.readJson<StoredRecord>(STORAGE_PREFIX + key);
    if (!record) return null;
    if (this.now() - record.fetchedAt > RETENTION_MS) {
      this.forget(key);
      return null;
    }
    return {
      status: 'ready',
      data: record.data,
      revalidating: false,
      meta: { fetchedAt: record.fetchedAt, snapshotAt: record.snapshotAt, expiresAt: record.expiresAt, layer: 'browser' },
    };
  }

  private persist(key: string, record: StoredRecord) {
    const raw = JSON.stringify(record);
    this.index[key] = { at: this.now(), size: raw.length };
    this.evict(MAX_STORED_CHARS, key);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        this.storage.setItem(STORAGE_PREFIX + key, raw);
        this.writeJson(INDEX_KEY, this.index);
        return;
      } catch {
        // Over quota: drop the least recently written entry and try again.
        if (!this.evictOldest(key)) break;
      }
    }
    delete this.index[key];
  }

  private evict(limit: number, keep: string) {
    let total = Object.values(this.index).reduce((sum, item) => sum + item.size, 0);
    while (total > limit) {
      const removed = this.evictOldest(keep);
      if (removed === 0) break;
      total -= removed;
    }
  }

  private evictOldest(keep: string) {
    let oldest: string | null = null;
    for (const [key, item] of Object.entries(this.index)) {
      if (key !== keep && (!oldest || item.at < this.index[oldest].at)) oldest = key;
    }
    if (!oldest) return 0;
    const size = this.index[oldest].size;
    this.forget(oldest);
    return size;
  }

  private forget(key: string) {
    delete this.index[key];
    try {
      this.storage.removeItem(STORAGE_PREFIX + key);
    } catch {
      // Storage is unavailable, so there is nothing to remove.
    }
    this.writeJson(INDEX_KEY, this.index);
  }

  private pruneExpired() {
    const cutoff = this.now() - RETENTION_MS;
    Object.entries(this.index)
      .filter(([, item]) => item.at < cutoff)
      .forEach(([key]) => this.forget(key));
  }

  private readJson<T>(key: string): T | null {
    try {
      const raw = this.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      // Best effort. Losing the index only makes eviction less precise.
    }
  }
}
