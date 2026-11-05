import { useSyncExternalStore } from 'react';
import { readJson, removeKey, writeJson } from '../../lib/storage';
import type { Entry, EntryMap } from './core/collection';

// Optional accounts. When VITE_ACCOUNT_API_URL isn't set, the site has no sign-in and tracking stays in the browser.
// Signing in goes through the Worker in accounts/, which holds the Discord app secret. The site only ever
// holds a session token, which can do nothing except read and change this person's own tracking.

export const ACCOUNT_API = (import.meta.env.VITE_ACCOUNT_API_URL ?? '').replace(/\/$/, '');
export const accountsEnabled = () => ACCOUNT_API !== '';

const SESSION_KEY = 'ow2.account.v1';
const CURSOR_KEY = 'ow2.account.cursor.v1';
const PENDING_KEY = 'ow2.account.pending.v1';
const PUSH_DELAY_MS = 1500;
const MAX_BATCH = 500;

export interface AccountUser {
  name: string;
  avatar: string | null;
}

export interface AccountState {
  status: 'off' | 'signed-out' | 'signed-in' | 'working';
  user: AccountUser | null;
  /** Null when in step. */
  problem: string | null;
  lastSync: number | null;
}

interface StoredSession {
  token: string;
  user: AccountUser;
}

let session = accountsEnabled() ? readJson<StoredSession>(SESSION_KEY) : null;
let state: AccountState = {
  status: !accountsEnabled() ? 'off' : session ? 'signed-in' : 'signed-out',
  user: session?.user ?? null,
  problem: null,
  lastSync: null,
};
const listeners = new Set<() => void>();
let pending: Record<string, Entry> = readJson<Record<string, Entry>>(PENDING_KEY) ?? {};
let pushTimer: number | null = null;
let mergeHook: ((entries: EntryMap) => void) | null = null;
let snapshotHook: (() => EntryMap) | null = null;

function setState(next: Partial<AccountState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const useAccount = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ACCOUNT_API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout?.(15000),
  });
  if (response.status === 401 && session) {
    endSession();
    throw new Error('Your sign-in has expired. Sign in again to keep syncing.');
  }
  if (response.status === 429) throw new Error('Too many requests. Try again in a minute.');
  if (!response.ok) throw new Error(`The account service answered ${response.status}.`);
  return (await response.json()) as T;
}

function endSession() {
  session = null;
  removeKey(SESSION_KEY);
  removeKey(CURSOR_KEY);
  setState({ status: accountsEnabled() ? 'signed-out' : 'off', user: null });
}

/** Called by the collection store, which can't import this file's callers without a cycle. */
export function connectStore(merge: (entries: EntryMap) => void, snapshot: () => EntryMap) {
  mergeHook = merge;
  snapshotHook = snapshot;
}

export function noteLocalChange(key: string, entry: Entry) {
  if (!session) return;
  pending[key] = entry;
  writeJson(PENDING_KEY, pending);
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushChanges(), PUSH_DELAY_MS);
}

async function pushChanges() {
  pushTimer = null;
  const keys = Object.keys(pending);
  if (!session || keys.length === 0) return;
  const batch = keys.slice(0, MAX_BATCH);
  const changes = Object.fromEntries(batch.map((key) => [key, pending[key]]));
  try {
    await call('/collection/changes', { method: 'POST', body: JSON.stringify({ changes }) });
    for (const key of batch) if (pending[key] === changes[key]) delete pending[key];
    writeJson(PENDING_KEY, pending);
    setState({ problem: null, lastSync: Date.now() });
    if (Object.keys(pending).length > 0) pushTimer = window.setTimeout(() => void pushChanges(), 200);
  } catch (error) {
    setState({ problem: (error as Error).message });
  }
}

/** Gets what changed elsewhere, then sends what changed here. Newest change to each entry wins on both sides. */
export async function syncNow() {
  if (!session) return;
  setState({ status: 'working' });
  try {
    let cursor = readJson<number>(CURSOR_KEY) ?? 0;
    // A first sync sends everything in this browser, so tracking done before signing in joins the account.
    if (cursor === 0 && snapshotHook) {
      for (const [key, entry] of Object.entries(snapshotHook())) pending[key] = entry;
      writeJson(PENDING_KEY, pending);
    }
    for (let page = 0; page < 50; page += 1) {
      const answer = await call<{ entries: EntryMap; cursor: number; more: boolean }>(`/collection?since=${cursor}`);
      if (Object.keys(answer.entries).length > 0) mergeHook?.(answer.entries);
      cursor = answer.cursor;
      if (!answer.more) break;
    }
    writeJson(CURSOR_KEY, cursor);
    await pushChanges();
    setState({ status: session ? 'signed-in' : 'signed-out', problem: state.problem, lastSync: Date.now() });
  } catch (error) {
    setState({ status: session ? 'signed-in' : 'signed-out', problem: (error as Error).message });
  }
}

export function signInUrl() {
  const back = `${window.location.origin}${window.location.pathname}#/collection`;
  return `${ACCOUNT_API}/auth/discord/start?return=${encodeURIComponent(back)}`;
}

/** Finishes a sign-in. The Worker hands back a one-time code, which keeps the session token out of the address bar and history. */
export async function completeSignIn(code: string) {
  setState({ status: 'working' });
  try {
    const answer = await call<{ token: string; user: AccountUser }>('/auth/exchange', { method: 'POST', body: JSON.stringify({ code }) });
    session = { token: answer.token, user: answer.user };
    writeJson(SESSION_KEY, session);
    removeKey(CURSOR_KEY);
    setState({ status: 'signed-in', user: answer.user, problem: null });
    await syncNow();
  } catch (error) {
    setState({ status: 'signed-out', problem: (error as Error).message });
  }
}

export async function signOut() {
  if (session) await call('/auth/logout', { method: 'POST' }).catch(() => undefined);
  pending = {};
  removeKey(PENDING_KEY);
  endSession();
  setState({ problem: null, lastSync: null });
}

/** Removes the account and everything stored for it. Tracking in this browser stays. */
export async function deleteAccount() {
  await call('/me', { method: 'DELETE' });
  pending = {};
  removeKey(PENDING_KEY);
  endSession();
  setState({ problem: null, lastSync: null });
}
