// Tests the accounts Worker against a real SQLite database with the real migration. Discord is faked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleRequest } from '../src/index.js';

const SITE = 'https://meowthebest.github.io';
const WORKER = 'https://accounts.example.test';
const T0 = 1800000000000;

/** The parts of D1's API that the Worker uses, on top of Node's SQLite. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => sqlite.prepare(sql).run(...values),
    runNow: () => sqlite.prepare(sql).run(...values),
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    batch: async (list) => {
      sqlite.exec('BEGIN');
      try {
        list.forEach((item) => item.runNow());
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
      return [];
    },
  };
}

function setup() {
  const db = fakeD1();
  const env = { DB: db, ALLOWED_ORIGINS: SITE, DISCORD_CLIENT_ID: 'client-id', DISCORD_CLIENT_SECRET: 'client-secret', CALLBACK_URL: `${WORKER}/auth/discord/callback` };
  const discord = { user: { id: '1234567890', username: 'player', global_name: 'Player One', avatar: 'abc123' }, tokenCalls: [], fail: false };
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/oauth2/token')) {
      discord.tokenCalls.push(Object.fromEntries(new URLSearchParams(init.body)));
      return new Response(JSON.stringify(discord.fail ? { error: 'invalid_grant' } : { access_token: 'discord-access' }), { status: discord.fail ? 400 : 200 });
    }
    if (String(url).includes('/users/@me')) return new Response(JSON.stringify(discord.user), { status: 200 });
    throw new Error(`Unexpected request to ${url}`);
  };
  const call = (path, { method = 'GET', token, body, origin = SITE, now = T0, ip = '203.0.113.9' } = {}) => {
    const headers = { origin, 'cf-connecting-ip': ip };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    return handleRequest(new Request(`${WORKER}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, fetchImpl, now);
  };
  const signIn = async (now = T0) => {
    const start = await call(`/auth/discord/start?return=${encodeURIComponent(`${SITE}/OW2/#/collection`)}`, { now });
    const location = new URL(start.headers.get('location'));
    const back = await call(`/auth/discord/callback?code=abc&state=${location.searchParams.get('state')}`, { now });
    const code = new URLSearchParams(new URL(back.headers.get('location')).hash.split('?')[1]).get('login');
    const exchanged = await call('/auth/exchange', { method: 'POST', body: { code }, now });
    return { ...(await exchanged.json()), code, location, back };
  };
  return { db, env, discord, call, signIn };
}

test('signing in uses PKCE and a state check, and never puts the session token in a URL', async () => {
  const { call, signIn, discord } = setup();
  const result = await signIn();
  assert.equal(result.location.origin + result.location.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(result.location.searchParams.get('scope'), 'identify');
  assert.equal(result.location.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(discord.tokenCalls[0].code_verifier.length > 40);
  assert.ok(result.token.length > 30);
  assert.ok(!result.back.headers.get('location').includes(result.token));
  assert.equal(result.user.name, 'Player One');
  const me = await call('/me', { token: result.token });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.name, 'Player One');
});

test('a sign-in can only return to the site itself', async () => {
  const { call } = setup();
  const response = await call(`/auth/discord/start?return=${encodeURIComponent('https://evil.example/steal')}`);
  assert.equal(response.status, 400);
});

test('a state or one-time code works only once', async () => {
  const { call, signIn } = setup();
  const { location, code } = await signIn();
  const again = await call(`/auth/discord/callback?code=abc&state=${location.searchParams.get('state')}`);
  assert.equal(again.status, 400);
  const replay = await call('/auth/exchange', { method: 'POST', body: { code } });
  assert.equal(replay.status, 400);
  const madeUp = await call('/auth/discord/callback?code=abc&state=made-up');
  assert.equal(madeUp.status, 400);
});

test('old states and one-time codes expire', async () => {
  const { call } = setup();
  const start = await call(`/auth/discord/start?return=${encodeURIComponent(`${SITE}/OW2/`)}`);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const late = await call(`/auth/discord/callback?code=abc&state=${state}`, { now: T0 + 11 * 60 * 1000 });
  assert.equal(late.status, 400);
});

test('a refused Discord login goes back to the site with an error and no session', async () => {
  const { call, discord } = setup();
  discord.fail = true;
  const start = await call(`/auth/discord/start?return=${encodeURIComponent(`${SITE}/OW2/`)}`);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const back = await call(`/auth/discord/callback?code=bad&state=${state}`);
  assert.equal(back.status, 302);
  assert.match(new URL(back.headers.get('location')).hash, /login_error=token/);
});

test('only a hash of the session token is stored', async () => {
  const { db, signIn } = setup();
  const { token } = await signIn();
  const rows = db.sqlite.prepare('SELECT token_hash FROM sessions').all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
});

test('the collection needs a valid session', async () => {
  const { call } = setup();
  assert.equal((await call('/collection')).status, 401);
  assert.equal((await call('/collection', { token: 'x'.repeat(40) })).status, 401);
});

test('sessions expire', async () => {
  const { call, signIn } = setup();
  const { token } = await signIn();
  const later = T0 + 91 * 24 * 60 * 60 * 1000;
  assert.equal((await call('/me', { token, now: later })).status, 401);
});

test('marks round trip and merge with the newest change winning', async () => {
  const { call, signIn } = setup();
  const { token } = await signIn();
  await call('/collection/changes', { method: 'POST', token, body: { changes: { 'owned:skin.ana.citrine': [1, T0 - 5000], 'wishlist:skin.ana.horus': [1, T0 - 4000] } } });
  // An older change from another device doesn't undo a newer one, and a newer removal does.
  await call('/collection/changes', { method: 'POST', token, now: T0 + 1000, body: { changes: { 'owned:skin.ana.citrine': [0, T0 - 9000], 'wishlist:skin.ana.horus': [0, T0 - 1000] } } });
  const answer = await (await call('/collection', { token, now: T0 + 2000 })).json();
  assert.deepEqual(answer.entries['owned:skin.ana.citrine'], [1, T0 - 5000]);
  assert.deepEqual(answer.entries['wishlist:skin.ana.horus'], [0, T0 - 1000]);
  assert.equal(answer.more, false);
  assert.ok(answer.cursor > 0);
});

test('a read with a cursor returns changes since then', async () => {
  const { call, signIn } = setup();
  const { token } = await signIn();
  await call('/collection/changes', { method: 'POST', token, now: T0, body: { changes: { 'owned:old': [1, T0] } } });
  await call('/collection/changes', { method: 'POST', token, now: T0 + 60000, body: { changes: { 'owned:seen': [1, T0 + 60000] } } });
  const first = await (await call('/collection', { token, now: T0 + 100000 })).json();
  await call('/collection/changes', { method: 'POST', token, now: T0 + 200000, body: { changes: { 'owned:new': [1, T0 + 200000] } } });
  const next = await (await call(`/collection?since=${first.cursor}`, { token, now: T0 + 300000 })).json();
  // A read overlaps the last few seconds on purpose, so the last entry seen comes back too. Merging it again does nothing.
  assert.ok('owned:new' in next.entries);
  assert.ok(!('owned:old' in next.entries));
});

test('a clock far in the future can\'t win every later merge', async () => {
  const { db, call, signIn } = setup();
  const { token } = await signIn();
  const year = 365 * 24 * 60 * 60 * 1000;
  await call('/collection/changes', { method: 'POST', token, body: { changes: { 'owned:a': [1, T0 + year] } } });
  const row = db.sqlite.prepare('SELECT changed_at FROM entries').get();
  assert.ok(row.changed_at <= T0 + 5 * 60 * 1000);
});

test('bad marks are refused whole', async () => {
  const { db, call, signIn } = setup();
  const { token } = await signIn();
  for (const changes of [{ 'hacked:a': [1, T0] }, { 'owned:a': [2, T0] }, { 'owned:a': [1, 'soon'] }, { 'owned:has space': [1, T0] }, { 'owned:ok': [1, T0], 'owned:bad value': [1, T0] }]) {
    assert.equal((await call('/collection/changes', { method: 'POST', token, body: { changes } })).status, 400);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS total FROM entries').get().total, 0);
  const tooMany = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`owned:i${index}`, [1, T0]]));
  assert.equal((await call('/collection/changes', { method: 'POST', token, body: { changes: tooMany } })).status, 413);
});

test('each person only sees their own marks', async () => {
  const { call, discord, signIn } = setup();
  const one = await signIn();
  await call('/collection/changes', { method: 'POST', token: one.token, body: { changes: { 'owned:a': [1, T0] } } });
  discord.user = { id: '999999999', username: 'other', global_name: 'Other', avatar: null };
  const two = await signIn();
  assert.deepEqual((await (await call('/collection', { token: two.token })).json()).entries, {});
});

test('signing out ends the session, and deleting an account removes everything', async () => {
  const { db, call, signIn } = setup();
  const first = await signIn();
  const second = await signIn();
  await call('/collection/changes', { method: 'POST', token: first.token, body: { changes: { 'owned:a': [1, T0] } } });
  await call('/auth/logout', { method: 'POST', token: first.token });
  assert.equal((await call('/me', { token: first.token })).status, 401);
  assert.equal((await call('/me', { token: second.token })).status, 200);
  await call('/me', { method: 'DELETE', token: second.token });
  for (const table of ['users', 'sessions', 'entries', 'login_codes']) {
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total, 0, table);
  }
});

test('requests are rate limited, and the limit resets', async () => {
  const { call } = setup();
  const start = `/auth/discord/start?return=${encodeURIComponent(`${SITE}/OW2/`)}`;
  for (let index = 0; index < 20; index += 1) assert.equal((await call(start)).status, 302);
  const blocked = await call(start);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await call(start, { ip: '203.0.113.10' })).status, 302);
  assert.equal((await call(start, { now: T0 + 61000 })).status, 302);
});

test('other sites get no CORS permission', async () => {
  const { call } = setup();
  const allowed = await call('/', { origin: SITE });
  assert.equal(allowed.headers.get('access-control-allow-origin'), SITE);
  const other = await call('/', { origin: 'https://evil.example' });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('sign-in reports a clear state when it isn\'t set up', async () => {
  const { env, call } = setup();
  delete env.DISCORD_CLIENT_SECRET;
  assert.equal((await call(`/auth/discord/start?return=${encodeURIComponent(`${SITE}/OW2/`)}`)).status, 503);
});
