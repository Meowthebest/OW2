// Records the Overwatch shop from itemshop.gg's documented API. https://itemshop.gg/developers
// Rules this follows: a descriptive client name, /rotations as the cheap check, ETags, Retry-After on 429,
// the key sent only in a header, and a visible "Data from itemshop.gg" link wherever the data is shown.
import fs from 'node:fs';
import path from 'node:path';
import { appendJsonLine, DATA_DIR, logChange, readJson, readJsonLines, sleep, writeJson, writeKeyedJson } from './common.mjs';

const API = (process.env.ITEMSHOP_API_URL ?? 'https://itemshop.gg/api/v1').replace(/\/$/, '');
const USER_AGENT = 'OW2-Hero-Selector-ShopSync (+https://github.com/Meowthebest/OW2)';
const GAME = 'overwatch';
const MAX_ATTEMPTS = 4;
const MAX_WAIT_MS = 120000;

const shopDir = () => path.join(DATA_DIR, 'shop');
const rotationsDir = () => path.join(shopDir(), 'rotations');
const itemsFile = () => path.join(shopDir(), 'items.json');
const staysFile = () => path.join(shopDir(), 'stays.json');
const stateFile = () => path.join(shopDir(), 'state.json');

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** One API request with retries for rate limits and outages. Returns { status, body, etag }. */
export async function request(pathname, { key = null, etag = null, wait = sleep, fetchImpl = fetch } = {}) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (etag) headers['If-None-Match'] = etag;
  let problem = 'no answer';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${API}${pathname}`, { headers, signal: AbortSignal.timeout(30000) });
    } catch (error) {
      problem = error?.name === 'TimeoutError' ? 'timed out' : 'could not connect';
      if (attempt < MAX_ATTEMPTS) await wait(2000 * attempt);
      continue;
    }
    if (response.status === 304) return { status: 304, body: null, etag };
    if (response.ok) return { status: response.status, body: await response.json(), etag: response.headers.get('etag') };

    let code = null;
    let message = `HTTP ${response.status}`;
    try {
      const failure = await response.json();
      code = failure?.error?.code ?? null;
      if (failure?.error?.message) message = String(failure.error.message).slice(0, 200);
    } catch {
      // The status alone will do.
    }
    if (response.status === 429 || response.status >= 500) {
      problem = message;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt, MAX_WAIT_MS);
      if (attempt < MAX_ATTEMPTS) await wait(delay);
      continue;
    }
    throw new ApiError(`${pathname}: ${message}`, response.status, code);
  }
  throw new ApiError(`${pathname}: ${problem}`, 0, null);
}

/** A compact record of a shop. Names and art live once in items.json, so a rotation only lists keys and prices. */
export function rotationFromSnapshot(snapshot, core, { at, sourceFingerprint = null, origin, exact = true }) {
  return {
    id: `${at.slice(0, 19)}Z-${core.shopFingerprint(snapshot)}`,
    at,
    origin,
    exact,
    fingerprint: core.shopFingerprint(snapshot),
    sourceFingerprint,
    shopDate: snapshot.shopDate,
    updatedAt: snapshot.updatedAt,
    expiresAt: snapshot.expiresAt,
    sections: snapshot.sections.map((section) => ({
      title: section.title,
      upcoming: section.upcoming,
      endsAt: section.endsAt,
      listings: section.listings.map((listing) => [listing.key, listing.amount, listing.currency, listing.regular, listing.priceLabel, listing.badge, listing.from, listing.until, listing.untilLabel]),
    })),
  };
}

/** Adds what a snapshot says about each item. A value is never replaced by a blank one. */
export function mergeItems(items, snapshot, seenAt) {
  const keep = (next, previous) => (next === null || next === undefined || next === '' ? previous ?? null : next);
  for (const section of snapshot.sections) {
    for (const listing of section.listings) {
      const before = items[listing.key] ?? {};
      const contents = listing.contents.length > 0 ? listing.contents.map(({ key, name, typeLabel, rarity, image, quantity }) => ({ key, name, typeLabel, rarity, image, quantity })) : before.contents ?? [];
      items[listing.key] = {
        name: listing.name,
        kind: listing.kind,
        typeLabel: keep(listing.typeLabel, before.typeLabel),
        rarity: keep(listing.rarity, before.rarity),
        image: keep(listing.image, before.image),
        statedCount: keep(listing.statedCount, before.statedCount),
        url: keep(listing.url, before.url),
        contents,
        firstSeen: before.firstSeen && before.firstSeen < seenAt ? before.firstSeen : seenAt,
        lastSeen: before.lastSeen && before.lastSeen > seenAt ? before.lastSeen : seenAt,
      };
    }
  }
  return items;
}

export function readRotations() {
  if (!fs.existsSync(rotationsDir())) return [];
  return fs
    .readdirSync(rotationsDir())
    .filter((file) => file.endsWith('.jsonl'))
    .sort()
    .flatMap((file) => readJsonLines(path.join(rotationsDir(), file)))
    .sort((a, b) => a.at.localeCompare(b.at));
}

function addRotation(rotation) {
  appendJsonLine(path.join(rotationsDir(), `${rotation.at.slice(0, 7)}.jsonl`), rotation);
}

const listingKeys = (rotation) => rotation.sections.filter((section) => !section.upcoming).flatMap((section) => section.listings.map((listing) => listing[0]));

/** Every item a rotation names: its listings and what's in them. */
function keysInRotation(rotation, items) {
  const keys = new Set();
  for (const key of listingKeys(rotation)) {
    keys.add(key);
    for (const content of items[key]?.contents ?? []) if (content.key) keys.add(content.key);
  }
  return keys;
}

/** Reads each item's stays in the shop. Needs a key. Stops early rather than failing if the source has a problem. */
async function refreshStays(keys, key, options = {}) {
  const stays = readJson(staysFile(), { fetchedAt: null, items: {} });
  let read = 0;
  let skipped = 0;
  for (const itemKey of keys) {
    if (!itemKey.startsWith('ow:')) continue;
    try {
      const { body } = await request(`/items/${GAME}/${encodeURIComponent(itemKey)}`, { key, ...options });
      const list = Array.isArray(body?.data?.stays) ? body.data.stays : [];
      stays.items[itemKey] = list.map((stay) => [stay.start ?? null, stay.end ?? null, typeof stay.price === 'number' ? stay.price : null, stay.currency ?? null, stay.shop ?? null, stay.state ?? null]);
      read += 1;
    } catch (error) {
      if (error.status === 404) {
        skipped += 1;
        continue;
      }
      console.warn(`Stopped reading item history: ${error.message}`);
      break;
    }
    await (options.wait ?? sleep)(options.pace ?? 120);
  }
  if (read > 0) {
    stays.fetchedAt = new Date().toISOString();
    writeKeyedJsonWithHeader(stays);
  }
  return { read, skipped };
}

function writeKeyedJsonWithHeader(stays) {
  writeJson(staysFile(), stays);
}

/**
 * Checks for a new shop and records it. Writes nothing unless something changed, so a quiet check leaves no commit.
 * A stale or damaged answer changes nothing, so the last good shop stays in place.
 */
export async function syncShop(core, { key = null, force = false, now = new Date(), ...options } = {}) {
  const state = readJson(stateFile(), {});
  const { body: rotationsBody } = await request('/rotations', { key, ...options });
  const current = rotationsBody?.data?.[GAME];
  if (!current || typeof current.fingerprint !== 'string') throw new ApiError('/rotations: no entry for Overwatch', 0, null);
  if (!force && current.fingerprint === state.sourceFingerprint) return { changed: false, reason: 'The shop has not changed.' };

  const shop = await request(`/shop/${GAME}`, { key, etag: force ? null : state.etag ?? null, ...options });
  if (shop.status === 304) {
    writeJson(stateFile(), { ...state, sourceFingerprint: current.fingerprint, changedAt: current.changedAt ?? null });
    return { changed: true, recorded: false, reason: 'Only the fingerprint moved. The answer was the same.' };
  }
  const snapshot = core.normalizeShop(shop.body);
  if (snapshot.stale) return { changed: false, reason: 'The source says its copy is stale, so nothing was recorded.' };

  const rotations = readRotations();
  const last = rotations.at(-1);
  const at = current.changedAt ?? now.toISOString();
  const rotation = rotationFromSnapshot(snapshot, core, { at, sourceFingerprint: current.fingerprint, origin: 'recorded' });
  const items = mergeItems(readJson(itemsFile(), {}), snapshot, at);

  writeKeyedJson(itemsFile(), items);
  writeJson(stateFile(), { sourceFingerprint: current.fingerprint, changedAt: current.changedAt ?? null, etag: shop.etag ?? null, lastRecorded: now.toISOString() });

  if (last?.fingerprint === rotation.fingerprint) return { changed: true, recorded: false, reason: 'Art or read time changed, but not what is on sale.' };

  addRotation(rotation);
  const diff = last ? core.diffListings(listingKeys(rotation).map((value) => ({ key: value })), listingKeys(last).map((value) => ({ key: value }))) : { added: listingKeys(rotation), removed: [] };
  logChange({ source: 'itemshop', action: 'rotation', rotation: rotation.id, listings: listingKeys(rotation).length, added: diff.added.length, removed: diff.removed.length }, now);

  let stays = null;
  if (key) {
    const affected = new Set([...keysInRotation(rotation, items), ...(last ? keysInRotation(last, items) : [])]);
    stays = await refreshStays(affected, key, options);
  }
  return { changed: true, recorded: true, rotation: rotation.id, added: diff.added.length, removed: diff.removed.length, stays, reason: `Recorded a new shop: ${diff.added.length} added, ${diff.removed.length} removed.` };
}

/**
 * Reads past shops and every item's stays. Needs a key. Safe to run again: it only adds days it doesn't have.
 * A day that can't be read is reported and skipped, so one bad day can't undo the rest.
 */
export async function backfillShop(core, { key, staysOnly = false, now = new Date(), ...options }) {
  if (!key) throw new ApiError('Reading past shops needs an itemshop.gg key in ITEMSHOP_API_KEY', 401, 'key_required');
  const wait = options.wait ?? sleep;
  const pace = options.pace ?? 120;
  const rotations = readRotations();
  const known = new Set(rotations.map((rotation) => rotation.shopDate));
  const items = readJson(itemsFile(), {});
  let added = 0;
  const failed = [];
  let dates = [];

  if (!staysOnly) {
    const { body } = await request(`/history/${GAME}`, { key, ...options });
    dates = (Array.isArray(body?.data) ? body.data : []).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    for (const date of dates) {
      if (known.has(date)) continue;
      try {
        const answer = await request(`/history/${GAME}/${date}`, { key, ...options });
        const data = answer.body?.data;
        if (!data?.shop || data.exact === false) continue;
        const snapshot = core.normalizeShop({ data: data.shop });
        const at = snapshot.updatedAt ?? `${date}T00:00:00.000Z`;
        mergeItems(items, snapshot, at);
        addRotation(rotationFromSnapshot(snapshot, core, { at, origin: 'history' }));
        added += 1;
      } catch (error) {
        failed.push(`${date}: ${error.message}`);
      }
      await wait(pace);
    }
    writeKeyedJson(itemsFile(), items);
    if (added > 0) sortRotationFiles();
  }

  const keys = new Set();
  for (const [itemKey, item] of Object.entries(items)) {
    keys.add(itemKey);
    for (const content of item.contents ?? []) if (content.key) keys.add(content.key);
  }
  const stays = await refreshStays(keys, key, options);

  const historyFrom = dates[0] ?? null;
  const meta = readJson(stateFile(), {});
  writeJson(stateFile(), { ...meta, historyRead: now.toISOString(), historyFrom: historyFrom ?? meta.historyFrom ?? null });
  logChange({ source: 'itemshop', action: 'backfill', days: dates.length, added, failed: failed.length, stays: stays.read }, now);
  return { days: dates.length, added, failed, stays, historyFrom };
}

function sortRotationFiles() {
  for (const file of fs.readdirSync(rotationsDir()).filter((name) => name.endsWith('.jsonl'))) {
    const target = path.join(rotationsDir(), file);
    const lines = readJsonLines(target).sort((a, b) => a.at.localeCompare(b.at));
    fs.writeFileSync(target, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  }
}
