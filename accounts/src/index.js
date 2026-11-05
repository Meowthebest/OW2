// Cloudflare Worker: optional accounts for this site's personal tracking.
// Sign-in is through Discord, so this service never sees or stores a password. It stores a display name, an
// avatar reference and the marks a person makes. It knows nothing about what they own in the game.
//
// GitHub Pages -> this Worker -> D1. Session tokens travel in an Authorization header, never in a URL or cookie.

const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const DISCORD_ME = 'https://discord.com/api/users/@me';
const USER_AGENT = 'OW2-Accounts (+https://github.com/Meowthebest/OW2)';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const SESSION_MS = 90 * DAY;
const STATE_MS = 10 * MINUTE;
const CODE_MS = 2 * MINUTE;

const MAX_BATCH = 500;
const MAX_ENTRIES = 60000;
const MAX_BODY_BYTES = 256 * 1024;
const PAGE_SIZE = 2000;
const CLOCK_ALLOWANCE_MS = 5 * MINUTE;
/** A read overlaps this much, in case another device's write finished after a later one. Merging twice does no harm. */
const CURSOR_OVERLAP = 10 * 1000 * 1000;

const LIMITS = {
  auth: { count: 20, windowMs: MINUTE },
  read: { count: 120, windowMs: MINUTE },
  write: { count: 120, windowMs: MINUTE },
};

const KEY_PATTERN = /^(owned|wishlist|favorite|notify|tier|mythic|drop):[^\s]{1,200}$/;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

const failure = (code, status, headers, extra = {}) => json({ error: code }, status, { ...headers, ...extra });

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function base64Url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const randomToken = (size = 32) => base64Url(crypto.getRandomValues(new Uint8Array(size)));

async function sha256(text) {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

/** Counts a request. The window is fixed, which is enough to stop abuse without storing every request. */
async function overLimit(env, kind, who, now) {
  const limit = LIMITS[kind];
  const bucket = `${kind}:${who}`;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT (bucket) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= ?3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
  )
    .bind(bucket, now + limit.windowMs, now)
    .first();
  if (row.count <= limit.count) return null;
  return Math.max(1, Math.ceil((row.reset_at - now) / 1000));
}

const clientAddress = (request) => request.headers.get('cf-connecting-ip') ?? 'unknown';

/** The return address must be on the site itself, so a sign-in can't be sent anywhere else. */
function validReturn(value, env) {
  try {
    const url = new URL(value);
    return allowedOrigins(env).includes(url.origin) ? url : null;
  } catch {
    return null;
  }
}

async function startLogin(url, env, headers, now) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.CALLBACK_URL) return failure('not_configured', 503, headers);
  const back = validReturn(url.searchParams.get('return') ?? '', env);
  if (!back) return failure('bad_return_url', 400, headers);

  const state = randomToken();
  const verifier = randomToken(48);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_states WHERE created_at < ?1').bind(now - STATE_MS),
    env.DB.prepare('INSERT INTO login_states (state, verifier, return_to, created_at) VALUES (?1, ?2, ?3, ?4)').bind(state, verifier, back.href, now),
  ]);

  const target = new URL(DISCORD_AUTHORIZE);
  target.search = new URLSearchParams({ response_type: 'code', client_id: env.DISCORD_CLIENT_ID, scope: 'identify', state, redirect_uri: env.CALLBACK_URL, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'none' }).toString();
  return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store' } });
}

function backToSite(returnTo, params) {
  const target = new URL(returnTo);
  // The site's routes live in the hash, so the code goes on the route's query.
  target.hash = `#/collection?${new URLSearchParams(params)}`;
  return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

async function finishLogin(url, env, fetchImpl, now) {
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const stored = state ? await env.DB.prepare('DELETE FROM login_states WHERE state = ?1 RETURNING verifier, return_to, created_at').bind(state).first() : null;
  if (!stored || stored.created_at < now - STATE_MS) return json({ error: 'expired_login' }, 400);
  if (!code) return backToSite(stored.return_to, { login_error: 'denied' });

  try {
    const tokenResponse = await fetchImpl(DISCORD_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.CALLBACK_URL, client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, code_verifier: stored.verifier }),
    });
    if (!tokenResponse.ok) return backToSite(stored.return_to, { login_error: 'token' });
    const { access_token: accessToken } = await tokenResponse.json();
    const meResponse = await fetchImpl(DISCORD_ME, { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT } });
    if (!meResponse.ok) return backToSite(stored.return_to, { login_error: 'profile' });
    const me = await meResponse.json();
    if (typeof me.id !== 'string' || !/^\d{5,30}$/.test(me.id)) return backToSite(stored.return_to, { login_error: 'profile' });

    const name = String(me.global_name || me.username || 'Player').slice(0, 64);
    const avatar = typeof me.avatar === 'string' && /^[a-z0-9_]{1,64}$/i.test(me.avatar) ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null;
    const user = await env.DB.prepare(
      `INSERT INTO users (id, provider, provider_id, name, avatar, created_at) VALUES (?1, 'discord', ?2, ?3, ?4, ?5)
       ON CONFLICT (provider, provider_id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar
       RETURNING id`,
    )
      .bind(randomToken(16), me.id, name, avatar, now)
      .first();

    const oneTime = randomToken();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM login_codes WHERE expires_at < ?1').bind(now),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
      env.DB.prepare('INSERT INTO login_codes (code_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(await sha256(oneTime), user.id, now + CODE_MS),
    ]);
    return backToSite(stored.return_to, { login: oneTime });
  } catch {
    return backToSite(stored.return_to, { login_error: 'network' });
  }
}

async function readBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function exchangeCode(request, env, headers, now) {
  const body = await readBody(request);
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!code) return failure('bad_request', 400, headers);
  const stored = await env.DB.prepare('DELETE FROM login_codes WHERE code_hash = ?1 RETURNING user_id, expires_at').bind(await sha256(code)).first();
  if (!stored || stored.expires_at < now) return failure('expired_login', 400, headers);
  const user = await env.DB.prepare('SELECT name, avatar FROM users WHERE id = ?1').bind(stored.user_id).first();
  if (!user) return failure('expired_login', 400, headers);
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(await sha256(token), stored.user_id, now, now + SESSION_MS).run();
  return json({ token, user: { name: user.name, avatar: user.avatar } }, 200, headers);
}

async function currentUser(request, env, now) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header);
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  const row = await env.DB.prepare(
    `SELECT users.id AS id, users.name AS name, users.avatar AS avatar, sessions.expires_at AS expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?1`,
  )
    .bind(tokenHash)
    .first();
  if (!row || row.expires_at < now) return null;
  return { id: row.id, name: row.name, avatar: row.avatar, tokenHash };
}

async function readEntries(url, env, user, headers) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const from = since > 0 ? Math.max(0, since - CURSOR_OVERLAP) : 0;
  const { results } = await env.DB.prepare('SELECT key, value, changed_at, seq FROM entries WHERE user_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3').bind(user.id, from, PAGE_SIZE + 1).all();
  const page = results.slice(0, PAGE_SIZE);
  const entries = {};
  for (const row of page) entries[row.key] = [row.value, row.changed_at];
  return json({ entries, cursor: page.length > 0 ? page[page.length - 1].seq : since, more: results.length > PAGE_SIZE }, 200, headers);
}

async function writeEntries(request, env, user, headers, now) {
  const body = await readBody(request);
  const changes = body?.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return failure('bad_request', 400, headers);
  const list = Object.entries(changes);
  if (list.length > MAX_BATCH) return failure('too_many_changes', 413, headers);
  for (const [key, entry] of list) {
    if (!KEY_PATTERN.test(key) || !Array.isArray(entry) || entry.length !== 2 || (entry[0] !== 0 && entry[0] !== 1) || !Number.isFinite(entry[1]) || entry[1] < 0) return failure('bad_entry', 400, headers);
  }
  if (list.length === 0) return json({ accepted: 0 }, 200, headers);

  // Single marks are cheap. Only a large import needs the row count checked first.
  if (list.length > 50) {
    const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM entries WHERE user_id = ?1').bind(user.id).first();
    if (row.total + list.length > MAX_ENTRIES) return failure('collection_full', 413, headers);
  }

  // A device with a clock far ahead must not win every merge from now on.
  const latest = now + CLOCK_ALLOWANCE_MS;
  const base = now * 1000;
  const statement = env.DB.prepare(
    `INSERT INTO entries (user_id, key, value, changed_at, seq) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, changed_at = excluded.changed_at, seq = excluded.seq
     WHERE excluded.changed_at > entries.changed_at OR (excluded.changed_at = entries.changed_at AND excluded.value > entries.value)`,
  );
  await env.DB.batch(list.map(([key, entry], index) => statement.bind(user.id, key, entry[0], Math.min(entry[1], latest), base + index)));
  return json({ accepted: list.length }, 200, headers);
}

export async function handleRequest(request, env, fetchImpl = fetch, now = Date.now()) {
  const url = new URL(request.url);
  const headers = corsHeaders(request, env);
  const { pathname } = url;
  const { method } = request;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers });

  try {
    if (pathname === '/') return json({ service: 'OW2 accounts' }, 200, headers);

    if (pathname.startsWith('/auth/')) {
      const wait = await overLimit(env, 'auth', clientAddress(request), now);
      if (wait) return failure('rate_limited', 429, headers, { 'Retry-After': String(wait) });
      if (pathname === '/auth/discord/start' && method === 'GET') return await startLogin(url, env, headers, now);
      if (pathname === '/auth/discord/callback' && method === 'GET') return await finishLogin(url, env, fetchImpl, now);
      if (pathname === '/auth/exchange' && method === 'POST') return await exchangeCode(request, env, headers, now);
    }

    const needsUser = pathname === '/me' || pathname === '/auth/logout' || pathname === '/collection' || pathname === '/collection/changes';
    if (!needsUser) return failure('not_found', 404, headers);

    const user = await currentUser(request, env, now);
    if (!user) return failure('signed_out', 401, headers);

    if (pathname === '/auth/logout' && method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(user.tokenHash).run();
      return json({ ok: true }, 200, headers);
    }
    if (pathname === '/me' && method === 'GET') return json({ user: { name: user.name, avatar: user.avatar } }, 200, headers);
    if (pathname === '/me' && method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM entries WHERE user_id = ?1').bind(user.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(user.id),
        env.DB.prepare('DELETE FROM login_codes WHERE user_id = ?1').bind(user.id),
        env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(user.id),
      ]);
      return json({ ok: true }, 200, headers);
    }
    if (pathname === '/collection' && method === 'GET') {
      const wait = await overLimit(env, 'read', user.id, now);
      if (wait) return failure('rate_limited', 429, headers, { 'Retry-After': String(wait) });
      return await readEntries(url, env, user, headers);
    }
    if (pathname === '/collection/changes' && method === 'POST') {
      const wait = await overLimit(env, 'write', user.id, now);
      if (wait) return failure('rate_limited', 429, headers, { 'Retry-After': String(wait) });
      return await writeEntries(request, env, user, headers, now);
    }
    return failure('method_not_allowed', 405, headers);
  } catch (error) {
    console.error('Request failed', error?.message);
    return failure('server_error', 500, headers);
  }
}

export default {
  fetch: (request, env) => handleRequest(request, env),
};
