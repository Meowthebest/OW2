import { useEffect, useState } from 'react';
import type { HeroHistoryIndex, PatchFile, PatchIndex } from './core/types';

// Everything here reads JSON that ships with the site. It is produced ahead of time by scripts/patches/cli.mjs
// from Blizzard's published notes, so visitors never fetch or parse Blizzard's pages themselves.

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/patches/${file}`;

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string, init?: RequestInit): Promise<T> {
  const cached = cache.get(file);
  if (cached) return cached as Promise<T>;
  const request = fetch(dataUrl(file), init).then(async (response) => {
    if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status})`);
    return (await response.json()) as T;
  });
  cache.set(file, request);
  // A failed request should not stick, so a retry reads the file again.
  request.catch(() => cache.delete(file));
  return request;
}

export const loadIndex = () => load<PatchIndex>('index.json', { cache: 'no-cache' });
export const loadHeroHistory = () => load<HeroHistoryIndex>('heroes.json', { cache: 'no-cache' });
export const loadPatch = (id: string) => load<PatchFile>(`${id}.json`);
export const loadPatches = (ids: string[]) => Promise.all(ids.map(loadPatch));

/** Paging that starts over when its key changes. The count is derived, so there is no reset to race with a click. */
export function usePaged(size: number, resetKey: unknown): [number, () => void] {
  const [state, setState] = useState({ key: resetKey, visible: size });
  const visible = state.key === resetKey ? state.visible : size;
  return [visible, () => setState({ key: resetKey, visible: visible + size })];
}

export interface AsyncState<T> {
  status: 'loading' | 'ready' | 'error';
  data: T | undefined;
  error: Error | undefined;
  retry: () => void;
}

/** Runs a loader whenever its key changes, keeping the last result on screen until the new one arrives. */
export function useAsync<T>(loader: () => Promise<T>, key: string): AsyncState<T> {
  const [state, setState] = useState<{ status: AsyncState<T>['status']; data?: T; error?: Error }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState((current) => ({ status: 'loading', data: current.data }));
    loader().then(
      (data) => {
        if (live) setState({ status: 'ready', data });
      },
      (error: Error) => {
        if (live) setState({ status: 'error', error });
      },
    );
    return () => {
      live = false;
    };
    // The key stands in for the loader, which is recreated on every render.
  }, [key, attempt]);

  return { status: state.status, data: state.data, error: state.error, retry: () => setAttempt((value) => value + 1) };
}
