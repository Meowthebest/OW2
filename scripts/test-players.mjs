// Tests the Steam collector and the player statistics logic. Run with: npm run test:players
// All player counts in this file are made up for the tests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { aggregateHours, buildSparkline, collectOnce, computeStats, isDuplicate, MAX_PLAUSIBLE_PLAYERS, observationTime, parseSteamBody, readSamples, readSteam, rebuild } from './players/lib.mjs';

const require = createRequire(import.meta.url);
const outdir = mkdtempSync(path.join(tmpdir(), 'ow2-players-'));
const outfile = path.join(outdir, 'core.cjs');
await build({ entryPoints: ['src/features/players/core.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
const {
  buildFrame,
  comparePeriodFor,
  comparePeriods,
  dailyRows,
  extremes,
  formatCompactCount,
  freshness,
  movingAverage,
  niceMax,
  parseHours,
  parseLatest,
  parseOptions,
  parseSamples,
  patchWindow,
  previousPeriod,
  serializeOptions,
  STALE_AFTER_MS,
  summarizeWindow,
  tableRows,
  DEFAULT_OPTIONS,
} = require(outfile);

let passed = 0;
const failures = [];
async function test(name, run) {
  try {
    await run();
    passed += 1;
  } catch (error) {
    failures.push(`${name}\n    ${error.message}`);
  }
}

const HOUR = 3600;
const DAY = 86400;
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0) / 1000;
const iso = (seconds) => new Date(seconds * 1000).toISOString();
const steamReply = (count, init = {}) => new Response(JSON.stringify({ response: { player_count: count, result: 1 } }), { status: 200, ...init });
const fetchOf = (...replies) => {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    const next = replies.length > 1 ? replies.shift() : replies[0];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next.clone();
  };
  fn.calls = calls;
  return fn;
};
const everyFive = (from, to, value = () => 30000) => {
  const rows = [];
  for (let time = from; time <= to; time += 300) rows.push([time, value(time)]);
  return rows;
};
const tempData = () => mkdtempSync(path.join(outdir, 'data-'));
const readJson = (dir, file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
const at = (seconds) => () => new Date(seconds * 1000);

// Reading Steam
await test('accepts only a believable whole number from a successful response', () => {
  assert.deepEqual(parseSteamBody({ response: { player_count: 31229, result: 1 } }), { ok: true, players: 31229 });
  for (const bad of [
    { response: { result: 42 } },
    { response: { player_count: 31229, result: 42 } },
    { response: { player_count: '31229', result: 1 } },
    { response: { player_count: 312.5, result: 1 } },
    { response: { player_count: 0, result: 1 } },
    { response: { player_count: -5, result: 1 } },
    { response: { player_count: MAX_PLAUSIBLE_PLAYERS + 1, result: 1 } },
    { response: { result: 1 } },
    { response: null },
    {},
    null,
    'nope',
  ]) {
    assert.equal(parseSteamBody(bad).ok, false, JSON.stringify(bad));
  }
});

await test('sends an identifying user agent and has a timeout', async () => {
  const fetchImpl = fetchOf(steamReply(40000));
  const result = await readSteam({ fetchImpl, clockSeconds: NOW });
  assert.deepEqual(result, { ok: true, players: 40000, observedAt: NOW });
  assert.match(fetchImpl.calls[0].options.headers['User-Agent'], /OW2-Hero-Selector/);
  assert.ok(fetchImpl.calls[0].options.signal);
  assert.match(fetchImpl.calls[0].url, /appid=2357570/);
});

await test('retries server errors, then succeeds', async () => {
  const waits = [];
  const fetchImpl = fetchOf(new Response('', { status: 503 }), steamReply(41000));
  assert.equal((await readSteam({ fetchImpl, wait: async (ms) => waits.push(ms) })).players, 41000);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(waits.length, 1);
});

await test('honors a rate limit, within reason', async () => {
  const waits = [];
  const limited = (seconds) => new Response('', { status: 429, headers: { 'retry-after': String(seconds) } });
  const fetchImpl = fetchOf(limited(7), limited(9999), steamReply(42000));
  assert.equal((await readSteam({ fetchImpl, wait: async (ms) => waits.push(ms) })).players, 42000);
  assert.deepEqual(waits, [7000, 30000]);
  const giveUp = await readSteam({ fetchImpl: fetchOf(() => limited(1)), wait: async () => {} });
  assert.deepEqual(giveUp, { ok: false, error: 'Steam rate limited this request' });
});

await test('reports timeouts, network failures, bad JSON and bad results without retrying forever', async () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const noWait = async () => {};
  assert.equal((await readSteam({ fetchImpl: fetchOf(timeout), wait: noWait })).error, 'Steam timed out');
  const network = await readSteam({ fetchImpl: fetchOf(new Error('getaddrinfo failed')), wait: noWait });
  assert.match(network.error, /Could not reach Steam/);
  assert.equal(network.ok, false);
  const notJson = await readSteam({ fetchImpl: fetchOf(() => new Response('<html>', { status: 200 })), wait: noWait });
  assert.equal(notJson.error, 'Steam sent a response that is not JSON');
  const fetchNotFound = fetchOf(new Response('{}', { status: 404 }));
  assert.equal((await readSteam({ fetchImpl: fetchNotFound, wait: noWait })).error, 'Steam returned HTTP 404');
  assert.equal(fetchNotFound.calls.length, 1);
  const bad = await readSteam({ fetchImpl: fetchOf(() => new Response(JSON.stringify({ response: { result: 42 } }), { status: 200 })), wait: noWait });
  assert.equal(bad.ok, false);
});

const cached = (players, expiresAt, maxAge = 900) => steamReply(players, { headers: { expires: new Date(expiresAt * 1000).toUTCString(), 'cache-control': `public, max-age=${maxAge}` } });

await test('the time of a reading comes from when Steam produced it', () => {
  const headers = (expires, control = 'public, max-age=900') => new Headers({ expires: new Date(expires * 1000).toUTCString(), 'cache-control': control });
  assert.equal(observationTime(headers(NOW + 600), NOW), NOW - 300);
  assert.equal(observationTime(new Headers(), NOW), NOW, 'no headers falls back to the clock');
  assert.equal(observationTime(headers(NOW + 600, 'no-store'), NOW), NOW);
  assert.equal(observationTime(new Headers({ expires: 'nonsense', 'cache-control': 'max-age=900' }), NOW), NOW);
  assert.equal(observationTime(headers(NOW - 86400), NOW), NOW, 'very old headers are not believed');
  assert.equal(observationTime(headers(NOW + 86400), NOW), NOW, 'future headers are not believed');
});

await test('repeated reads of one cached Steam count store one reading, at its real time', async () => {
  const dir = tempData();
  const produced = NOW - (NOW % 900) + 40;
  const expires = produced + 900;
  const fetchImpl = () => fetchOf(cached(33000, expires))();
  await collectOnce({ dir, now: at(produced + 60), fetchImpl });
  assert.equal(readJson(dir, 'latest.json').current.at, iso(produced));
  // Later five-minute checks inside the same cache window.
  const second = await collectOnce({ dir, now: at(produced + 360), fetchImpl });
  const third = await collectOnce({ dir, now: at(produced + 660), fetchImpl });
  assert.equal(second.status, 'duplicate');
  assert.equal(third.status, 'duplicate');
  assert.equal(readJson(dir, 'latest.json').readings, 1);
  assert.equal(readFileSync(path.join(dir, 'samples', '2026-11.jsonl'), 'utf8'), `[${produced},33000]\n`);
  // Steam publishes a new count.
  const next = await collectOnce({ dir, now: at(expires + 30), fetchImpl: fetchOf(cached(34000, expires + 900)) });
  assert.equal(next.status, 'recorded');
  assert.equal(readJson(dir, 'latest.json').current.at, iso(expires));
  assert.equal(readJson(dir, 'latest.json').readings, 2);
});

await test('a successful read clears a noted failure even with no new count', async () => {
  const dir = tempData();
  const produced = NOW - (NOW % 900) + 40;
  const expires = produced + 900;
  await collectOnce({ dir, now: at(produced + 60), fetchImpl: fetchOf(cached(33000, expires)) });
  await collectOnce({ dir, now: at(produced + 360), fetchImpl: fetchOf(() => new Response('', { status: 500 })), wait: async () => {} });
  assert.equal(readJson(dir, 'latest.json').lastAttempt.ok, false);
  const result = await collectOnce({ dir, now: at(produced + 660), fetchImpl: fetchOf(cached(33000, expires)) });
  assert.equal(result.status, 'duplicate');
  assert.equal(readJson(dir, 'latest.json').lastAttempt.ok, true);
  assert.equal(readJson(dir, 'latest.json').readings, 1);
});

// Statistics
await test('readings in the same five-minute window are one observation', () => {
  const start = NOW - (NOW % 300);
  assert.equal(isDuplicate(null, start), false);
  assert.equal(isDuplicate(start + 10, start + 200), true);
  assert.equal(isDuplicate(start + 10, start + 10), true);
  assert.equal(isDuplicate(start + 299, start + 300), false);
  assert.equal(isDuplicate(start + 400, start + 10), true, 'a clock going backward adds nothing');
});

await test('hours keep their low, average, high and count', () => {
  const hour = NOW - (NOW % HOUR);
  assert.deepEqual(aggregateHours([[hour + 10, 100], [hour + 310, 300], [hour + HOUR, 50]]), [[hour, 100, 200, 300, 2], [hour + HOUR, 50, 50, 50, 1]]);
});

await test('a new tracker shows no 24-hour peak, change or 30-day average', () => {
  const recent = everyFive(NOW - 2 * HOUR, NOW, () => 30000);
  const hours = aggregateHours(recent);
  const stats = computeStats({ recent, hours, now: NOW, players: 30000, trackingSince: NOW - 2 * HOUR, previousPeak: null });
  assert.equal(stats.peak24h, null);
  assert.equal(stats.change24h, null);
  assert.equal(stats.average30d, null);
  assert.ok(stats.coverage.hoursOf24 <= 3);
  assert.equal(stats.coverage.daysTracked, 0.1);
  assert.deepEqual(stats.peakRecorded, { players: 30000, at: iso(NOW) });
});

await test('the 24-hour peak needs most of a day of readings, and finds the real highest', () => {
  const value = (time) => (time === NOW - 5 * HOUR ? 55555 : 30000);
  const full = everyFive(NOW - 30 * HOUR, NOW, value);
  const stats = computeStats({ recent: full, hours: aggregateHours(full), now: NOW, players: 30000, trackingSince: NOW - 30 * HOUR });
  assert.equal(stats.peak24h.players, 55555);
  assert.equal(stats.peak24h.at, iso(NOW - 5 * HOUR));

  // Older than 24 hours doesn't count.
  const old = everyFive(NOW - 30 * HOUR, NOW, (time) => (time === NOW - 25 * HOUR ? 99999 : 30000));
  assert.equal(computeStats({ recent: old, hours: [], now: NOW, players: 30000, trackingSince: NOW - 30 * HOUR }).peak24h.players, 30000);

  // Only 19 of the last 24 hours recorded.
  const partial = everyFive(NOW - 19 * HOUR + 60, NOW);
  assert.equal(computeStats({ recent: partial, hours: [], now: NOW, players: 30000, trackingSince: NOW - 19 * HOUR }).peak24h, null);
  const justEnough = everyFive(NOW - 20 * HOUR + 60, NOW);
  assert.notEqual(computeStats({ recent: justEnough, hours: [], now: NOW, players: 30000, trackingSince: NOW - 20 * HOUR }).peak24h, null);

  // A long gap inside the day leaves it unavailable, even with old readings around it.
  const gappy = [...everyFive(NOW - 24 * HOUR + 60, NOW - 18 * HOUR), ...everyFive(NOW - 3 * HOUR, NOW)];
  assert.equal(computeStats({ recent: gappy, hours: [], now: NOW, players: 30000, trackingSince: NOW - 26 * HOUR }).peak24h, null);
});

await test('the 24-hour change compares with the reading closest to 24 hours ago', () => {
  const recent = [[NOW - DAY - 1500, 20000], [NOW - DAY + 300, 25000], [NOW - HOUR, 26000], [NOW, 30000]];
  const { change24h } = computeStats({ recent, hours: [], now: NOW, players: 30000, trackingSince: NOW - 2 * DAY });
  assert.equal(change24h.percent, 20);
  assert.equal(change24h.players, 5000);
  assert.deepEqual(change24h.comparedTo, { players: 25000, at: iso(NOW - DAY + 300) });

  const down = computeStats({ recent: [[NOW - DAY, 40000]], hours: [], now: NOW, players: 30000, trackingSince: NOW - 2 * DAY });
  assert.equal(down.change24h.percent, -25);

  // Nothing within half an hour of that time, so no comparison.
  const tooFar = computeStats({ recent: [[NOW - DAY - 1860, 40000], [NOW - DAY + 1860, 40000]], hours: [], now: NOW, players: 30000, trackingSince: NOW - 2 * DAY });
  assert.equal(tooFar.change24h, null);
  const edge = computeStats({ recent: [[NOW - DAY - 1800, 40000]], hours: [], now: NOW, players: 30000, trackingSince: NOW - 2 * DAY });
  assert.notEqual(edge.change24h, null);
});

await test('the 30-day average waits for 30 days and enough hours, and is a mean of hourly means', () => {
  const hourStart = NOW - (NOW % HOUR);
  const makeHours = (count, average = 30000) => Array.from({ length: count }, (_, index) => [hourStart - index * HOUR, average, average, average, 12]).reverse();

  const early = computeStats({ recent: [], hours: makeHours(700), now: NOW, players: 30000, trackingSince: NOW - 29 * DAY });
  assert.equal(early.average30d, null, 'needs 30 days of tracking');

  const thin = computeStats({ recent: [], hours: makeHours(500), now: NOW, players: 30000, trackingSince: NOW - 40 * DAY });
  assert.equal(thin.average30d, null, 'needs 80% of the hours');
  assert.equal(thin.coverage.hoursOf720, 500);

  const enough = computeStats({ recent: [], hours: makeHours(600), now: NOW, players: 30000, trackingSince: NOW - 40 * DAY });
  assert.deepEqual(enough.average30d, { players: 30000, hours: 600 });

  // Busy hours sampled twelve times don't outweigh quiet hours sampled once.
  const uneven = [[hourStart - HOUR, 1, 10000, 1, 12], ...makeHours(0)];
  const quiet = Array.from({ length: 599 }, (_, index) => [hourStart - (index + 2) * HOUR, 1, 20000, 1, 1]).reverse();
  const mixed = computeStats({ recent: [], hours: [...quiet, ...uneven], now: NOW, players: 30000, trackingSince: NOW - 40 * DAY });
  assert.equal(mixed.average30d.players, Math.round((599 * 20000 + 10000) / 600));

  // Hours older than 30 days are not included.
  const old = [[hourStart - 40 * DAY, 1, 999999, 1, 1], ...makeHours(600)];
  assert.equal(computeStats({ recent: [], hours: old, now: NOW, players: 30000, trackingSince: NOW - 41 * DAY }).average30d.players, 30000);
});

await test('the recorded peak only rises', () => {
  const peak = { players: 50000, at: iso(NOW - DAY) };
  assert.deepEqual(computeStats({ recent: [], hours: [], now: NOW, players: 40000, trackingSince: NOW - 2 * DAY, previousPeak: peak }).peakRecorded, peak);
  assert.deepEqual(computeStats({ recent: [], hours: [], now: NOW, players: 60000, trackingSince: NOW - 2 * DAY, previousPeak: peak }).peakRecorded, { players: 60000, at: iso(NOW) });
});

await test('the sparkline only uses the last 24 hours of real readings', () => {
  const rows = everyFive(NOW - 2 * DAY, NOW);
  const line = buildSparkline(rows, NOW);
  assert.ok(line.length <= 48 && line.length >= 47);
  assert.ok(line.every(([time]) => time > NOW - DAY && time <= NOW));
  assert.deepEqual(buildSparkline([], NOW), []);
  assert.equal(buildSparkline([[NOW, 5]], NOW).length, 1);
});

// The store
await test('the first run creates the store, and readings persist across runs', async () => {
  const dir = tempData();
  const first = await collectOnce({ dir, now: at(NOW), fetchImpl: fetchOf(steamReply(30000)) });
  assert.equal(first.status, 'rebuilt');
  const latest = readJson(dir, 'latest.json');
  assert.equal(latest.current.players, 30000);
  assert.equal(latest.current.at, iso(NOW));
  assert.equal(latest.trackingSince, iso(NOW));
  assert.equal(latest.readings, 1);
  assert.equal(latest.appId, 2357570);
  assert.deepEqual(latest.lastAttempt, { at: iso(NOW), ok: true, error: null });
  assert.equal(latest.stats.peak24h, null);

  const second = await collectOnce({ dir, now: at(NOW + 300), fetchImpl: fetchOf(steamReply(31000)) });
  assert.equal(second.status, 'recorded');
  const next = readJson(dir, 'latest.json');
  assert.equal(next.readings, 2);
  assert.equal(next.trackingSince, iso(NOW));
  assert.equal(next.current.players, 31000);
  assert.equal(next.stats.peakRecorded.players, 31000);
  assert.deepEqual(readJson(dir, 'recent.json').samples, [[NOW, 30000], [NOW + 300, 31000]]);
  assert.deepEqual(readJson(dir, 'hourly.json').hours, [[NOW - (NOW % HOUR), 30000, 30500, 31000, 2]]);
  assert.equal(readFileSync(path.join(dir, 'samples', '2026-11.jsonl'), 'utf8'), `[${NOW},30000]\n[${NOW + 300},31000]\n`);
});

await test('no duplicate records: a second run in the same window writes nothing', async () => {
  const dir = tempData();
  await collectOnce({ dir, now: at(NOW + 30), fetchImpl: fetchOf(steamReply(30000)) });
  const before = readFileSync(path.join(dir, 'latest.json'), 'utf8');
  const raw = readFileSync(path.join(dir, 'samples', '2026-11.jsonl'), 'utf8');
  const again = await collectOnce({ dir, now: at(NOW + 200), fetchImpl: fetchOf(steamReply(30999)) });
  assert.equal(again.status, 'duplicate');
  assert.equal(readFileSync(path.join(dir, 'latest.json'), 'utf8'), before);
  assert.equal(readFileSync(path.join(dir, 'samples', '2026-11.jsonl'), 'utf8'), raw);
});

await test('a failed read keeps every stored value and notes the failure, and a later success clears it', async () => {
  const dir = tempData();
  await collectOnce({ dir, now: at(NOW), fetchImpl: fetchOf(steamReply(30000)) });
  const fail = await collectOnce({ dir, now: at(NOW + 300), fetchImpl: fetchOf(() => new Response('', { status: 500 })), wait: async () => {} });
  assert.equal(fail.status, 'failed');
  const latest = readJson(dir, 'latest.json');
  assert.equal(latest.current.players, 30000);
  assert.equal(latest.current.at, iso(NOW));
  assert.deepEqual(latest.lastAttempt, { at: iso(NOW + 300), ok: false, error: 'Steam returned HTTP 500' });
  assert.deepEqual(readJson(dir, 'recent.json').samples, [[NOW, 30000]]);

  const invalid = await collectOnce({ dir, now: at(NOW + 600), fetchImpl: fetchOf(steamReply(0)) });
  assert.equal(invalid.status, 'failed');
  assert.equal(readJson(dir, 'latest.json').current.players, 30000, 'a zero is never stored');

  await collectOnce({ dir, now: at(NOW + 900), fetchImpl: fetchOf(steamReply(32000)) });
  const recovered = readJson(dir, 'latest.json');
  assert.equal(recovered.current.players, 32000);
  assert.equal(recovered.lastAttempt.ok, true);
  assert.deepEqual(readJson(dir, 'recent.json').samples, [[NOW, 30000], [NOW + 900, 32000]]);
});

await test('a failed first read stores nothing at all', async () => {
  const dir = tempData();
  const result = await collectOnce({ dir, now: at(NOW), fetchImpl: fetchOf(() => new Response('', { status: 500 })), wait: async () => {} });
  assert.equal(result.status, 'failed');
  assert.deepEqual(readdirSync(dir), []);
});

await test('readings carry across months, and only the last 8 days stay in the recent file', async () => {
  const dir = tempData();
  const start = Date.UTC(2026, 9, 25, 0, 0, 0) / 1000;
  const fetchImpl = fetchOf(steamReply(30000));
  for (let day = 0; day < 10; day += 1) await collectOnce({ dir, now: at(start + day * DAY), fetchImpl: () => fetchImpl() });
  assert.deepEqual(readdirSync(path.join(dir, 'samples')).sort(), ['2026-10.jsonl', '2026-11.jsonl']);
  const latest = readJson(dir, 'latest.json');
  assert.equal(latest.readings, 10);
  const recent = readJson(dir, 'recent.json').samples;
  assert.ok(recent.length <= 9 && recent.length >= 8);
  assert.equal(readJson(dir, 'hourly.json').hours.length, 10);
  assert.equal(latest.trackingSince, iso(start));
});

await test('derived files rebuild from the raw readings if missing or damaged', async () => {
  const dir = tempData();
  const start = NOW - 3 * HOUR;
  for (let index = 0; index < 5; index += 1) await collectOnce({ dir, now: at(start + index * 600), fetchImpl: fetchOf(steamReply(30000 + index)) });
  const expectedHours = readJson(dir, 'hourly.json');
  const expectedRecent = readJson(dir, 'recent.json');
  unlinkSync(path.join(dir, 'hourly.json'));
  await collectOnce({ dir, now: at(start + 3000), fetchImpl: fetchOf(steamReply(30005)) });
  assert.equal(readJson(dir, 'hourly.json').hours.at(-1)[0], expectedHours.hours.at(-1)[0]);
  assert.equal(readJson(dir, 'recent.json').samples.length, expectedRecent.samples.length + 1);
  assert.equal(readJson(dir, 'latest.json').readings, 6);

  writeFileSync(path.join(dir, 'latest.json'), '{not json');
  const repaired = await collectOnce({ dir, now: at(start + 3600), fetchImpl: fetchOf(steamReply(30006)) });
  assert.equal(repaired.status, 'rebuilt');
  assert.equal(readJson(dir, 'latest.json').readings, 7);
  assert.equal(readJson(dir, 'latest.json').trackingSince, iso(start));
  assert.equal(readJson(dir, 'latest.json').stats.peakRecorded.players, 30006);

  const full = rebuild(dir, { now: new Date((start + 3700) * 1000) });
  assert.equal(full.readings, 7);
  assert.equal(rebuild(tempData()), null);
});

await test('a damaged raw line is skipped, not fatal', async () => {
  const dir = tempData();
  await collectOnce({ dir, now: at(NOW), fetchImpl: fetchOf(steamReply(30000)) });
  appendFileSync(path.join(dir, 'samples', '2026-11.jsonl'), 'garbage\n[1,"x"]\n[2,-5]\n');
  await collectOnce({ dir, now: at(NOW + 300), fetchImpl: fetchOf(steamReply(31000)) });
  assert.deepEqual(readSamples(dir, ['2026-11']), [[NOW, 30000], [NOW + 300, 31000]]);
});

await test('the command stays successful through a Steam outage and keeps the data', async () => {
  const dir = tempData();
  const earlier = Math.floor(Date.now() / 1000) - HOUR;
  await collectOnce({ dir, now: at(earlier), fetchImpl: fetchOf(steamReply(30000)) });
  let status = 500;
  const server = http.createServer((request, response) => {
    response.statusCode = status;
    response.end(status === 200 ? JSON.stringify({ response: { player_count: 45678, result: 1 } }) : 'down');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const run = () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/players/collect.mjs', dir], { env: { ...process.env, STEAM_PLAYERS_URL: url } });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => resolve({ code, out }));
  });
  const failed = await run();
  assert.equal(failed.code, 0);
  assert.match(failed.out, /::warning::Steam read failed/);
  assert.equal(readJson(dir, 'latest.json').current.players, 30000);
  status = 200;
  const ok = await run();
  assert.equal(ok.code, 0);
  assert.match(ok.out, /Recorded 45678 players/);
  assert.equal(readJson(dir, 'latest.json').current.players, 45678);
  server.close();
});

// Reading the stored files on the site
const sampleLatest = (overrides = {}) => ({
  schema: 1,
  appId: 2357570,
  source: 'x',
  trackingSince: iso(NOW - DAY),
  readings: 3,
  current: { players: 30000, at: iso(NOW) },
  lastAttempt: { at: iso(NOW), ok: true, error: null },
  stats: { peak24h: null, change24h: null, average30d: null, peakRecorded: { players: 30000, at: iso(NOW) }, coverage: { hoursOf24: 1, daysTracked: 1, hoursOf720: 1 } },
  sparkline: [],
  ...overrides,
});

await test('damaged files are rejected so the last good data stays on screen', () => {
  assert.equal(parseLatest(sampleLatest()).current.players, 30000);
  for (const bad of [null, 'x', {}, { schema: 2 }, sampleLatest({ current: { players: 'lots', at: iso(NOW) } }), sampleLatest({ current: { players: 5, at: 'never' } }), sampleLatest({ trackingSince: 'soon' }), sampleLatest({ stats: null })]) {
    assert.equal(parseLatest(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseLatest(sampleLatest({ sparkline: 'x' })).sparkline, []);
  assert.deepEqual(parseSamples({ samples: [[1, 2], ['a', 2], [3]] }), [[1, 2]]);
  assert.equal(parseSamples({}), null);
  assert.deepEqual(parseHours({ hours: [[1, 2, 3, 4, 5], [1, 2]] }), [[1, 2, 3, 4, 5]]);
  assert.equal(parseHours(null), null);
});

await test('data is stale after 30 minutes or a failed read', () => {
  const nowMs = NOW * 1000;
  assert.equal(freshness(sampleLatest(), nowMs).stale, false);
  assert.equal(freshness(sampleLatest(), nowMs + STALE_AFTER_MS - 1).stale, false);
  assert.deepEqual(freshness(sampleLatest(), nowMs + STALE_AFTER_MS + 1), { ageMs: STALE_AFTER_MS + 1, stale: true, reason: 'old' });
  assert.equal(freshness(sampleLatest({ lastAttempt: { at: iso(NOW), ok: false, error: 'x' } }), nowMs).reason, 'failed');
});

// Chart data
await test('a range never starts before the first reading, and says when it is shorter than asked', () => {
  const samples = everyFive(NOW - 2 * HOUR, NOW);
  const frame = buildFrame('24h', { samples }, NOW);
  assert.equal(frame.start, NOW - 2 * HOUR);
  assert.equal(frame.end, NOW);
  assert.equal(frame.shorterThanRange, true);
  assert.equal(frame.points, samples.length);
  assert.equal(frame.resolution, 'raw');

  const old = everyFive(NOW - 30 * HOUR, NOW);
  const day = buildFrame('24h', { samples: old }, NOW);
  assert.equal(day.start, NOW - DAY);
  assert.equal(day.shorterThanRange, false);
  assert.equal(buildFrame('24h', { samples: [] }, NOW), null);
  assert.equal(buildFrame('30d', { hours: [] }, NOW), null);
  assert.equal(buildFrame('7d', {}, NOW), null);
});

await test('a long gap breaks the line instead of joining across it', () => {
  const samples = [...everyFive(NOW - 10 * HOUR, NOW - 8 * HOUR), ...everyFive(NOW - 2 * HOUR, NOW)];
  const frame = buildFrame('24h', { samples }, NOW);
  assert.equal(frame.players.filter((value) => value === null).length, 1);
  assert.equal(frame.points, samples.length);
  // A short delay, as a late scheduler leaves, does not.
  const late = buildFrame('24h', { samples: [[NOW - 3000, 1], [NOW, 2]] }, NOW);
  assert.equal(late.players.filter((value) => value === null).length, 0);

  const hours = [[NOW - 10 * HOUR, 1, 2, 3, 1], [NOW - 2 * HOUR, 1, 2, 3, 1], [NOW - HOUR, 1, 2, 3, 1]];
  const hourly = buildFrame('30d', { hours }, NOW);
  assert.equal(hourly.players.filter((value) => value === null).length, 1);
  assert.equal(hourly.low.length, hourly.x.length);
  assert.equal(hourly.high.length, hourly.x.length);
});

await test('long ranges use days once months exist, and partial days are left out', () => {
  const hourStart = NOW - (NOW % DAY);
  const makeHours = (days) => {
    const rows = [];
    for (let time = hourStart - days * DAY; time < hourStart; time += HOUR) rows.push([time, 10, 20, 30, 12]);
    return rows;
  };
  assert.equal(buildFrame('6m', { hours: makeHours(10) }, NOW).resolution, 'hourly');
  assert.equal(buildFrame('all', { hours: makeHours(59) }, NOW).resolution, 'hourly');
  const long = buildFrame('all', { hours: makeHours(100) }, NOW);
  assert.equal(long.resolution, 'daily');
  assert.equal(long.points, 100);
  assert.deepEqual(long.low.slice(0, 1), [10]);
  assert.deepEqual(long.high.slice(0, 1), [30]);
  assert.equal(buildFrame('90d', { hours: makeHours(100) }, NOW).points >= 90, true);
  assert.equal(buildFrame('90d', { hours: makeHours(100) }, NOW).points <= 91, true);

  const partial = [[hourStart, 5, 6, 7, 1], ...Array.from({ length: 12 }, (_, index) => [hourStart + DAY + index * HOUR, 5, 6, 7, 1])];
  assert.deepEqual(dailyRows(partial).map((row) => row[0]), [hourStart + DAY]);

  const hourly = buildFrame('7d', { samples: everyFive(NOW - DAY, NOW), hours: makeHours(20) }, NOW, { forceHourly: true });
  assert.equal(hourly.resolution, 'hourly');
});

await test('a moving average starts only after a full window, and recovers slowly after a gap', () => {
  const x = [];
  const values = [];
  for (let index = 0; index < 24; index += 1) {
    x.push(NOW + index * HOUR);
    values.push(100);
  }
  const average = movingAverage(x, values, 6 * HOUR, HOUR);
  assert.deepEqual(average.slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(average[6], 100);
  assert.equal(average.at(-1), 100);

  const rising = movingAverage([0, 10, 20, 30], [10, 20, 30, 40], 20, 10);
  assert.deepEqual(rising, [null, null, 20, 30]);

  const gapX = [0, 10, 20, 21, 90, 100, 110];
  const gapValues = [10, 10, 10, null, 50, 50, 50];
  const gapped = movingAverage(gapX, gapValues, 40, 10);
  assert.equal(gapped[3], null);
  assert.equal(gapped[4], null, 'one reading after a gap is not enough for the window');
  assert.equal(gapped[5], 50);
  assert.deepEqual(movingAverage([], [], 10, 10), []);
  assert.deepEqual(movingAverage([1], [null], 10, 10), [null]);
});

await test('the previous-period line only uses real readings close to that moment', () => {
  const source = [[1000 - 100, 50], [2000 - 100, 60], [5000 - 100, 70]];
  const result = previousPeriod([1000, 2000, 2500, 3000, 5000], [1, 1, null, 1, 1], 100, source, 30);
  assert.deepEqual(result, [50, 60, null, null, 70]);
  assert.deepEqual(previousPeriod([1000], [1], 100, [], 30), [null]);
});

await test('peak and low come from what is visible, using true highs and lows', () => {
  const x = [1, 2, 3, 4];
  const values = [10, 40, null, 20];
  assert.deepEqual(extremes(x, values, 0, 10), { high: { time: 2, players: 40 }, low: { time: 1, players: 10 } });
  assert.deepEqual(extremes(x, values, 3, 10), { high: { time: 4, players: 20 }, low: { time: 4, players: 20 } });
  assert.equal(extremes(x, values, 8, 10), null);
  assert.deepEqual(extremes(x, values, 0, 10, [15, 45, null, 25], [5, 35, null, 15]), { high: { time: 2, players: 45 }, low: { time: 1, players: 5 } });
});

// Comparisons
const hourRows = (from, to, average = 30000) => {
  const rows = [];
  for (let time = from; time < to; time += HOUR) rows.push([time, average - 100, average, average + 100, 12]);
  return rows;
};

await test('a window needs enough recorded hours to summarize', () => {
  const rows = hourRows(NOW - 10 * HOUR, NOW);
  assert.deepEqual(summarizeWindow(rows, NOW - 10 * HOUR, NOW, 0.8), { average: 30000, peak: 30100, low: 29900, hours: 10 });
  assert.equal(summarizeWindow(rows, NOW - 20 * HOUR, NOW, 0.8), null);
  assert.equal(summarizeWindow([], NOW - HOUR, NOW, 0.1), null);
});

await test('daily and weekly comparisons need both periods recorded', () => {
  const end = NOW - (NOW % HOUR);
  const rows = [...hourRows(end - 2 * DAY, end - DAY, 20000), ...hourRows(end - DAY, end, 25000)];
  const result = comparePeriods(rows, NOW, DAY);
  assert.equal(result.current.average, 25000);
  assert.equal(result.previous.average, 20000);
  assert.equal(result.averageChange, 25);
  assert.equal(result.peakChange, 24.9);
  assert.equal(comparePeriods(rows, NOW, 7 * DAY), null);
  assert.equal(comparePeriods(hourRows(end - DAY, end), NOW, DAY), null);
});

await test('patch comparison leaves out the release day and needs both sides', () => {
  const date = '2026-11-10';
  const released = Date.UTC(2026, 10, 10) / 1000;
  const rows = [
    ...hourRows(released - 3 * DAY, released, 30000),
    ...hourRows(released, released + DAY, 99999),
    ...hourRows(released + DAY, released + 4 * DAY, 33000),
  ];
  const now = released + 5 * DAY;
  const result = patchWindow(date, rows, 3, now);
  assert.equal(result.before.average, 30000);
  assert.equal(result.after.average, 33000, 'the release day is not counted on either side');
  assert.equal(result.averageChange, 10);

  const tooSoon = patchWindow(date, rows, 3, released + 2 * DAY);
  assert.equal(tooSoon.after, null, 'an unfinished window is not compared');
  assert.equal(tooSoon.averageChange, null);

  const beforeTracking = patchWindow(date, rows.filter(([hour]) => hour >= released), 3, now);
  assert.equal(beforeTracking.before, null);
  assert.equal(beforeTracking.averageChange, null);
  assert.notEqual(beforeTracking.after, null);
});

await test('the table uses hours for short views and days for long ones, newest first', () => {
  const end = NOW - (NOW % DAY);
  const rows = hourRows(end - 5 * DAY, end);
  const short = tableRows(rows, end - DAY, end);
  assert.equal(short.unit, 'hour');
  assert.equal(short.rows[0].time, end - HOUR);
  const long = tableRows(rows, end - 5 * DAY, end);
  assert.equal(long.unit, 'day');
  assert.equal(long.rows.length, 5);
  assert.equal(long.rows[0].time, end - DAY);
  assert.deepEqual([long.rows[0].average, long.rows[0].low, long.rows[0].high, long.rows[0].readings], [30000, 29900, 30100, 288]);
});

await test('axes and numbers read cleanly', () => {
  assert.equal(niceMax(0), 10);
  assert.equal(niceMax(51000), 60000);
  assert.equal(niceMax(9000), 10000);
  assert.ok(niceMax(1000) >= 1000);
  assert.equal(formatCompactCount(31229), '31K');
  assert.equal(formatCompactCount(1500), '1.5K');
  assert.equal(formatCompactCount(250), '250');
  assert.equal(formatCompactCount(1_250_000), '1.3M');
});

await test('chart options round trip through the URL, and unknown values fall back', () => {
  assert.equal(serializeOptions(DEFAULT_OPTIONS), '');
  assert.deepEqual(parseOptions(''), DEFAULT_OPTIONS);
  const options = { range: '90d', average: true, compare: true, patches: false };
  assert.deepEqual(parseOptions(serializeOptions(options)), options);
  assert.equal(parseOptions('range=10y').range, '24h');
  assert.equal(comparePeriodFor('24h'), DAY);
  assert.equal(comparePeriodFor('7d'), 7 * DAY);
  assert.equal(comparePeriodFor('30d'), null);
});

await test('the workflow runs every five minutes and keeps readings off main', () => {
  const workflow = readFileSync('.github/workflows/record-players.yml', 'utf8');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /refs\/heads\/player-data/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /contents: write/);
  assert.ok(!/\bsecrets\./.test(workflow), 'needs no secrets');
  assert.ok(existsSync('scripts/players/collect.mjs'));
});

rmSync(outdir, { recursive: true, force: true });

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
