import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest, resolveRoute } from '../src/index.js';

const ORIGIN = 'https://meowthebest.github.io';
const HOUR = 3600 * 1000;

function fakeKv() {
  const map = new Map();
  return {
    map,
    writes: 0,
    async get(key) {
      const value = map.get(key);
      return value ? JSON.parse(value) : null;
    },
    async put(key, value, options) {
      assert.ok(options.expirationTtl >= 60, 'KV requires an expirationTtl of at least 60 seconds');
      this.writes += 1;
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

function setup() {
  const pending = [];
  return {
    env: { CAREER_CACHE: fakeKv(), ALLOWED_ORIGINS: `${ORIGIN},http://localhost:4173` },
    ctx: { waitUntil: (promise) => pending.push(promise) },
    flush: () => Promise.all(pending),
  };
}

function upstream(body, { status = 200, headers = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(typeof body === 'function' ? body() : body, {
      status,
      headers: { 'cache-control': 'public, max-age=600', age: '120', 'x-cache-status': 'hit', ...headers },
    });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const request = (path, init = {}) => new Request('https://worker.example' + path, { headers: { origin: ORIGIN }, ...init });
const SUMMARY = '/players/abc%7Cdef/summary';

test('routing allowlists endpoints, modes and platforms', () => {
  const route = (path) => resolveRoute(new URL('https://w' + path));
  assert.equal(route(SUMMARY).key, 'v1:summary:abc|def');
  assert.equal(route(SUMMARY).upstream, '/players/abc%7Cdef/summary');
  assert.equal(route('/players/abc/stats/summary?gamemode=competitive&platform=pc').key, 'v1:stats/summary:abc:competitive:pc');
  assert.equal(route('/players/abc/stats/career?gamemode=quickplay').key, 'v1:stats/career:abc:quickplay:all');
  assert.equal(route('/players/abc/stats/career'), null, 'career requires a game mode');
  assert.equal(route('/players/abc/stats/summary?gamemode=arcade'), null);
  assert.equal(route('/players/abc/stats/summary?platform=xbox'), null);
  assert.equal(route('/heroes'), null);
  assert.equal(route('/players/abc/../../admin'), null);
  assert.equal(route('/players?name=a/b'), null);
  assert.equal(route('/players?name=TeKrop-2217').kind, 'search');
});

test('a miss fetches upstream once, then repeat views come from KV', async () => {
  const { env, ctx } = setup();
  const fetchImpl = upstream('{"username":"A"}');
  const first = await handleRequest(request(SUMMARY), env, ctx, fetchImpl, 1000);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-career-cache'), 'origin');
  assert.equal(first.headers.get('x-upstream-age'), '120');
  assert.equal(first.headers.get('x-career-fetched-at'), '1000');

  const second = await handleRequest(request(SUMMARY), env, ctx, fetchImpl, 1000 + HOUR / 2);
  assert.equal(second.headers.get('x-career-cache'), 'kv-fresh');
  assert.equal(await second.text(), '{"username":"A"}');
  assert.equal(fetchImpl.calls.length, 1);
});

test('an expired entry is served at once and refreshed in the background', async () => {
  const { env, ctx, flush } = setup();
  await handleRequest(request(SUMMARY), env, ctx, upstream('{"v":1}'), 0);
  const fetchImpl = upstream('{"v":2}');
  const stale = await handleRequest(request(SUMMARY), env, ctx, fetchImpl, HOUR + 1);
  assert.equal(stale.headers.get('x-career-cache'), 'kv-stale');
  assert.equal(await stale.text(), '{"v":1}');
  await flush();
  assert.equal(fetchImpl.calls.length, 1);
  const fresh = await handleRequest(request(SUMMARY), env, ctx, fetchImpl, HOUR + 2);
  assert.equal(fresh.headers.get('x-career-cache'), 'kv-fresh');
  assert.equal(await fresh.text(), '{"v":2}');
});

test('manual refresh is limited to once a minute per cache entry', async () => {
  const { env, ctx } = setup();
  await handleRequest(request(SUMMARY), env, ctx, upstream('{"v":1}'), 0);
  const fetchImpl = upstream('{"v":2}');
  const throttled = await handleRequest(request(SUMMARY + '?refresh=1'), env, ctx, fetchImpl, 10000);
  assert.equal(throttled.headers.get('x-career-cache'), 'refresh-throttled');
  assert.equal(throttled.headers.get('retry-after'), '50');
  assert.equal(fetchImpl.calls.length, 0);

  const refreshed = await handleRequest(request(SUMMARY + '?refresh=1'), env, ctx, fetchImpl, 61000);
  assert.equal(refreshed.headers.get('x-career-cache'), 'refreshed');
  assert.equal(await refreshed.text(), '{"v":2}');
});

test('stale data covers upstream failures and says so', async () => {
  const { env, ctx } = setup();
  await handleRequest(request(SUMMARY), env, ctx, upstream('{"v":1}'), 0);
  const busy = upstream('{"error":"Blizzard is limiting"}', { status: 503, headers: { 'retry-after': '5' } });
  const response = await handleRequest(request(SUMMARY + '?refresh=1'), env, ctx, busy, HOUR * 2);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-career-cache'), 'kv-stale-if-error');
  assert.equal(response.headers.get('x-career-fetched-at'), '0', 'the original fetch time is preserved');
});

test('upstream errors without a cached copy pass through with Retry-After', async () => {
  const { env, ctx } = setup();
  const busy = upstream('{"error":"slow down"}', { status: 429, headers: { 'retry-after': '3' } });
  const response = await handleRequest(request(SUMMARY), env, ctx, busy, 0);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '3');
  assert.equal(env.CAREER_CACHE.map.size, 0, 'errors are never cached');
});

test('a removed profile is deleted from the cache', async () => {
  const { env, ctx } = setup();
  await handleRequest(request(SUMMARY), env, ctx, upstream('{"v":1}'), 0);
  const gone = upstream('{"error":{"error":"Player not found","retry_after":600}}', { status: 404 });
  const response = await handleRequest(request(SUMMARY + '?refresh=1'), env, ctx, gone, HOUR * 2);
  assert.equal(response.status, 404);
  assert.equal(env.CAREER_CACHE.map.size, 0);
});

test('a profile that turned private replaces the old stats and re-checks sooner', async () => {
  const { env, ctx, flush } = setup();
  const stats = '/players/abc/stats/summary';
  await handleRequest(request(stats), env, ctx, upstream('{"general":{"games_played":5}}'), 0);
  await handleRequest(request(stats), env, ctx, upstream('{}'), HOUR + 1);
  await flush();
  const after = await handleRequest(request(stats), env, ctx, upstream('{}'), HOUR + 2);
  assert.equal(await after.text(), '{}');
  const record = await env.CAREER_CACHE.get('v1:stats/summary:abc:all:all');
  assert.equal(record.freshUntil, HOUR + 1 + 10 * 60 * 1000);
});

test('no-store responses are passed along but never kept', async () => {
  const { env, ctx } = setup();
  const response = await handleRequest(request(SUMMARY), env, ctx, upstream('{"v":1}', { headers: { 'cache-control': 'no-store' } }), 0);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-career-cache'), 'bypass');
  assert.equal(env.CAREER_CACHE.map.size, 0);
});

test('a failed KV write does not break the response', async () => {
  const { env, ctx } = setup();
  env.CAREER_CACHE.put = async () => {
    throw new Error('KV put() limit exceeded for the day');
  };
  const response = await handleRequest(request(SUMMARY), env, ctx, upstream('{"v":1}'), 0);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"v":1}');
});

test('longer upstream cache lifetimes are respected', async () => {
  const { env, ctx } = setup();
  await handleRequest(request(SUMMARY), env, ctx, upstream('{"v":1}', { headers: { 'cache-control': 'public, max-age=7200' } }), 0);
  const record = await env.CAREER_CACHE.get('v1:summary:abc|def');
  assert.equal(record.freshUntil, 7200 * 1000);
});

test('CORS is limited to configured origins and exposes the freshness headers', async () => {
  const { env, ctx } = setup();
  const allowed = await handleRequest(request(SUMMARY, { method: 'OPTIONS' }), env, ctx, upstream('{}'), 0);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(allowed.headers.get('access-control-expose-headers'), /X-Upstream-Age/);

  const denied = await handleRequest(new Request('https://w' + SUMMARY, { headers: { origin: 'https://evil.example' } }), env, ctx, upstream('{}'), 0);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('rejects unsupported methods and paths without calling upstream', async () => {
  const { env, ctx } = setup();
  const fetchImpl = upstream('{}');
  assert.equal((await handleRequest(request(SUMMARY, { method: 'POST' }), env, ctx, fetchImpl, 0)).status, 405);
  assert.equal((await handleRequest(request('/heroes'), env, ctx, fetchImpl, 0)).status, 400);
  assert.equal(fetchImpl.calls.length, 0);
});

test('search skips KV to save the write quota', async () => {
  const { env, ctx } = setup();
  const fetchImpl = upstream('{"total":0,"results":[]}');
  const response = await handleRequest(request('/players?name=TeKrop'), env, ctx, fetchImpl, 0);
  assert.equal(response.status, 200);
  assert.equal(fetchImpl.calls[0], 'https://overfast-api.tekrop.fr/players?name=TeKrop&limit=20');
  assert.equal(env.CAREER_CACHE.writes, 0);
});
