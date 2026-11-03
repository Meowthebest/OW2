// Cloudflare Worker: GitHub Pages -> this Worker -> KV cache -> OverFast API -> public Blizzard profiles.
// It holds no secrets and adds no data. It only caches public responses so repeat views cost no upstream calls.

const UPSTREAM = 'https://overfast-api.tekrop.fr';
const USER_AGENT = 'OW2-Hero-Selector-Worker (+https://github.com/Meowthebest/OW2)';

const FRESH_SECONDS = 60 * 60;
const EMPTY_FRESH_SECONDS = 10 * 60;
const RETENTION_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_COOLDOWN_SECONDS = 60;
const SEARCH_EDGE_SECONDS = 10 * 60;

const EXPOSED_HEADERS = 'X-Career-Cache, X-Career-Fetched-At, X-Upstream-Age, X-Upstream-Cache, Retry-After';

const PLAYER_ID = /^[^/?#\s]{2,120}$/;
const SEARCH_NAME = /^[^/?#\s]{2,64}$/;
const GAME_MODES = new Set(['quickplay', 'competitive']);
const PLATFORMS = new Set(['pc', 'console']);

/** Maps an incoming URL to an allowlisted upstream request. Anything else is rejected. */
export function resolveRoute(url) {
  const search = url.pathname === '/players';
  if (search) {
    const name = url.searchParams.get('name') ?? '';
    if (!SEARCH_NAME.test(name)) return null;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    return { kind: 'search', upstream: `/players?name=${encodeURIComponent(name)}&limit=${limit}` };
  }

  const match = /^\/players\/([^/]+)\/(summary|stats\/summary|stats\/career)$/.exec(url.pathname);
  if (!match) return null;

  let playerId;
  try {
    playerId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!PLAYER_ID.test(playerId)) return null;

  const endpoint = match[2];
  const gamemode = url.searchParams.get('gamemode') ?? '';
  const platform = url.searchParams.get('platform') ?? '';
  if (gamemode && !GAME_MODES.has(gamemode)) return null;
  if (platform && !PLATFORMS.has(platform)) return null;
  if (endpoint === 'stats/career' && !gamemode) return null;

  const query = new URLSearchParams();
  if (endpoint !== 'summary') {
    if (gamemode) query.set('gamemode', gamemode);
    if (platform) query.set('platform', platform);
  }
  const suffix = query.toString() ? `?${query}` : '';
  const dimensions = endpoint === 'summary' ? '' : `:${gamemode || 'all'}:${platform || 'all'}`;

  return {
    kind: 'career',
    upstream: `/players/${encodeURIComponent(playerId)}/${endpoint}${suffix}`,
    key: `v1:${endpoint}:${playerId}${dimensions}`,
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function parseMaxAge(header) {
  const match = header ? /max-age=(\d+)/i.exec(header) : null;
  return match ? Number(match[1]) : 0;
}

function isEmptyPayload(body) {
  return body === '{}' || /^\{\s*\}$/.test(body);
}

async function fetchUpstream(route, fetchImpl) {
  const response = await fetchImpl(UPSTREAM + route.upstream, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  const body = await response.text();
  const cacheControl = response.headers.get('cache-control');
  return {
    status: response.status,
    body,
    retryAfter: response.headers.get('retry-after'),
    upstreamAge: Number(response.headers.get('age')) || 0,
    upstreamCache: response.headers.get('x-cache-status') ?? '',
    maxAge: parseMaxAge(cacheControl),
    noStore: /no-store/i.test(cacheControl ?? ''),
  };
}

function freshSeconds(upstream) {
  if (isEmptyPayload(upstream.body)) return EMPTY_FRESH_SECONDS;
  return Math.max(FRESH_SECONDS, upstream.maxAge);
}

async function writeRecord(env, route, upstream, now) {
  const record = {
    body: upstream.body,
    fetchedAt: now,
    freshUntil: now + freshSeconds(upstream) * 1000,
    upstreamAge: upstream.upstreamAge,
    upstreamCache: upstream.upstreamCache,
  };
  // KV write quotas can run out on the free plan. The response still goes out, it just is not cached.
  try {
    await env.CAREER_CACHE.put(route.key, JSON.stringify(record), { expirationTtl: RETENTION_SECONDS });
  } catch (error) {
    console.warn('KV write failed', error?.message);
  }
  return record;
}

function serveRecord(record, layer, headers, extra = {}) {
  return json(record.body, 200, {
    ...headers,
    'Cache-Control': 'public, max-age=60',
    'X-Career-Cache': layer,
    'X-Career-Fetched-At': String(record.fetchedAt),
    'X-Upstream-Age': String(record.upstreamAge ?? 0),
    'X-Upstream-Cache': record.upstreamCache ?? '',
    ...extra,
  });
}

function passThroughError(upstream, headers) {
  const extra = upstream.retryAfter ? { 'Retry-After': upstream.retryAfter } : {};
  return json(upstream.body || '{"error":"Upstream error"}', upstream.status, { ...headers, 'Cache-Control': 'no-store', 'X-Career-Cache': 'bypass', ...extra });
}

/**
 * Refreshes one KV entry from OverFast. A 404 deletes the entry, and an empty payload replaces
 * it, so a profile that was removed or made private stops being served from this cache.
 */
async function revalidate(route, env, fetchImpl, now) {
  const upstream = await fetchUpstream(route, fetchImpl);
  if (upstream.status === 200 && !upstream.noStore) {
    return { upstream, record: await writeRecord(env, route, upstream, now) };
  }
  if (upstream.status === 404 || upstream.noStore) {
    await env.CAREER_CACHE.delete(route.key).catch(() => undefined);
  }
  return { upstream, record: null };
}

async function handleCareer(route, url, env, ctx, headers, fetchImpl, now) {
  const record = await env.CAREER_CACHE.get(route.key, { type: 'json' }).catch(() => null);
  const wantsRefresh = url.searchParams.get('refresh') === '1';

  if (wantsRefresh && record) {
    const waitSeconds = Math.ceil((record.fetchedAt + REFRESH_COOLDOWN_SECONDS * 1000 - now) / 1000);
    if (waitSeconds > 0) return serveRecord(record, 'refresh-throttled', headers, { 'Retry-After': String(waitSeconds) });
  }

  if (record && !wantsRefresh) {
    if (now < record.freshUntil) return serveRecord(record, 'kv-fresh', headers);
    // Stale: answer immediately and update KV in the background.
    ctx.waitUntil(revalidate(route, env, fetchImpl, now).catch((error) => console.warn('Revalidate failed', error?.message)));
    return serveRecord(record, 'kv-stale', headers);
  }

  let result;
  try {
    result = await revalidate(route, env, fetchImpl, now);
  } catch {
    if (record) return serveRecord(record, 'kv-stale-if-error', headers);
    return json({ error: 'Could not reach OverFast API' }, 502, { ...headers, 'Cache-Control': 'no-store', 'X-Career-Cache': 'bypass' });
  }

  const { upstream } = result;
  if (result.record) return serveRecord(result.record, wantsRefresh ? 'refreshed' : 'origin', headers);
  if (upstream.status === 200) {
    // OverFast marked this response no-store, so it is passed along and never kept.
    return json(upstream.body, 200, { ...headers, 'Cache-Control': 'no-store', 'X-Career-Cache': 'bypass', 'X-Career-Fetched-At': String(now), 'X-Upstream-Age': String(upstream.upstreamAge) });
  }
  // A busy or failing upstream should not take down a page we can still answer. 404 means the profile is gone, so it never gets this.
  if (record && upstream.status !== 404) return serveRecord(record, 'kv-stale-if-error', headers);
  return passThroughError(upstream, headers);
}

/** Search results vary too much to spend KV writes on, so they use the edge cache only. */
async function handleSearch(route, request, env, ctx, headers, fetchImpl, now) {
  const edge = globalThis.caches?.default;
  const cacheKey = new Request(new URL(route.upstream, request.url).toString());
  const hit = await edge?.match(cacheKey).catch(() => undefined);
  if (hit) {
    const response = new Response(hit.body, hit);
    Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
    response.headers.set('X-Career-Cache', 'edge');
    return response;
  }

  let upstream;
  try {
    upstream = await fetchUpstream(route, fetchImpl);
  } catch {
    return json({ error: 'Could not reach OverFast API' }, 502, { ...headers, 'Cache-Control': 'no-store', 'X-Career-Cache': 'bypass' });
  }
  if (upstream.status !== 200) return passThroughError(upstream, headers);

  const maxAge = upstream.noStore ? 0 : Math.max(SEARCH_EDGE_SECONDS, upstream.maxAge);
  const shared = {
    'Cache-Control': upstream.noStore ? 'no-store' : `public, max-age=${maxAge}`,
    'X-Career-Fetched-At': String(now),
    'X-Upstream-Age': String(upstream.upstreamAge),
    'X-Upstream-Cache': upstream.upstreamCache,
  };
  if (edge && !upstream.noStore) {
    ctx.waitUntil(edge.put(cacheKey, json(upstream.body, 200, shared)).catch(() => undefined));
  }
  return json(upstream.body, 200, { ...headers, ...shared, 'X-Career-Cache': 'origin' });
}

export async function handleRequest(request, env, ctx, fetchImpl = fetch, now = Date.now()) {
  const url = new URL(request.url);
  const headers = corsHeaders(request, env);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405, headers);

  if (url.pathname === '/') {
    return json({ service: 'OW2 career cache', upstream: UPSTREAM, freshSeconds: FRESH_SECONDS }, 200, headers);
  }

  const route = resolveRoute(url);
  if (!route) return json({ error: 'Unsupported request' }, 400, headers);

  return route.kind === 'search'
    ? handleSearch(route, request, env, ctx, headers, fetchImpl, now)
    : handleCareer(route, url, env, ctx, headers, fetchImpl, now);
}

export default {
  fetch: (request, env, ctx) => handleRequest(request, env, ctx),
};
