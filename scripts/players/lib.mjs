// Records Steam's concurrent player count for Overwatch. No dependencies, so the scheduled job needs no install step.
//
// Storage, on the player-data branch:
//   samples/YYYY-MM.jsonl  Every reading, one [unixSeconds, players] per line. The source of truth.
//   recent.json            The last 8 days of readings, for short chart ranges.
//   hourly.json            One [hourStart, low, average, high, readings] per hour since recording began.
//   latest.json            The current count and statistics, for the homepage and stat cards.
import fs from 'node:fs';
import path from 'node:path';

export const APP_ID = 2357570;
export const STEAM_URL = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${APP_ID}`;
export const USER_AGENT = 'OW2-Hero-Selector-PlayerStats (+https://github.com/Meowthebest/OW2)';

const HOUR = 3600;
const DAY = 86400;
export const BUCKET_SECONDS = 300;
export const RECENT_SECONDS = 8 * DAY;

// More than any Steam game has ever reached at once, so a larger number means the response is wrong.
export const MAX_PLAUSIBLE_PLAYERS = 5_000_000;
/** How close to exactly 24 hours ago a reading must be for a 24-hour comparison. */
export const COMPARE_TOLERANCE_SECONDS = 30 * 60;
/** Hours of the last 24 that need a reading before a 24-hour peak means anything. */
export const MIN_HOURS_FOR_DAY_PEAK = 20;
/** Share of the last 30 days' hours that need a reading before showing a 30-day average. */
export const MIN_SHARE_FOR_MONTH = 0.8;

const iso = (seconds) => new Date(seconds * 1000).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const monthOf = (seconds) => iso(seconds).slice(0, 7);
export const hourOf = (seconds) => seconds - (seconds % HOUR);

/** Checks a Steam response. Anything that isn't a believable count is rejected, never stored. */
export function parseSteamBody(body) {
  const response = body?.response;
  if (!response || typeof response !== 'object') return { ok: false, error: 'Steam sent an unexpected response' };
  if (response.result !== 1) return { ok: false, error: `Steam reported result ${response.result}` };
  const players = response.player_count;
  if (!Number.isSafeInteger(players)) return { ok: false, error: 'Steam sent a count that is not a whole number' };
  // Overwatch reading exactly zero on Steam means an outage upstream, not an empty game.
  if (players <= 0) return { ok: false, error: `Steam reported ${players} players, which is not believable` };
  if (players > MAX_PLAUSIBLE_PLAYERS) return { ok: false, error: `Steam reported ${players} players, which is not believable` };
  return { ok: true, players };
}

/**
 * The time on a reading, from the response's cache headers: when the copy Steam sent was made. A copy served from a
 * shared cache keeps its time, so reading it again inside one cache window is recognized as a repeat. GitHub's machines
 * have received fresh headers on every read so far, so there this is the time of the read, and the count can be older.
 */
export function observationTime(headers, clockSeconds) {
  const expires = Date.parse(headers?.get?.('expires') ?? '');
  const maxAge = Number(/max-age=(\d+)/.exec(headers?.get?.('cache-control') ?? '')?.[1]);
  if (!Number.isFinite(expires) || !Number.isFinite(maxAge) || maxAge <= 0) return clockSeconds;
  const time = Math.floor(expires / 1000) - maxAge;
  // Headers this far from the clock can't be right, so the clock is used instead.
  return time <= clockSeconds + 60 && clockSeconds - time <= 2 * maxAge ? time : clockSeconds;
}

/** One read with a timeout and short retries, honoring a rate limit's Retry-After. */
export async function readSteam({ url = STEAM_URL, fetchImpl = fetch, attempts = 3, wait = sleep, timeoutMs = 15000, clockSeconds = Math.floor(Date.now() / 1000) } = {}) {
  let lastError = 'Steam did not respond';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let delay = 3000 * attempt;
    try {
      const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 429 || response.status >= 500) {
        lastError = response.status === 429 ? 'Steam rate limited this request' : `Steam returned HTTP ${response.status}`;
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) delay = Math.min(retryAfter, 30) * 1000;
      } else if (!response.ok) {
        return { ok: false, error: `Steam returned HTTP ${response.status}` };
      } else {
        const parsed = parseSteamBody(await response.json());
        return parsed.ok ? { ...parsed, observedAt: observationTime(response.headers, clockSeconds) } : parsed;
      }
    } catch (error) {
      lastError = error.name === 'TimeoutError' ? 'Steam timed out' : error.name === 'SyntaxError' ? 'Steam sent a response that is not JSON' : `Could not reach Steam: ${error.message}`;
    }
    if (attempt < attempts) await wait(delay);
  }
  return { ok: false, error: lastError };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}

/** Writes one row per line, so each git commit stays a small diff. */
function writeRows(file, key, rows) {
  writeAtomic(file, `{"schema":1,"${key}":[\n${rows.map((row) => JSON.stringify(row)).join(',\n')}\n]}\n`);
}

const samplesFile = (dir, month) => path.join(dir, 'samples', `${month}.jsonl`);

export function listMonths(dir) {
  const folder = path.join(dir, 'samples');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name)).map((name) => name.slice(0, 7)).sort();
}

/** Reads stored readings. A damaged line is skipped, so one bad line can't lose the rest. */
export function readSamples(dir, months) {
  const samples = [];
  for (const month of months) {
    const file = samplesFile(dir, month);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (Array.isArray(row) && Number.isSafeInteger(row[0]) && Number.isSafeInteger(row[1]) && row[1] > 0) samples.push([row[0], row[1]]);
      } catch {
        // Skipped on purpose.
      }
    }
  }
  return samples.sort((a, b) => a[0] - b[0]);
}

/** Two runs in the same five-minute window count as one observation. */
export function isDuplicate(lastTime, time) {
  if (lastTime === null || lastTime === undefined) return false;
  return time <= lastTime || Math.floor(time / BUCKET_SECONDS) === Math.floor(lastTime / BUCKET_SECONDS);
}

/** Groups readings into [hourStart, low, average, high, readings] rows. */
export function aggregateHours(samples) {
  const hours = new Map();
  for (const [time, players] of samples) {
    const hour = hourOf(time);
    const row = hours.get(hour);
    if (row) {
      row.low = Math.min(row.low, players);
      row.high = Math.max(row.high, players);
      row.sum += players;
      row.count += 1;
    } else {
      hours.set(hour, { hour, low: players, high: players, sum: players, count: 1 });
    }
  }
  return [...hours.values()].sort((a, b) => a.hour - b.hour).map((row) => [row.hour, row.low, Math.round(row.sum / row.count), row.high, row.count]);
}

/** Thins the last 24 hours to a small line for the homepage. Each point is a real average of real readings. */
export function buildSparkline(samples, now, points = 48) {
  const start = now - DAY;
  const size = DAY / points;
  const groups = new Map();
  for (const [time, players] of samples) {
    if (time <= start || time > now) continue;
    const group = Math.min(points - 1, Math.floor((time - start) / size));
    const entry = groups.get(group) ?? { time: 0, sum: 0, count: 0 };
    entry.time = time;
    entry.sum += players;
    entry.count += 1;
    groups.set(group, entry);
  }
  return [...groups.keys()].sort((a, b) => a - b).map((group) => {
    const entry = groups.get(group);
    return [entry.time, Math.round(entry.sum / entry.count)];
  });
}

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Statistics from recorded readings only. Each is null until enough real data exists,
 * and the coverage figures say how close it is, so nothing is estimated in the meantime.
 */
export function computeStats({ recent, hours, now, players, trackingSince, previousPeak }) {
  const lastDay = recent.filter(([time]) => time > now - DAY && time <= now);
  const coveredHours = new Set(lastDay.map(([time]) => Math.floor((now - time) / HOUR))).size;
  const highest = lastDay.reduce((best, sample) => (!best || sample[1] > best[1] ? sample : best), null);
  const peak24h = highest && coveredHours >= MIN_HOURS_FOR_DAY_PEAK ? { players: highest[1], at: iso(highest[0]), coveredHours } : null;

  let closest = null;
  for (const sample of recent) {
    const distance = Math.abs(sample[0] - (now - DAY));
    if (distance <= COMPARE_TOLERANCE_SECONDS && (!closest || distance < Math.abs(closest[0] - (now - DAY)))) closest = sample;
  }
  const change24h = closest ? { percent: round1(((players - closest[1]) / closest[1]) * 100), players: players - closest[1], comparedTo: { players: closest[1], at: iso(closest[0]) } } : null;

  const monthStart = now - 30 * DAY;
  const monthHours = hours.filter(([hour]) => hour >= hourOf(monthStart) && hour <= now);
  const enoughMonth = trackingSince <= monthStart && monthHours.length >= 30 * 24 * MIN_SHARE_FOR_MONTH;
  const average30d = enoughMonth ? { players: Math.round(monthHours.reduce((sum, row) => sum + row[2], 0) / monthHours.length), hours: monthHours.length } : null;

  const peakRecorded = previousPeak && previousPeak.players >= players ? previousPeak : { players, at: iso(now) };

  return {
    peak24h,
    change24h,
    average30d,
    peakRecorded,
    coverage: { hoursOf24: coveredHours, daysTracked: round1((now - trackingSince) / DAY), hoursOf720: monthHours.length },
  };
}

function isValidLatest(value) {
  return value?.schema === 1 && Number.isSafeInteger(value.current?.players) && typeof value.trackingSince === 'string';
}

/** Rebuilds every derived file from the raw readings. Used if a derived file is ever missing or damaged. */
export function rebuild(dir, { now = new Date(), lastAttempt = null } = {}) {
  const all = readSamples(dir, listMonths(dir));
  if (all.length === 0) return null;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const [time, players] = all[all.length - 1];
  const hours = aggregateHours(all);
  const recent = all.filter(([sample]) => sample > time - RECENT_SECONDS);
  const highest = all.reduce((best, sample) => (sample[1] > best[1] ? sample : best), all[0]);
  writeRows(path.join(dir, 'hourly.json'), 'hours', hours);
  writeRows(path.join(dir, 'recent.json'), 'samples', recent);
  const latest = buildLatest({ time, players, recent, hours, trackingSince: all[0][0], previousPeak: { players: highest[1], at: iso(highest[0]) }, attemptAt: nowSeconds, lastAttempt, readings: all.length });
  writeAtomic(path.join(dir, 'latest.json'), `${JSON.stringify(latest, null, 1)}\n`);
  return latest;
}

function buildLatest({ time, players, recent, hours, trackingSince, previousPeak, attemptAt, lastAttempt, readings }) {
  return {
    schema: 1,
    appId: APP_ID,
    source: STEAM_URL,
    trackingSince: iso(trackingSince),
    readings,
    current: { players, at: iso(time) },
    lastAttempt: lastAttempt ?? { at: iso(attemptAt), ok: true, error: null },
    stats: computeStats({ recent, hours, now: time, players, trackingSince, previousPeak }),
    sparkline: buildSparkline(recent, time),
  };
}

/**
 * Takes one reading and updates the store. A failed read changes nothing except the note about the last attempt,
 * so the site keeps the last good count and can say it is stale.
 */
export async function collectOnce({ dir, now = () => new Date(), ...options }) {
  const started = now();
  const time = Math.floor(started.getTime() / 1000);
  const previous = readJson(path.join(dir, 'latest.json'));
  const hasPrevious = isValidLatest(previous);
  const result = await readSteam({ clockSeconds: time, ...options });

  if (!result.ok) {
    if (hasPrevious) {
      writeAtomic(path.join(dir, 'latest.json'), `${JSON.stringify({ ...previous, lastAttempt: { at: iso(time), ok: false, error: result.error } }, null, 1)}\n`);
    }
    return { status: 'failed', error: result.error };
  }

  const months = listMonths(dir);
  const recentMonths = months.slice(-2);
  const known = readSamples(dir, recentMonths);
  const lastTime = known.length ? known[known.length - 1][0] : null;
  const observedAt = result.observedAt ?? time;
  if (isDuplicate(lastTime, observedAt)) {
    // The read worked, so a failure noted earlier no longer applies, even with no new count to store.
    if (hasPrevious && previous.lastAttempt?.ok === false) {
      writeAtomic(path.join(dir, 'latest.json'), `${JSON.stringify({ ...previous, lastAttempt: { at: iso(time), ok: true, error: null } }, null, 1)}\n`);
    }
    return { status: 'duplicate', players: result.players };
  }

  fs.mkdirSync(path.join(dir, 'samples'), { recursive: true });
  fs.appendFileSync(samplesFile(dir, monthOf(observedAt)), `[${observedAt},${result.players}]\n`);

  const storedHours = readJson(path.join(dir, 'hourly.json'));
  const storedRecent = readJson(path.join(dir, 'recent.json'));
  if (!hasPrevious || !Array.isArray(storedHours?.hours) || !Array.isArray(storedRecent?.samples)) {
    return { status: 'rebuilt', players: result.players, latest: rebuild(dir, { now: started }) };
  }

  const samples = [...known, [observedAt, result.players]];
  const recent = samples.filter(([sample]) => sample > observedAt - RECENT_SECONDS);
  const hour = hourOf(observedAt);
  const [thisHour] = aggregateHours(samples.filter(([sample]) => hourOf(sample) === hour));
  const hours = storedHours.hours.filter((row) => row[0] !== hour);
  hours.push(thisHour);
  hours.sort((a, b) => a[0] - b[0]);

  writeRows(path.join(dir, 'hourly.json'), 'hours', hours);
  writeRows(path.join(dir, 'recent.json'), 'samples', recent);
  const latest = buildLatest({
    time: observedAt,
    players: result.players,
    recent,
    hours,
    trackingSince: Math.floor(Date.parse(previous.trackingSince) / 1000),
    previousPeak: previous.stats?.peakRecorded ?? null,
    attemptAt: time,
    readings: (previous.readings ?? known.length) + 1,
  });
  writeAtomic(path.join(dir, 'latest.json'), `${JSON.stringify(latest, null, 1)}\n`);
  return { status: 'recorded', players: result.players, latest };
}
