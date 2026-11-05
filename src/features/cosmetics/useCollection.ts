import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../../lib/storage';
import { entryKey, exportDocument, mergeEntries, parseImport, validEntry, type EntryKind, type EntryMap } from './core/collection';
import { connectStore, noteLocalChange } from './account';

// Personal tracking lives in this browser first, so it works with no account. When someone signs in,
// account.ts merges it with what's stored for their account and keeps the two in step.

const STORAGE_KEY = 'ow2.collection.v1';

function readStored(): EntryMap {
  const stored = readJson<EntryMap>(STORAGE_KEY);
  if (!stored || typeof stored !== 'object') return {};
  const clean: EntryMap = {};
  for (const [key, entry] of Object.entries(stored)) if (validEntry(key, entry)) clean[key] = entry;
  return clean;
}

let entries: EntryMap = readStored();
let saved = true;
const listeners = new Set<() => void>();

function publish() {
  saved = writeJson(STORAGE_KEY, entries);
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  entries = readStored();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

export const useCollection = () => useSyncExternalStore(subscribe, () => entries);

export const getEntries = () => entries;

/** False when the browser refused to store anything, as a private window can. The page says so. */
export const storageWorks = () => saved;

export function setMark(kind: EntryKind, id: string, on: boolean, now = Date.now()) {
  const key = entryKey(kind, id);
  entries = { ...entries, [key]: [on ? 1 : 0, now] };
  publish();
  noteLocalChange(key, entries[key]);
}

export function toggleMark(kind: EntryKind, id: string) {
  const key = entryKey(kind, id);
  setMark(kind, id, entries[key]?.[0] !== 1);
}

/** Sets many at once, as "mark every item in this bundle" does. */
export function setMarks(kind: EntryKind, ids: readonly string[], on: boolean, now = Date.now()) {
  const next = { ...entries };
  const changes: Array<[string, EntryMap[string]]> = [];
  for (const id of ids) {
    const key = entryKey(kind, id);
    if ((next[key]?.[0] === 1) === on) continue;
    next[key] = [on ? 1 : 0, now];
    changes.push([key, next[key]]);
  }
  if (changes.length === 0) return;
  entries = next;
  publish();
  changes.forEach(([key, entry]) => noteLocalChange(key, entry));
}

/** Brings in entries from an account or a file. Returns how many changed anything here. */
export function mergeIn(incoming: EntryMap) {
  const { merged, changed } = mergeEntries(entries, incoming);
  if (changed.length > 0) {
    entries = merged;
    publish();
  }
  return changed;
}

export function importCollection(text: string) {
  const incoming = parseImport(text);
  const changed = mergeIn(incoming);
  changed.forEach((key) => noteLocalChange(key, entries[key]));
  return changed.length;
}

export const exportCollection = () => JSON.stringify(exportDocument(entries), null, 1);

export function clearCollection(now = Date.now()) {
  const next: EntryMap = {};
  for (const [key, entry] of Object.entries(entries)) {
    next[key] = [0, now];
    if (entry[0] === 1) noteLocalChange(key, next[key]);
  }
  entries = next;
  publish();
}

connectStore(mergeIn, getEntries);
