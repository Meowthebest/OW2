// Tests the pure randomizer and career-data logic. Run with: npm run test:logic
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const outdir = mkdtempSync(path.join(tmpdir(), 'ow2-logic-'));
const outfile = path.join(outdir, 'logic.cjs');

// One bundle, so `instanceof CareerError` sees a single class across modules.
await build({
  stdin: {
    contents: [
      "export * from './src/data/heroes.ts';",
      "export * from './src/lib/randomizer.ts';",
      "export * from './src/lib/format.ts';",
      "export * from './src/lib/router.ts';",
      "export * from './src/features/career/api/store.ts';",
      "export * from './src/features/career/api/provider.ts';",
      "export * from './src/features/career/api/errors.ts';",
      "export * from './src/features/career/api/requests.ts';",
      "export * from './src/features/career/api/parseQuery.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'silent',
});

const {
  HEROES,
  HERO_BY_ID,
  ROLES,
  buildReel,
  drawLineup,
  filterPool,
  secureRandomInt,
  formatCompact,
  formatDuration,
  formatPercent,
  formatPlaytime,
  careerHref,
  parseHash,
  CareerStore,
  CAREER_TTL_MS,
  REFRESH_COOLDOWN_MS,
  RETENTION_MS,
  createOverfastProvider,
  CareerError,
  requestKey,
  requestPath,
  normalizePlayerId,
  parsePlayerQuery,
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

const base = { roles: [...ROLES], excluded: [], noRepeats: false, used: [], currentId: null };

// One player is a lineup of one.
function drawHero(heroes, { currentId, reroll, ...input }) {
  const draw = drawLineup(heroes, { ...input, slots: [{ slot: 0, role: 'any', previousId: currentId ?? null, avoidPrevious: reroll }] });
  const [pick] = draw.picks;
  return pick.hero ? { kind: 'hero', hero: pick.hero, used: draw.used, cycleRestarted: draw.cycleRestarted } : { kind: 'empty' };
}

const seats = (...roles) => roles.map((role, slot) => ({ slot, role, previousId: null }));
const lineupBase = { roles: [...ROLES], excluded: [], noRepeats: false, used: [] };

// Roster
await test('roster matches the official Season 5 counts', () => {
  assert.equal(HEROES.length, 54);
  assert.equal(HEROES.filter((hero) => hero.role === 'tank').length, 15);
  assert.equal(HEROES.filter((hero) => hero.role === 'damage').length, 23);
  assert.equal(HEROES.filter((hero) => hero.role === 'support').length, 16);
  assert.equal(HERO_BY_ID.sombra.role, 'support');
  assert.ok(HERO_BY_ID.dmon && HERO_BY_ID.doctrine);
  assert.equal(new Set(HEROES.map((hero) => hero.id)).size, 54);
});

// Randomizer
await test('secure random integers stay in range and are uniform', () => {
  const counts = Array(6).fill(0);
  for (let i = 0; i < 60000; i += 1) counts[secureRandomInt(6)] += 1;
  counts.forEach((count) => assert.ok(Math.abs(count - 10000) < 500, `bucket ${count}`));
});

await test('every eligible hero is drawn evenly (chi-square)', () => {
  const pool = filterPool(HEROES, { roles: ['support'], excluded: [] });
  const counts = Object.fromEntries(pool.map((hero) => [hero.id, 0]));
  const draws = 32000;
  for (let i = 0; i < draws; i += 1) counts[drawHero(HEROES, { ...base, roles: ['support'] }).hero.id] += 1;
  const expected = draws / pool.length;
  const chi = Object.values(counts).reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
  // p = 0.001 critical value for 15 degrees of freedom.
  assert.ok(chi < 37.7, `chi-square ${chi.toFixed(1)}`);
});

await test('role filters and exclusions are always respected', () => {
  for (let i = 0; i < 3000; i += 1) {
    const draw = drawHero(HEROES, { ...base, roles: ['tank'], excluded: ['dva', 'winston'] });
    assert.equal(draw.hero.role, 'tank');
    assert.ok(!['dva', 'winston'].includes(draw.hero.id));
  }
});

await test('an empty pool draws nothing', () => {
  assert.equal(drawHero(HEROES, { ...base, excluded: HEROES.map((hero) => hero.id) }).kind, 'empty');
  assert.equal(drawHero(HEROES, { ...base, roles: [] }).kind, 'empty');
});

await test('no-repeats exhausts the pool exactly once, then restarts', () => {
  let used = [];
  let currentId = null;
  const seen = new Set();
  const size = HEROES.filter((hero) => hero.role === 'tank').length;
  for (let i = 0; i < size; i += 1) {
    const draw = drawHero(HEROES, { ...base, roles: ['tank'], noRepeats: true, used, currentId });
    assert.ok(!seen.has(draw.hero.id), 'repeat before exhaustion');
    assert.equal(draw.cycleRestarted, false);
    seen.add(draw.hero.id);
    used = draw.used;
    currentId = draw.hero.id;
  }
  assert.equal(seen.size, size);
  const next = drawHero(HEROES, { ...base, roles: ['tank'], noRepeats: true, used, currentId });
  assert.equal(next.cycleRestarted, true);
  assert.notEqual(next.hero.id, currentId, 'a restart must not repeat the last hero');
  assert.equal(next.used.length, 1);
});

await test('a restart only clears the current pool', () => {
  const tankIds = HEROES.filter((hero) => hero.role === 'tank').map((hero) => hero.id);
  const next = drawHero(HEROES, { ...base, roles: ['tank'], noRepeats: true, used: [...tankIds, 'ana', 'genji'], currentId: 'dva' });
  assert.equal(next.cycleRestarted, true);
  assert.ok(next.used.includes('ana') && next.used.includes('genji'));
});

await test('reroll never returns the current hero when another exists', () => {
  for (let i = 0; i < 2000; i += 1) {
    assert.notEqual(drawHero(HEROES, { ...base, roles: ['tank'], currentId: 'dva', reroll: true }).hero.id, 'dva');
  }
  const lastOne = HEROES.filter((hero) => hero.id !== 'ana').map((hero) => hero.id);
  assert.equal(drawHero(HEROES, { ...base, excluded: lastOne, currentId: 'ana', reroll: true }).hero.id, 'ana');
});

await test('a team of five never gets the same hero twice', () => {
  for (let i = 0; i < 2000; i += 1) {
    const { picks } = drawLineup(HEROES, { ...lineupBase, slots: seats('any', 'any', 'any', 'any', 'any') });
    assert.equal(new Set(picks.map((pick) => pick.hero.id)).size, 5);
    assert.deepEqual(picks.map((pick) => pick.slot), [0, 1, 2, 3, 4]);
  }
});

await test('each seat gets its role, and every seat has even odds', () => {
  const counts = [{}, {}];
  const draws = 16000;
  for (let i = 0; i < draws; i += 1) {
    const { picks } = drawLineup(HEROES, { ...lineupBase, slots: seats('tank', 'tank') });
    picks.forEach((pick, seat) => {
      assert.equal(pick.hero.role, 'tank');
      counts[seat][pick.hero.id] = (counts[seat][pick.hero.id] ?? 0) + 1;
    });
  }
  // Neither seat is favored: both draw the same 15 tanks at 1 in 15 each.
  for (const seat of counts) {
    const values = Object.values(seat);
    assert.equal(values.length, 15);
    const expected = draws / 15;
    const chi = values.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    // p = 0.001 critical value for 14 degrees of freedom.
    assert.ok(chi < 36.1, `chi-square ${chi.toFixed(1)}`);
  }
});

await test('role-locked players are served before open slots can take their hero', () => {
  // Only one tank is available. The open seat must not take it, whichever seat rolls first.
  const excluded = HEROES.filter((hero) => hero.role === 'tank' && hero.id !== 'dva').map((hero) => hero.id);
  for (let i = 0; i < 500; i += 1) {
    const { picks } = drawLineup(HEROES, { ...lineupBase, excluded, slots: seats('any', 'tank') });
    assert.equal(picks[1].hero.id, 'dva');
    assert.notEqual(picks[0].hero.id, 'dva');
  }
});

await test('a shortage leaves the extra player empty instead of doubling up', () => {
  const excluded = HEROES.filter((hero) => hero.role === 'tank' && hero.id !== 'dva').map((hero) => hero.id);
  const { picks } = drawLineup(HEROES, { ...lineupBase, excluded, slots: seats('tank', 'tank') });
  assert.equal(picks.filter((pick) => pick.hero?.id === 'dva').length, 1);
  assert.equal(picks.filter((pick) => pick.hero === null).length, 1);
});

await test('rerolling one player avoids teammates and their own last hero', () => {
  const locked = ['ana', 'mercy', 'kiriko'];
  for (let i = 0; i < 1000; i += 1) {
    const { picks } = drawLineup(HEROES, { ...lineupBase, roles: ['support'], locked, slots: [{ slot: 3, role: 'any', previousId: 'moira', avoidPrevious: true }] });
    assert.ok(![...locked, 'moira'].includes(picks[0].hero.id));
    assert.equal(picks[0].slot, 3);
  }
});

await test('no repeats is shared across the whole team', () => {
  let used = [];
  const seen = new Set();
  const rounds = Math.floor(HEROES.length / 5);
  for (let round = 0; round < rounds; round += 1) {
    const draw = drawLineup(HEROES, { ...lineupBase, noRepeats: true, used, slots: seats('any', 'any', 'any', 'any', 'any') });
    assert.equal(draw.cycleRestarted, false);
    for (const pick of draw.picks) {
      assert.ok(!seen.has(pick.hero.id), pick.hero.id + ' repeated');
      seen.add(pick.hero.id);
    }
    used = draw.used;
  }
  assert.equal(seen.size, rounds * 5);
  // 4 heroes remain for 5 players: the last player's draw restarts the cycle, still with no duplicates.
  const last = drawLineup(HEROES, { ...lineupBase, noRepeats: true, used, slots: seats('any', 'any', 'any', 'any', 'any') });
  assert.equal(last.cycleRestarted, true);
  assert.equal(new Set(last.picks.map((pick) => pick.hero.id)).size, 5);
});

await test('the reel lands on the winner and shows only eligible heroes', () => {
  const pool = filterPool(HEROES, { roles: ['support'], excluded: ['ana'] });
  for (let i = 0; i < 200; i += 1) {
    const reel = buildReel(pool, pool[3], 46, 40);
    assert.equal(reel.length, 46);
    assert.equal(reel[40].id, pool[3].id);
    assert.ok(reel.every((hero) => hero.role === 'support' && hero.id !== 'ana'));
  }
  assert.equal(buildReel(pool.slice(0, 2), pool[0], 20, 15).length, 20);
});

// Formatting and routing
await test('formatting handles missing values and durations', () => {
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(5935880), '1,648h 51m');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(3600), '1h');
  assert.equal(formatPercent(51.45), '51.5%');
  assert.equal(formatCompact(77157033), '77.2M');
  assert.equal(formatCompact(undefined), '—');
  assert.equal(formatPlaytime(419760), '117 HRS');
  assert.equal(formatPlaytime(3600), '1 HR');
  assert.equal(formatPlaytime(600), '10 MINS');
  assert.equal(formatPlaytime(60), '1 MIN');
  assert.equal(formatPlaytime(12), '12 SECS');
  assert.equal(formatPlaytime(null), '—');
});

await test('routes round-trip, including ids with a pipe', () => {
  assert.deepEqual(parseHash('#/'), { view: 'randomizer' });
  assert.deepEqual(parseHash('#/heroes'), { view: 'heroes' });
  assert.deepEqual(parseHash(''), { view: 'randomizer' });
  const href = careerHref('abc|def', 'statistics', 'soldier-76');
  assert.equal(href, '#/career/abc%7Cdef/statistics/soldier-76');
  assert.deepEqual(parseHash(href), { view: 'career', playerId: 'abc|def', tab: 'statistics', hero: 'soldier-76' });
  assert.deepEqual(parseHash('#/career'), { view: 'career', playerId: undefined, tab: 'overview', hero: undefined });
});

// Player search input
await test('search input accepts every supported identifier', () => {
  assert.deepEqual(parsePlayerQuery('  TeKrop#2217 '), { kind: 'battletag', tag: 'TeKrop-2217', name: 'TeKrop' });
  assert.deepEqual(parsePlayerQuery('TeKrop-2217'), { kind: 'battletag', tag: 'TeKrop-2217', name: 'TeKrop' });
  assert.deepEqual(parsePlayerQuery('TeKrop'), { kind: 'name', name: 'TeKrop' });
  assert.deepEqual(parsePlayerQuery('Gørn#11234'), { kind: 'battletag', tag: 'Gørn-11234', name: 'Gørn' });
  assert.deepEqual(parsePlayerQuery('c65b8798bc61d6ffbba120%7Ccfe9dd77a4382165e2b920bdcc035949'), { kind: 'id', id: 'c65b8798bc61d6ffbba120|cfe9dd77a4382165e2b920bdcc035949' });
  assert.deepEqual(parsePlayerQuery('https://overwatch.blizzard.com/en-us/career/abc123def0%7C99aa88bb77/'), { kind: 'id', id: 'abc123def0|99aa88bb77' });
  assert.deepEqual(parsePlayerQuery('https://overfast-api.tekrop.fr/players/abc123def0%7C99aa88bb77'), { kind: 'id', id: 'abc123def0|99aa88bb77' });
  assert.equal(parsePlayerQuery('   ').kind, 'empty');
  assert.equal(parsePlayerQuery('two words').kind, 'invalid');
  assert.equal(parsePlayerQuery('https://example.com/career/abc').kind, 'invalid');
  assert.equal(parsePlayerQuery('https://overwatch.blizzard.com/en-us/heroes/').kind, 'invalid');
});

await test('player ids are encoded exactly once and keys use every dimension', () => {
  assert.equal(normalizePlayerId('abc%7Cdef'), 'abc|def');
  assert.equal(requestPath({ endpoint: 'summary', playerId: 'abc|def' }), '/players/abc%7Cdef/summary');
  assert.equal(requestPath({ endpoint: 'stats-summary', playerId: 'a', mode: 'all', platform: 'all' }), '/players/a/stats/summary');
  assert.equal(requestPath({ endpoint: 'stats-summary', playerId: 'a', mode: 'competitive', platform: 'pc' }), '/players/a/stats/summary?gamemode=competitive&platform=pc');
  assert.equal(requestPath({ endpoint: 'career', playerId: 'a', mode: 'quickplay', platform: 'all' }), '/players/a/stats/career?gamemode=quickplay');
  assert.equal(requestPath({ endpoint: 'search', name: 'Gørn-1', limit: 20 }), '/players?name=G%C3%B8rn-1&limit=20');
  assert.notEqual(requestKey({ endpoint: 'stats-summary', playerId: 'a', mode: 'all', platform: 'pc' }), requestKey({ endpoint: 'stats-summary', playerId: 'a', mode: 'all', platform: 'console' }));
  assert.notEqual(requestKey({ endpoint: 'career', playerId: 'a', mode: 'quickplay', platform: 'all' }), requestKey({ endpoint: 'career', playerId: 'a', mode: 'competitive', platform: 'all' }));
});

// Provider
function response(body, { status = 200, headers = {} } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
const SUMMARY = { endpoint: 'summary', playerId: 'abc|def' };

await test('provider parses cache headers and maps OverFast errors', async () => {
  const urls = [];
  const provider = createOverfastProvider({
    baseUrl: 'https://api',
    now: () => 5000,
    fetchImpl: async (url) => {
      urls.push(url);
      return response({ ok: 1 }, { headers: { 'cache-control': 'public, max-age=600' } });
    },
  });
  const result = await provider.get(SUMMARY);
  assert.equal(urls[0], 'https://api/players/abc%7Cdef/summary');
  assert.equal(result.maxAgeSec, 600);
  assert.equal(result.fetchedAt, 5000);
  assert.equal(result.snapshotAt, 5000);

  const errorFor = async (res) => {
    const failing = createOverfastProvider({ baseUrl: 'https://api', fetchImpl: async () => res });
    return failing.get(SUMMARY).then(() => assert.fail('expected an error'), (error) => error);
  };
  const missing = await errorFor(response({ error: { error: 'Player not found', retry_after: 1800, next_check_at: 1, check_count: 2 } }, { status: 404 }));
  assert.equal(missing.kind, 'not-found');
  assert.equal(missing.message, 'Player not found');
  assert.equal(missing.retryAfterSec, 1800);
  const missingFlat = await errorFor(response({ error: 'Player not found', retry_after: 1559, next_check_at: 1, check_count: 2 }, { status: 404 }));
  assert.equal(missingFlat.kind, 'not-found');
  assert.equal(missingFlat.message, 'Player not found');
  assert.equal(missingFlat.retryAfterSec, 1559);
  const limited =await errorFor(response({ error: 'API rate limit reached, please wait for 1 second before retrying' }, { status: 429 }));
  assert.equal(limited.kind, 'rate-limited');
  assert.equal(limited.retryAfterSec, 1);
  const busy = await errorFor(response({ error: 'Blizzard is temporarily rate limiting this API. Please retry after 5 seconds.' }, { status: 503 }));
  assert.equal(busy.kind, 'busy');
  assert.equal(busy.retryAfterSec, 5);
  assert.equal((await errorFor(response({ error: 'x' }, { status: 504 }))).kind, 'timeout');
  assert.equal((await errorFor(response('<html>Bad gateway</html>', { status: 502 }))).kind, 'server');
  assert.equal((await errorFor(response('not json'))).kind, 'server');
});

await test('provider reads worker freshness headers and falls back when the worker is down', async () => {
  const worker = createOverfastProvider({
    baseUrl: 'https://worker',
    fallbackUrl: 'https://api',
    now: () => 900000,
    fetchImpl: async (url) => {
      assert.ok(url.includes('refresh=1'));
      return response({ ok: 1 }, { headers: { 'x-career-fetched-at': '800000', 'x-upstream-age': '100', 'x-career-cache': 'kv-fresh' } });
    },
  });
  const viaWorker = await worker.get(SUMMARY, { force: true });
  assert.equal(viaWorker.fetchedAt, 800000);
  assert.equal(viaWorker.snapshotAt, 700000);
  assert.equal(viaWorker.layer, 'kv-fresh');

  const urls = [];
  const fallback = createOverfastProvider({
    baseUrl: 'https://worker',
    fallbackUrl: 'https://api',
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.startsWith('https://worker')) throw new TypeError('Failed to fetch');
      return response({ ok: 1 });
    },
  });
  await fallback.get(SUMMARY, { force: true });
  assert.equal(urls[1], 'https://api/players/abc%7Cdef/summary', 'the direct call must not carry refresh=1');
});

// Store
function memoryStorage(limit = Infinity) {
  const map = new Map();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      const used = [...map.entries()].filter(([k]) => k !== key).reduce((sum, [, v]) => sum + v.length, 0);
      if (used + value.length > limit) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key) => map.delete(key),
  };
}

function fakeProvider(handler) {
  const calls = [];
  return {
    calls,
    label: 'test',
    viaWorker: false,
    get: async (request, options) => {
      calls.push({ request, options });
      return handler(request, options, calls.length);
    },
  };
}

const ok = (data, now, extra = {}) => ({ data, fetchedAt: now, snapshotAt: now, maxAgeSec: 600, noStore: false, layer: 'overfast', ...extra });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await settle();
};

await test('store fetches once, serves from cache, persists across sessions', async () => {
  let now = 1000;
  const storage = memoryStorage();
  const provider = fakeProvider(() => ok({ v: 1 }, now));
  const store = new CareerStore(provider, { storage, now: () => now });
  assert.equal(store.getEntry(SUMMARY).status, 'idle');
  store.ensure(SUMMARY);
  assert.equal(store.getEntry(SUMMARY).status, 'loading');
  await flush();
  assert.deepEqual(store.getEntry(SUMMARY).data, { v: 1 });
  store.ensure(SUMMARY);
  await flush();
  assert.equal(provider.calls.length, 1);

  const reopened = new CareerStore(provider, { storage, now: () => now });
  assert.deepEqual(reopened.getEntry(SUMMARY).data, { v: 1 }, 'cached data appears immediately');
  assert.equal(reopened.getEntry(SUMMARY).meta.fetchedAt, 1000, 'the original fetch time survives');
  reopened.ensure(SUMMARY);
  await flush();
  assert.equal(provider.calls.length, 1, 'still fresh, so no request');
});

await test('expired data stays visible while it revalidates', async () => {
  let now = 0;
  let version = 1;
  const provider = fakeProvider(() => ok({ v: version }, now));
  const store = new CareerStore(provider, { storage: memoryStorage(), now: () => now });
  store.ensure(SUMMARY);
  await flush();

  now = CAREER_TTL_MS + 1;
  version = 2;
  const seen = [];
  store.subscribe(SUMMARY, () => seen.push(store.getEntry(SUMMARY)));
  store.ensure(SUMMARY);
  await flush();
  assert.deepEqual(seen[0].data, { v: 1 }, 'old copy stays on screen');
  assert.equal(seen[0].revalidating, true);
  assert.deepEqual(store.getEntry(SUMMARY).data, { v: 2 });
  assert.equal(store.getEntry(SUMMARY).revalidating, false);
});

await test('a longer upstream max-age extends the cache, a shorter one does not', async () => {
  const now = 0;
  const long = new CareerStore(fakeProvider(() => ok({}, now, { maxAgeSec: 7200 })), { storage: memoryStorage(), now: () => now });
  long.ensure(SUMMARY);
  await flush();
  assert.equal(long.getEntry(SUMMARY).meta.expiresAt, 7200 * 1000);
  const short = new CareerStore(fakeProvider(() => ok({}, now, { maxAgeSec: 60 })), { storage: memoryStorage(), now: () => now });
  short.ensure(SUMMARY);
  await flush();
  assert.equal(short.getEntry(SUMMARY).meta.expiresAt, CAREER_TTL_MS);
});

await test('no-store responses are never written to disk', async () => {
  const storage = memoryStorage();
  const store = new CareerStore(fakeProvider(() => ok({ secret: 1 }, 0, { noStore: true })), { storage, now: () => 0 });
  store.ensure(SUMMARY);
  await flush();
  assert.deepEqual(store.getEntry(SUMMARY).data, { secret: 1 });
  assert.ok(![...storage.map.keys()].some((key) => key.includes('summary')));
});

await test('a failed refresh keeps the good copy and reports the error', async () => {
  let now = 0;
  let fail = false;
  const provider = fakeProvider(() => {
    if (fail) throw new CareerError('network', 'down');
    return ok({ v: 1 }, now);
  });
  const store = new CareerStore(provider, { storage: memoryStorage(), now: () => now });
  store.ensure(SUMMARY);
  await flush();
  now = CAREER_TTL_MS + 1;
  fail = true;
  store.ensure(SUMMARY);
  await flush();
  const entry = store.getEntry(SUMMARY);
  assert.deepEqual(entry.data, { v: 1 });
  assert.equal(entry.status, 'ready');
  assert.equal(entry.error.kind, 'network');
  assert.equal(entry.meta.fetchedAt, 0, 'an old copy is not presented as new');
});

await test('not-found removes the cached copy', async () => {
  let now = 0;
  let gone = false;
  const storage = memoryStorage();
  const provider = fakeProvider(() => {
    if (gone) throw new CareerError('not-found', 'Player not found');
    return ok({ v: 1 }, now);
  });
  const store = new CareerStore(provider, { storage, now: () => now });
  store.ensure(SUMMARY);
  await flush();
  now = CAREER_TTL_MS + 1;
  gone = true;
  store.ensure(SUMMARY);
  await flush();
  assert.equal(store.getEntry(SUMMARY).data, undefined);
  assert.equal(store.getEntry(SUMMARY).status, 'error');
  assert.ok(![...storage.map.keys()].some((key) => key.includes('summary|')));
});

await test('an empty response replaces earlier stats, so a newly private profile is honored', async () => {
  let now = 0;
  let body = { general: { games_played: 5 } };
  const request = { endpoint: 'stats-summary', playerId: 'a', mode: 'all', platform: 'all' };
  const store = new CareerStore(fakeProvider(() => ok(body, now)), { storage: memoryStorage(), now: () => now });
  store.ensure(request);
  await flush();
  now = CAREER_TTL_MS + 1;
  body = {};
  store.ensure(request);
  await flush();
  assert.deepEqual(store.getEntry(request).data, {});
});

await test('manual refresh has a cooldown and reports whether anything changed', async () => {
  let now = 0;
  let version = 1;
  const provider = fakeProvider(() => ok({ v: version }, now));
  const store = new CareerStore(provider, { storage: memoryStorage(), now: () => now });
  store.ensure(SUMMARY);
  await flush();

  const first = await store.refreshPlayer('abc|def', [SUMMARY]);
  assert.deepEqual(first, { kind: 'done', changed: false, error: undefined });
  assert.equal(provider.calls.at(-1).options.force, true);

  const blocked = await store.refreshPlayer('abc|def', [SUMMARY]);
  assert.equal(blocked.kind, 'cooldown');
  assert.equal(blocked.waitMs, REFRESH_COOLDOWN_MS);

  now = REFRESH_COOLDOWN_MS;
  version = 2;
  const second = await store.refreshPlayer('abc|def', [SUMMARY]);
  assert.equal(second.changed, true);
});

await test('rate limits retry once when short, and pause requests when long', async () => {
  let now = 0;
  const slept = [];
  let attempts = 0;
  const short = fakeProvider(() => {
    attempts += 1;
    if (attempts === 1) throw new CareerError('busy', 'wait', { retryAfterSec: 5 });
    return ok({ v: 1 }, now);
  });
  const retrying = new CareerStore(short, { storage: memoryStorage(), now: () => now, sleep: async (ms) => void slept.push(ms) });
  retrying.ensure(SUMMARY);
  await flush();
  assert.deepEqual(slept, [5000]);
  assert.deepEqual(retrying.getEntry(SUMMARY).data, { v: 1 });

  const long = fakeProvider(() => {
    throw new CareerError('rate-limited', 'wait', { retryAfterSec: 120 });
  });
  const pausing = new CareerStore(long, { storage: memoryStorage(), now: () => now });
  pausing.ensure(SUMMARY);
  await flush();
  assert.equal(long.calls.length, 1, 'no automatic retry for a long wait');
  assert.equal(pausing.getEntry(SUMMARY).error.kind, 'rate-limited');

  const other = { endpoint: 'summary', playerId: 'other' };
  pausing.ensure(other);
  await flush();
  assert.equal(long.calls.length, 1, 'other requests wait out the limit too');
  assert.equal(pausing.getEntry(other).error.retryAfterSec, 120);
  assert.equal(pausing.refreshWaitMs('any-player'), 120000, 'manual refresh respects the limit');
});

await test('requests are de-duplicated and limited to three at a time', async () => {
  let active = 0;
  let peak = 0;
  const provider = fakeProvider(async (request) => {
    active += 1;
    peak = Math.max(peak, active);
    await settle();
    active -= 1;
    return ok({ id: request.playerId }, 0);
  });
  const store = new CareerStore(provider, { storage: memoryStorage(), now: () => 0 });
  const requests = Array.from({ length: 8 }, (_, index) => ({ endpoint: 'summary', playerId: 'p' + index }));
  requests.forEach((request) => store.ensure(request));
  requests.forEach((request) => store.ensure(request));
  for (let i = 0; i < 30; i += 1) await settle();
  assert.equal(provider.calls.length, 8);
  assert.ok(peak <= 3, `peak ${peak}`);
  assert.equal(store.getEntry(requests[7]).status, 'ready');
});

await test('cache evicts the oldest entries when storage is full', async () => {
  let now = 0;
  const payload = 'x'.repeat(2000);
  const storage = memoryStorage(7000);
  const store = new CareerStore(fakeProvider((request) => ok({ payload, id: request.playerId }, now)), { storage, now: () => now });
  for (let i = 0; i < 6; i += 1) {
    now = i * 1000;
    store.ensure({ endpoint: 'summary', playerId: 'p' + i });
    await flush();
  }
  const reopened = new CareerStore(fakeProvider(() => ok({}, now)), { storage, now: () => now });
  assert.equal(reopened.getEntry({ endpoint: 'summary', playerId: 'p5' }).status, 'ready', 'newest survives');
  assert.equal(reopened.getEntry({ endpoint: 'summary', playerId: 'p0' }).status, 'idle', 'oldest was evicted');
});

await test('entries past the retention window are dropped', async () => {
  let now = 0;
  const storage = memoryStorage();
  const store = new CareerStore(fakeProvider(() => ok({ v: 1 }, now)), { storage, now: () => now });
  store.ensure(SUMMARY);
  await flush();
  now = RETENTION_MS + 1;
  const reopened = new CareerStore(fakeProvider(() => ok({}, now)), { storage, now: () => now });
  assert.equal(reopened.getEntry(SUMMARY).status, 'idle');
});

await test('corrupt or unavailable storage never breaks the store', async () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  const store = new CareerStore(fakeProvider(() => ok({ v: 1 }, 0)), { storage: broken, now: () => 0 });
  store.ensure(SUMMARY);
  await flush();
  assert.deepEqual(store.getEntry(SUMMARY).data, { v: 1 });

  const garbled = memoryStorage();
  garbled.map.set('ow2.career.v1|summary|abc|def', '{not json');
  garbled.map.set('ow2.career.v1.index', 'also not json');
  const recovered = new CareerStore(fakeProvider(() => ok({ v: 2 }, 0)), { storage: garbled, now: () => 0 });
  assert.equal(recovered.getEntry(SUMMARY).status, 'idle');
});

rmSync(outdir, { recursive: true, force: true });

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((failure) => console.error('FAIL ' + failure));
  process.exit(1);
}
