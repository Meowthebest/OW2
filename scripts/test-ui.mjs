// Drives the real app in jsdom with a mocked API. Run with: npm run test:ui
// Player data below is made up for the tests. The site itself never ships sample statistics.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const result = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  define: {
    'import.meta.env': JSON.stringify({ BASE_URL: '/OW2/', VITE_CAREER_API_URL: '' }),
    'process.env.NODE_ENV': '"production"',
  },
  loader: { '.css': 'empty' },
  logLevel: 'silent',
});
const bundle = result.outputFiles[0].text;

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('not json');
      return body;
    },
  };
}

function boot({ hash = '#/', storage = {}, api = () => jsonResponse({}) } = {}) {
  const errors = [];
  const calls = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(String(error)));
  virtualConsole.on('error', (error) => errors.push(String(error)));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/OW2/' + hash,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  Object.entries(storage).forEach(([key, value]) => window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)));
  window.fetch = async (url, init) => {
    const target = new URL(url, 'http://localhost');
    calls.push({ path: target.pathname + target.search, init });
    return api(target, init, calls.length);
  };
  window.eval(bundle);
  return { window, document: window.document, errors, calls, close: () => window.close() };
}

function buttonByName(document, name) {
  const matches = [...document.querySelectorAll('button')].filter((button) => {
    const text = (button.getAttribute('aria-label') ?? button.textContent).replace(/\s+/g, ' ').trim();
    return name instanceof RegExp ? name.test(text) : text === name;
  });
  assert.ok(matches.length > 0, `No button named ${name}`);
  return matches[0];
}

function click(element) {
  element.dispatchEvent(new element.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
}

async function until(check, label, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = check();
    if (value) return value;
    await wait(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function setInput(window, input, value) {
  const proto = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

const MOTION_OFF = { 'ow2.randomizer.v1': { motion: 'off' } };
const stageName = (document) => document.querySelector('.stage__name')?.textContent;

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

// Fixtures
const block = (time, games, won, extra = {}) => ({
  time_played: time,
  games_played: games,
  games_won: won,
  games_lost: games - won,
  winrate: games ? Math.round((won / games) * 10000) / 100 : 0,
  kda: 3.5,
  total: { eliminations: games * 20, assists: games * 5, deaths: games * 6, damage: games * 9000, healing: games * 500 },
  average: { eliminations: 18, assists: 4, deaths: 6, damage: 8000, healing: 400 },
  ...extra,
});

const STATS = {
  general: block(36000, 100, 60),
  roles: { tank: block(9000, 25, 15), damage: block(18000, 50, 30), support: block(9000, 25, 15) },
  heroes: {
    genji: block(18000, 50, 20),
    ana: block(9000, 25, 20),
    winston: block(9000, 25, 20, { kda: 9.9 }),
    'brand-new-hero': block(10, 1, 1),
  },
};

const SUMMARY = {
  username: 'TestPlayer',
  avatar: 'https://cdn.example/avatar.png',
  namecard: 'https://cdn.example/namecard.png',
  title: 'Test Title',
  endorsement: { level: 3, frame: 'https://cdn.example/frame.svg#icon' },
  competitive: {
    pc: {
      season: 25,
      tank: null,
      damage: { division: 'diamond', tier: 2, rank_icon: 'https://cdn.example/rank.png', tier_icon: 'https://cdn.example/tier.png' },
      support: { division: 'ultimate', tier: 1, rank_icon: 'https://cdn.example/rank.png', tier_icon: 'https://cdn.example/tier.png' },
      open: null,
    },
    console: null,
  },
  last_updated_at: 1790000000,
};

const CAREER = {
  'all-heroes': {
    game: { time_played: 3600, games_played: 10, games_won: 6 },
    best: { eliminations_most_in_game: 44 },
  },
  ana: { hero_specific: { enemies_slept: 77, scoped_accuracy_best_in_game: 55 }, game: { time_played: 900 } },
};

function careerApi(overrides = {}) {
  return (url) => {
    const route = url.pathname;
    if (overrides[route]) return overrides[route](url);
    if (route === '/players') return jsonResponse({ total: 1, results: [{ player_id: 'abc%7Cdef', name: 'TestPlayer', title: 'Test Title', is_public: true }] });
    if (route.endsWith('/summary') && route.includes('/stats/')) {
      if (url.searchParams.get('platform') === 'console') return jsonResponse({});
      return jsonResponse(STATS);
    }
    if (route.endsWith('/summary')) return jsonResponse(SUMMARY);
    if (route.endsWith('/stats/career')) return jsonResponse(CAREER);
    return jsonResponse({ error: 'Unexpected' }, { status: 500 });
  };
}

const PROFILE = '#/career/abc%7Cdef';
const profileReady = (app) => until(() => app.document.querySelector('.comparison-row'), 'profile data');

// Project hygiene
await test('the retired game mode is gone from source, except the one storage cleanup entry', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|css|html)$/.test(name) && /nuzlocke/i.test(readFileSync(full, 'utf8'))) offenders.push(full);
    }
  };
  walk('src');
  assert.deepEqual(offenders.map((file) => file.replace(/\\/g, '/')), ['src/lib/storage.ts']);
  assert.ok(!/nuzlocke/i.test(readFileSync('index.html', 'utf8')));
});

await test('every hero has its image files on disk', () => {
  const ids = [...bundle.matchAll(/\{ id: "([a-z0-9-]+)", name: "/g)].map((match) => match[1]);
  assert.equal(ids.length, 54);
  for (const id of ids) {
    for (const file of [`portrait/${id}.webp`, `art/${id}.webp`, `art/${id}-900.webp`]) {
      assert.ok(statSync(path.join('public/heroes', file)).size > 0, file);
    }
  }
});

// Randomizer
await test('old stored data is removed on load', async () => {
  const app = boot({ storage: { ow2_nuzlocke_v1: '{"run":1}', ow2_rank_challenges_v1: '{}', ow2_lineup: '{}' } });
  await wait();
  assert.equal(app.window.localStorage.getItem('ow2_nuzlocke_v1'), null);
  assert.equal(app.window.localStorage.getItem('ow2_lineup'), null);
  app.close();
});

await test('randomize picks a hero, fills details and records history', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  assert.equal(stageName(app.document), "Who's next?");
  assert.equal(buttonByName(app.document, 'Reroll hero').disabled, true);
  click(buttonByName(app.document, 'Randomize hero'));
  await until(() => stageName(app.document) !== "Who's next?", 'a hero');
  assert.ok(app.document.querySelector('.role-badge'));
  assert.ok(app.document.querySelector('.stage__summary').textContent.length > 20);
  assert.equal(app.document.querySelectorAll('.recent-card').length, 1);
  assert.equal(buttonByName(app.document, 'Reroll hero').disabled, false);
  assert.match(app.document.querySelector('.sr-only[role="status"]').textContent, /Selected/);
  app.close();
});

await test('role filter limits every roll and updates the odds', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  click(buttonByName(app.document, 'Tank'));
  await until(() => /1 in 15/.test(app.document.querySelector('.stage__odds').textContent), 'tank odds');
  for (let i = 0; i < 25; i += 1) {
    click(buttonByName(app.document, 'Randomize hero'));
    await wait(2);
    assert.equal(app.document.querySelector('.stage__tags .role-badge').dataset.role, 'tank');
  }
  app.close();
});

await test('allowed roles can combine, and the last one cannot be turned off', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  click(buttonByName(app.document, /^Damage: 23 of 23/));
  await until(() => app.document.querySelector('.pool-meter__count strong').textContent === '31', 'pool without damage');
  click(buttonByName(app.document, /^Support: 16 of 16/));
  await until(() => app.document.querySelector('.pool-meter__count strong').textContent === '15', 'tank only');
  click(buttonByName(app.document, /^Tank: 15 of 15/));
  await wait();
  assert.equal(app.document.querySelector('.pool-meter__count strong').textContent, '15', 'one role must stay on');
  app.close();
});

await test('excluding heroes removes them from the draw and shows the state', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  const tile = buttonByName(app.document, /^Ana, Support/);
  assert.equal(tile.getAttribute('aria-pressed'), 'true');
  click(tile);
  await until(() => buttonByName(app.document, /^Ana, Support/).getAttribute('aria-pressed') === 'false', 'excluded state');
  assert.ok(buttonByName(app.document, /^Ana, Support/).classList.contains('is-excluded'));
  assert.equal(app.document.querySelector('.pool-meter__count strong').textContent, '53');
  app.close();
});

await test('an empty pool disables randomize and explains why', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  click(buttonByName(app.document, /Exclude everyone/));
  await until(() => buttonByName(app.document, 'Randomize hero').disabled, 'disabled randomize');
  assert.match(app.document.querySelector('.stage__odds').textContent, /No eligible heroes/);
  app.close();
});

await test('no repeats shows each hero once, then restarts the cycle with a notice', async () => {
  const app = boot({ storage: { 'ow2.randomizer.v1': { motion: 'off', noRepeats: true, roles: ['tank'] } } });
  await wait();
  const seen = new Set();
  for (let i = 0; i < 15; i += 1) {
    click(buttonByName(app.document, 'Randomize hero'));
    await wait(2);
    const name = stageName(app.document);
    assert.ok(!seen.has(name), `${name} repeated`);
    seen.add(name);
  }
  assert.equal(seen.size, 15);
  const last = stageName(app.document);
  click(buttonByName(app.document, 'Randomize hero'));
  await until(() => /started over/.test(app.document.querySelector('.toast-region').textContent), 'cycle notice');
  assert.notEqual(stageName(app.document), last);
  app.close();
});

await test('reroll changes the hero and is marked in history', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  click(buttonByName(app.document, 'Randomize hero'));
  await wait(5);
  const before = stageName(app.document);
  click(buttonByName(app.document, 'Reroll hero'));
  await until(() => stageName(app.document) !== before, 'a different hero');
  assert.equal(app.document.querySelectorAll('.recent-card').length, 2);
  assert.ok(app.document.querySelector('.recent-card [aria-label="from a reroll"]'));
  app.close();
});

await test('preferences and history survive a reload, and unknown saved heroes are dropped', async () => {
  const app = boot({
    storage: {
      'ow2.randomizer.v1': {
        roles: ['support'],
        excluded: ['ana', 'not-a-hero'],
        noRepeats: true,
        motion: 'off',
        used: ['mercy', 'not-a-hero'],
        history: [{ id: 'mercy', at: 1000, reroll: false }, { id: 'not-a-hero', at: 1, reroll: false }],
        currentId: 'mercy',
        rolls: 4,
      },
    },
  });
  await wait();
  assert.equal(stageName(app.document), 'Mercy');
  assert.equal(app.document.querySelector('.pool-meter__count strong').textContent, '15');
  assert.equal(app.document.querySelectorAll('.recent-card').length, 1);
  assert.equal(buttonByName(app.document, 'No repeats').getAttribute('aria-checked'), 'true');
  await until(() => JSON.parse(app.window.localStorage.getItem('ow2.randomizer.v1')).excluded.length === 1, 'cleaned save');
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem('ow2.randomizer.v1')).excluded, ['ana']);
  app.close();
});

await test('corrupt saved data falls back to defaults', async () => {
  const app = boot({ storage: { 'ow2.randomizer.v1': '{not json' } });
  await wait();
  assert.equal(app.document.querySelector('.pool-meter__count strong').textContent, '54');
  assert.deepEqual(app.errors, []);
  app.close();
});

await test('reset clears filters and history, and undo restores them', async () => {
  const app = boot({ storage: { 'ow2.randomizer.v1': { motion: 'off', roles: ['tank'], excluded: ['dva'], currentId: 'winston', history: [{ id: 'winston', at: 1, reroll: false }], rolls: 1 } } });
  await wait();
  click(buttonByName(app.document, /Reset filters/));
  await until(() => stageName(app.document) === "Who's next?", 'reset');
  assert.equal(app.document.querySelector('.pool-meter__count strong').textContent, '54');
  assert.equal(app.document.querySelectorAll('.recent-card').length, 0);
  click(buttonByName(app.document, 'Undo'));
  await until(() => stageName(app.document) === 'Winston', 'undo');
  assert.equal(app.document.querySelector('.pool-meter__count strong').textContent, '14');
  app.close();
});

await test('roster search ignores accents and case, and has an empty state', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  const search = app.document.querySelector('.roster input[type="search"]');
  setInput(app.window, search, 'torbjorn');
  await until(() => app.document.querySelectorAll('.hero-tile').length === 1, 'accent-insensitive match');
  assert.match(app.document.querySelector('.hero-tile').textContent, /Torbjörn/);
  setInput(app.window, search, 'zzz');
  await until(() => app.document.querySelector('.roster__empty'), 'empty state');
  click(buttonByName(app.document, 'Clear search and filters'));
  await until(() => app.document.querySelectorAll('.hero-tile').length === 54, 'all heroes back');
  app.close();
});

await test('navigation keeps randomizer state across routes', async () => {
  const app = boot({ storage: MOTION_OFF, api: careerApi() });
  await wait();
  click(buttonByName(app.document, 'Randomize hero'));
  await wait(5);
  const name = stageName(app.document);
  app.window.location.hash = '#/career';
  await until(() => app.document.querySelector('.career-landing'), 'career page');
  assert.equal(app.document.querySelector('.site-nav__link.is-active').textContent, 'Career');
  app.window.location.hash = '#/heroes';
  await until(() => app.document.querySelector('.stage'), 'randomizer page');
  assert.equal(stageName(app.document), name);
  assert.equal(app.document.querySelector('.site-nav__link.is-active').textContent, 'Heroes');
  app.close();
});

// Teams
const teamStorage = (extra = {}) => ({ 'ow2.randomizer.v1': { motion: 'off', ...extra } });
const slotNames = (document) => [...document.querySelectorAll('.slot__name')].map((node) => node.textContent);
const slotRoles = (document) => [...document.querySelectorAll('.slot .role-badge')].map((node) => node.dataset.role);

await test('the party picker offers 1 to 5 players and shows a card per player', async () => {
  const app = boot({ storage: MOTION_OFF });
  await wait();
  for (const size of [2, 3, 4, 5]) {
    click(buttonByName(app.document, size + ' players'));
    await until(() => app.document.querySelectorAll('.slot').length === size, size + ' cards');
    assert.equal(buttonByName(app.document, size + ' players').getAttribute('aria-pressed'), 'true');
  }
  click(buttonByName(app.document, '1 player'));
  await until(() => app.document.querySelector('.stage__summary'), 'solo stage');
  assert.equal(app.document.querySelectorAll('.slot').length, 0);
  assert.ok(buttonByName(app.document, 'Randomize hero'));
  app.close();
});

await test('a team rolls one different hero per player and logs all of them', async () => {
  const app = boot({ storage: teamStorage({ partySize: 5 }) });
  await wait();
  for (let round = 0; round < 20; round += 1) {
    click(buttonByName(app.document, 'Randomize team'));
    await until(() => slotNames(app.document).length === 5, 'five heroes');
    await wait(2);
    assert.equal(new Set(slotNames(app.document)).size, 5, 'no duplicates: ' + slotNames(app.document));
  }
  assert.equal(app.document.querySelector('.team-head__title').textContent, 'Team locked in');
  assert.equal(app.document.querySelectorAll('.recent-card.is-latest').length, 5);
  assert.match(app.document.querySelector('.recent-card').textContent, /Player 1/);
  assert.match(app.document.querySelector('.sr-only[role="status"]').textContent, /Player 5:/);
  app.close();
});

await test('assign team roles gives 1 tank, 2 damage, 2 support, and rolls respect it', async () => {
  const app = boot({ storage: teamStorage({ partySize: 5 }) });
  await wait();
  click(buttonByName(app.document, 'Assign team roles'));
  await until(() => [...app.document.querySelectorAll('.slot select')].map((node) => node.value).join() === 'tank,damage,damage,support,support', 'team roles');
  for (let round = 0; round < 10; round += 1) {
    click(buttonByName(app.document, 'Randomize team'));
    await wait(4);
    assert.deepEqual(slotRoles(app.document), ['tank', 'damage', 'damage', 'support', 'support']);
  }
  click(buttonByName(app.document, 'Any role'));
  await until(() => [...app.document.querySelectorAll('.slot select')].every((node) => node.value === 'any'), 'roles cleared');
  app.close();
});

await test('each player can lock their own role', async () => {
  const app = boot({ storage: teamStorage({ partySize: 2 }) });
  await wait();
  setInput(app.window, app.document.querySelectorAll('.slot select')[1], 'support');
  await until(() => app.document.querySelectorAll('.slot')[1].dataset.role === 'support', 'locked role');
  for (let round = 0; round < 10; round += 1) {
    click(buttonByName(app.document, 'Randomize team'));
    await wait(4);
    assert.equal(slotRoles(app.document)[1], 'support');
  }
  app.close();
});

await test('rerolling one player leaves the rest of the team alone', async () => {
  const app = boot({ storage: teamStorage({ partySize: 3 }) });
  await wait();
  click(buttonByName(app.document, 'Randomize team'));
  await until(() => slotNames(app.document).length === 3, 'a team');
  for (let round = 0; round < 15; round += 1) {
    const before = slotNames(app.document);
    click(buttonByName(app.document, 'Reroll Player 2'));
    await until(() => slotNames(app.document)[1] !== before[1], 'a new hero for player 2');
    const after = slotNames(app.document);
    assert.equal(after[0], before[0]);
    assert.equal(after[2], before[2]);
    assert.equal(new Set(after).size, 3);
  }
  assert.ok(app.document.querySelector('.recent-card [aria-label="from a reroll"]'));
  app.close();
});

await test('player names are saved and used across the page', async () => {
  const app = boot({ storage: teamStorage({ partySize: 2 }) });
  await wait();
  const input = app.document.querySelector('.slot__input');
  setInput(app.window, input, 'A very long player name indeed');
  await until(() => app.document.querySelector('.slot__input').value === 'A very long play', 'name capped at 16');
  click(buttonByName(app.document, 'Randomize team'));
  await until(() => slotNames(app.document).length === 2, 'a team');
  assert.match(app.document.querySelector('.recent-card').textContent, /A very long play/);
  assert.ok(buttonByName(app.document, 'Reroll A very long play'));
  const heroTile = [...app.document.querySelectorAll('.hero-tile')].find((node) => node.classList.contains('is-pick'));
  assert.match(heroTile.getAttribute('aria-label'), /Current pick for/);
  assert.match(heroTile.textContent, /P[12]/);
  await until(() => JSON.parse(app.window.localStorage.getItem('ow2.randomizer.v1')).players[0].name === 'A very long play', 'saved name');
  app.close();
});

await test('hero details follow the selected card', async () => {
  const app = boot({ storage: teamStorage({ partySize: 2 }) });
  await wait();
  click(buttonByName(app.document, 'Randomize team'));
  await until(() => app.document.querySelector('.hero-focus'), 'details');
  const names = slotNames(app.document);
  assert.match(app.document.querySelector('.hero-focus').textContent, new RegExp(names[0].replace(/[.:]/g, '.')));
  click(app.document.querySelectorAll('.slot__hero')[1]);
  await until(() => app.document.querySelector('.hero-focus__title').textContent.includes(names[1]), 'second hero details');
  assert.match(app.document.querySelector('.hero-focus__title').textContent, /Player 2/);
  app.close();
});

await test('a shortage warns and never duplicates a hero', async () => {
  const onlyTwo = ['ana', 'mercy'];
  const app = boot({ storage: teamStorage({ partySize: 4, roles: ['support'] }) });
  await wait();
  const others = [...app.document.querySelectorAll('.hero-tile')]
    .filter((node) => node.dataset.role === 'support' && !onlyTwo.some((id) => node.getAttribute('aria-label').toLowerCase().startsWith(id)));
  others.forEach(click);
  await until(() => /Only 2 eligible heroes for 4 players/.test(app.document.querySelector('.stage__odds').textContent), 'shortage notice');
  click(buttonByName(app.document, 'Randomize team'));
  await until(() => /Not enough eligible heroes for 2 players/.test(app.document.querySelector('.toast-region').textContent), 'shortage toast');
  assert.equal(new Set(slotNames(app.document)).size, 2);
  app.close();
});

await test('a role with no heroes says so on the card', async () => {
  const app = boot({ storage: teamStorage({ partySize: 2, roles: ['tank'], players: [{ role: 'any' }, { role: 'support' }] }) });
  await wait();
  assert.match(app.document.querySelectorAll('.slot')[1].textContent, /No support heroes in the pool/);
  app.close();
});

await test('no repeats works across the whole team', async () => {
  const app = boot({ storage: teamStorage({ partySize: 5, noRepeats: true }) });
  await wait();
  const seen = new Set();
  for (let round = 0; round < 10; round += 1) {
    click(buttonByName(app.document, 'Randomize team'));
    await wait(4);
    for (const name of slotNames(app.document)) {
      assert.ok(!seen.has(name), name + ' repeated');
      seen.add(name);
    }
  }
  assert.equal(seen.size, 50);
  app.close();
});

await test('team setup survives a reload, and reset keeps size and names', async () => {
  const saved = { motion: 'off', partySize: 3, players: [{ name: 'Mina', role: 'tank', heroId: 'winston' }, { name: '', role: 'any', heroId: 'winston' }, { role: 'bogus', heroId: 'not-a-hero' }] };
  const app = boot({ storage: { 'ow2.randomizer.v1': saved } });
  await wait();
  assert.equal(app.document.querySelectorAll('.slot').length, 3);
  assert.equal(app.document.querySelector('.slot__input').value, 'Mina');
  assert.deepEqual(slotNames(app.document), ['Winston'], 'duplicate and unknown saved heroes are dropped');
  assert.equal(app.document.querySelectorAll('.slot select')[2].value, 'any');
  click(buttonByName(app.document, /Reset filters/));
  await until(() => slotNames(app.document).length === 0, 'heroes cleared');
  assert.equal(app.document.querySelectorAll('.slot').length, 3);
  assert.equal(app.document.querySelector('.slot__input').value, 'Mina');
  assert.equal(app.document.querySelector('.slot select').value, 'any');
  click(buttonByName(app.document, 'Undo'));
  await until(() => slotNames(app.document).length === 1, 'undo');
  assert.equal(app.document.querySelector('.slot select').value, 'tank');
  app.close();
});

await test('an invalid saved party size falls back to solo', async () => {
  const app = boot({ storage: teamStorage({ partySize: 9 }) });
  await wait();
  assert.equal(app.document.querySelectorAll('.slot').length, 0);
  assert.ok(buttonByName(app.document, 'Randomize hero'));
  app.close();
});

// Career
await test('BattleTag search resolves the player and opens the dashboard', async () => {
  const app = boot({ hash: '#/career', api: careerApi() });
  const input = await until(() => app.document.querySelector('.player-search input'), 'search box');
  setInput(app.window, input, 'TestPlayer#1234');
  app.document.querySelector('.player-search form').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => app.window.location.hash === '#/career/abc%7Cdef', 'navigation to the profile');
  assert.equal(app.calls[0].path, '/players?name=TestPlayer-1234&limit=20');
  await profileReady(app);
  assert.equal(app.document.querySelector('.profile__name').textContent, 'TestPlayer');
  assert.equal(app.document.querySelector('.profile__title').textContent, 'Test Title');
  app.close();
});

await test('name search lists players; invalid input and no results explain themselves', async () => {
  const api = careerApi({
    '/players': (url) => (url.searchParams.get('name') === 'Nobody'
      ? jsonResponse({ total: 0, results: [] })
      : jsonResponse({ total: 2, results: [
        { player_id: 'a%7C1', name: 'Twin', title: 'First', is_public: true, last_updated_at: 1790000000 },
        { player_id: 'b%7C2', name: 'Twin', title: null, is_public: true },
      ] })),
  });
  const app = boot({ hash: '#/career', api });
  const input = await until(() => app.document.querySelector('.player-search input'), 'search box');
  const submit = (value) => {
    setInput(app.window, input, value);
    app.document.querySelector('.player-search form').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
  };
  submit('Twin');
  await until(() => app.document.querySelectorAll('.search-result').length === 2, 'two results');
  assert.match(app.document.querySelector('.search-results__count').textContent, /2 public players/);
  submit('two words');
  await until(() => app.document.querySelector('.player-search__hint--error'), 'validation message');
  submit('Nobody');
  await until(() => app.document.querySelector('.search-results__empty'), 'no results');
  assert.match(app.document.querySelector('.search-results__empty').textContent, /capital letters/);
  app.close();
});

await test('a profile link goes straight to the player', async () => {
  const app = boot({ hash: '#/career', api: careerApi() });
  const input = await until(() => app.document.querySelector('.player-search input'), 'search box');
  setInput(app.window, input, 'https://overwatch.blizzard.com/en-us/career/abc123def0%7C99aa88bb77/');
  app.document.querySelector('.player-search form').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => app.window.location.hash === '#/career/abc123def0%7C99aa88bb77', 'navigation');
  app.close();
});

await test('overview shows real values, ranks, unranked roles and most played heroes', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  const text = app.document.querySelector('.overview').textContent;
  assert.match(text, /10 HRS/, 'time played');
  assert.match(text, /60\.?0?%/, 'win rate');
  const ranks = [...app.document.querySelectorAll('.rank-row')].map((row) => row.textContent);
  assert.match(ranks[0], /Tank.*Unranked/);
  assert.match(ranks[1], /Damage.*Diamond 2/);
  assert.match(ranks[2], /Support.*Champion 1/);
  assert.match(ranks[3], /Open Queue.*Unranked/);
  assert.equal(app.document.querySelector('.ranks__season').textContent, '2026: Season 5');
  assert.equal(app.document.querySelector('.ranks .dash__label').textContent, 'Competitive · PC');
  const top = [...app.document.querySelectorAll('.played-card__name')].map((node) => node.textContent);
  assert.deepEqual(top, ['Genji', 'Ana', 'Winston']);
  assert.match(app.document.querySelector('.endorsement').textContent, /3/);
  assert.equal(app.document.querySelectorAll('.role-table tbody tr').length, 3);
  assert.ok(!/level/i.test(app.document.querySelector('.profile').textContent.replace(/Endorsement level \d/, '')), 'no invented player level');
  app.close();
});

await test('hero comparison re-sorts by metric with bars scaled to the data', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  const names = () => [...app.document.querySelectorAll('.comparison-row__name')].map((node) => node.textContent);
  assert.equal(names()[0], 'Genji');
  assert.equal(app.document.querySelector('.comparison-row__bar').style.width, '100%');
  const widths = [...app.document.querySelectorAll('.comparison-row__bar')].map((bar) => parseFloat(bar.style.width));
  assert.equal(widths[1], 50);
  const select = app.document.querySelector('.comparison select');
  setInput(app.window, select, 'kda');
  await until(() => names()[0] === 'Winston', 're-sort by KDA');
  setInput(app.window, select, 'winrate');
  await until(() => names()[0] === 'Brand New Hero', 'unknown hero sorts in by name');
  click(buttonByName(app.document, /Sorted highest first/));
  await until(() => names()[0] === 'Genji', 'ascending order');
  app.close();
});

await test('an unknown hero from the API falls back gracefully', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  assert.ok(app.document.querySelector('.comparison__list').textContent.includes('Brand New Hero'));
  assert.deepEqual(app.errors, []);
  app.close();
});

await test('tabs switch without a reload and support the keyboard', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  const before = app.calls.length;
  const stats = app.document.querySelector('#career-tab-statistics');
  assert.equal(stats.getAttribute('aria-selected'), 'false');
  click(stats);
  await until(() => app.document.querySelector('.statistics'), 'statistics tab');
  assert.equal(app.document.querySelector('#career-tab-statistics').getAttribute('aria-selected'), 'true');
  assert.ok(app.calls.slice(before).every((call) => call.path.includes('/stats/career')), 'only the extra career request is made');
  app.document.querySelector('.tabs').dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await until(() => app.document.querySelector('.overview'), 'back to overview');
  app.close();
});

await test('most played opens that hero in statistics, with filters and career tables', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  click(buttonByName(app.document, /^Ana, /));
  await until(() => app.document.querySelector('.career-table'), 'career tables');
  assert.equal(app.window.location.hash, '#/career/abc%7Cdef/statistics/ana');
  assert.match(app.document.querySelector('.statistics__scope').textContent, /Ana/);
  assert.match(app.document.querySelector('.statistics__career').textContent, /Enemies slept/);
  assert.match(app.document.querySelector('.statistics__career').textContent, /55%/, 'accuracy is a percent');
  assert.match(app.document.querySelector('.statistics__career').textContent, /15m/, 'time is a duration');
  click(buttonByName(app.document, /Clear hero/));
  await until(() => app.window.location.hash === '#/career/abc%7Cdef/statistics', 'hero cleared');
  app.close();
});

await test('hero table sorts and sets aria-sort', async () => {
  const app = boot({ hash: PROFILE + '/statistics', api: careerApi() });
  const table = await until(() => app.document.querySelector('.statistics__table table'), 'hero table');
  const firstRow = () => table.querySelector('tbody tr').textContent;
  assert.match(firstRow(), /Genji/);
  const header = [...table.querySelectorAll('thead th')].find((th) => th.textContent.includes('Win %'));
  click(header.querySelector('button'));
  await until(() => header.getAttribute('aria-sort') === 'descending', 'sort state');
  assert.match(firstRow(), /Brand New Hero/);
  click(header.querySelector('button'));
  await until(() => header.getAttribute('aria-sort') === 'ascending', 'ascending state');
  assert.match(firstRow(), /Genji/);
  app.close();
});

await test('the game mode dropdown switches the whole overview', async () => {
  const competitive = { general: block(600, 1, 1), roles: { tank: block(600, 1, 1) }, heroes: { winston: block(600, 1, 1) } };
  const api = careerApi({
    '/players/abc%7Cdef/stats/summary': (url) => jsonResponse(url.searchParams.get('gamemode') === 'competitive' ? competitive : STATS),
  });
  const app = boot({ hash: PROFILE, api });
  await profileReady(app);
  assert.match(app.document.querySelector('.summary__time').textContent, /^10 HRS$/);
  setInput(app.window, app.document.querySelectorAll('.career-bar select')[0], 'competitive');
  await until(() => /^10 MINS$/.test(app.document.querySelector('.summary__time').textContent), 'competitive time');
  assert.deepEqual([...app.document.querySelectorAll('.played-card__name')].map((node) => node.textContent), ['Winston']);
  assert.match(app.document.querySelector('.mode-split__row[data-mode="competitive"]').textContent, /10 MINS/);
  app.close();
});

await test('footnotes state the source and limits, and never claim live data', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  const notes = app.document.querySelector('.career-notes').textContent;
  assert.match(notes, /never live/);
  assert.match(notes, /last season played/);
  assert.match(notes, /must be set to public/);
  assert.ok(!/pulled live/i.test(app.document.body.textContent));
  assert.ok(app.document.querySelector('.career-notes a[href*="overwatch.blizzard.com/en-us/career/abc%7Cdef"]'));
  app.close();
});

await test('game mode and platform become separate requests and cache entries', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  assert.ok(app.calls.some((call) => call.path === '/players/abc%7Cdef/stats/summary?gamemode=competitive'));
  setInput(app.window, app.document.querySelectorAll('.career-bar select')[1], 'console');
  await until(() => app.calls.some((call) => call.path === '/players/abc%7Cdef/stats/summary?platform=console'), 'console request');
  await until(() => /No all modes stats/.test(app.document.querySelector('.overview').textContent), 'empty console state');
  assert.equal(app.document.querySelector('.profile__name').textContent, 'TestPlayer');
  setInput(app.window, app.document.querySelectorAll('.career-bar select')[1], 'all');
  await profileReady(app);
  app.close();
});

await test('private profile shows the header and an honest explanation, never made-up numbers', async () => {
  const privateSummary = { username: 'Hidden', avatar: null, namecard: null, title: null, endorsement: { level: 0, frame: '' }, competitive: null, last_updated_at: null };
  const app = boot({
    hash: '#/career/Hidden-1111',
    api: careerApi({
      '/players/Hidden-1111/summary': () => jsonResponse(privateSummary),
      '/players/Hidden-1111/stats/summary': () => jsonResponse({}),
    }),
  });
  await until(() => /No public statistics/.test(app.document.querySelector('.career')?.textContent ?? ''), 'private notice');
  const text = app.document.querySelector('.career').textContent;
  assert.match(text, /Career Profile Visibility/);
  assert.equal(app.document.querySelector('.overview'), null);
  assert.equal(app.document.querySelector('.profile__name').textContent, 'Hidden');
  app.close();
});

await test('a missing player shows not found and is not cached', async () => {
  const notFound = () => jsonResponse({ error: { error: 'Player not found', retry_after: 600 } }, { status: 404 });
  const app = boot({
    hash: '#/career/Ghost-404',
    api: careerApi({ '/players/Ghost-404/summary': notFound, '/players/Ghost-404/stats/summary': notFound }),
  });
  await until(() => /Player not found/.test(app.document.querySelector('.career')?.textContent ?? ''), 'not found');
  assert.match(app.document.querySelector('.career').textContent, /case-sensitive/);
  assert.equal(app.document.querySelector('.career-bar'), null);
  app.close();
});

await test('a network failure offers retry, and retry recovers', async () => {
  let down = true;
  const healthy = careerApi();
  const app = boot({
    hash: PROFILE,
    api: (url, init) => {
      if (down) throw new TypeError('Failed to fetch');
      return healthy(url, init);
    },
  });
  await until(() => /Could not reach the data source/.test(app.document.querySelector('.career')?.textContent ?? ''), 'error state');
  down = false;
  click(buttonByName(app.document, /Try again/));
  await profileReady(app);
  app.close();
});

await test('invalid responses and server errors are reported, not rendered', async () => {
  const app = boot({ hash: PROFILE, api: () => jsonResponse('<html>Bad gateway</html>', { status: 502 }) });
  await until(() => /data source had a problem/.test(app.document.querySelector('.career')?.textContent ?? ''), 'server error');
  app.close();
});

await test('a slow or partial failure stays local to its panel', async () => {
  const app = boot({
    hash: PROFILE,
    api: careerApi({
      '/players/abc%7Cdef/stats/summary': (url) => (url.searchParams.get('gamemode') === 'competitive'
        ? jsonResponse({ error: 'Blizzard server error' }, { status: 504 })
        : jsonResponse(STATS)),
    }),
  });
  await profileReady(app);
  assert.match(app.document.querySelector('.overview').textContent, /Genji/);
  const competitive = await until(() => {
    const row = app.document.querySelector('.mode-split__row[data-mode="competitive"]');
    return row && /—/.test(row.textContent) ? row : null;
  }, 'a dash for the failed mode');
  assert.ok(!/0m/.test(competitive.textContent), 'a failed request must not read as zero time played');
  app.close();
});

function cachedEntry(data, ageMs, now = Date.now()) {
  const fetchedAt = now - ageMs;
  return JSON.stringify({ data, fetchedAt, snapshotAt: fetchedAt, expiresAt: fetchedAt + 3600000, layer: 'overfast' });
}

function cachedProfile(ageMs, stats = STATS) {
  return {
    'ow2.career.v1|summary|abc|def': cachedEntry(SUMMARY, ageMs),
    'ow2.career.v1|stats-summary|abc|def|all|all': cachedEntry(stats, ageMs),
    'ow2.career.v1|stats-summary|abc|def|quickplay|all': cachedEntry(stats, ageMs),
    'ow2.career.v1|stats-summary|abc|def|competitive|all': cachedEntry(stats, ageMs),
  };
}

await test('a fresh cached profile loads with no network requests', async () => {
  const app = boot({ hash: PROFILE, storage: cachedProfile(600000), api: careerApi() });
  await profileReady(app);
  await wait(30);
  assert.equal(app.calls.length, 0);
  assert.match(app.document.querySelector('.data-status').textContent, /10 min ago/);
  assert.match(app.document.querySelector('.data-status').textContent, /not live/);
  assert.ok(!/\blive data\b/i.test(app.document.body.textContent));
  app.close();
});

await test('expired cache shows immediately, then updates in the background', async () => {
  const updated = { ...STATS, general: block(72000, 200, 120) };
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const healthy = careerApi({ '/players/abc%7Cdef/stats/summary': () => jsonResponse(updated) });
  const app = boot({
    hash: PROFILE,
    storage: cachedProfile(2 * 3600000),
    api: async (url, init) => {
      await gate;
      return healthy(url, init);
    },
  });
  await profileReady(app);
  assert.match(app.document.querySelector('.summary__time').textContent, /^10 HRS$/, 'old copy on screen first');
  assert.match(app.document.querySelector('.data-status').textContent, /2 hr ago/);
  await until(() => /Checking for newer data/.test(app.document.querySelector('.data-status').textContent), 'the checking state');
  release();
  await until(() => /^20 HRS$/.test(app.document.querySelector('.summary__time').textContent), 'updated value');
  // The timestamp shows the oldest copy on screen, so it changes once every response has arrived.
  await until(() => /just now/.test(app.document.querySelector('.data-status').textContent), 'the new timestamp');
  app.close();
});

await test('a failed background update keeps the old copy and its old timestamp', async () => {
  const app = boot({ hash: PROFILE, storage: cachedProfile(2 * 3600000), api: () => { throw new TypeError('Failed to fetch'); } });
  await profileReady(app);
  await until(() => /Update failed, showing cached copy/.test(app.document.querySelector('.data-status').textContent), 'failure label');
  assert.match(app.document.querySelector('.data-status').textContent, /2 hr ago/, 'never presented as new');
  assert.match(app.document.querySelector('.summary__time').textContent, /^10 HRS$/);
  app.close();
});

await test('manual refresh calls the source, then enforces a cooldown', async () => {
  const app = boot({ hash: PROFILE, storage: cachedProfile(600000), api: careerApi() });
  await profileReady(app);
  click(buttonByName(app.document, 'Refresh'));
  await until(() => app.calls.length >= 4, 'refresh requests');
  assert.ok(app.calls.every((call) => call.init.cache === 'no-cache'));
  await until(() => /No newer data|Career stats updated/.test(app.document.querySelector('.toast-region').textContent), 'result toast');
  const button = await until(() => [...app.document.querySelectorAll('.data-status button')].find((node) => /Refresh in \d+s/.test(node.textContent)), 'cooldown label');
  assert.equal(button.disabled, true);
  const count = app.calls.length;
  await wait(30);
  assert.equal(app.calls.length, count, 'no extra calls during the cooldown');
  app.close();
});

await test('rate limiting keeps cached data and pauses refresh', async () => {
  const limited = () => jsonResponse({ error: 'API rate limit reached, please wait for 90 seconds before retrying' }, { status: 429 });
  const app = boot({ hash: PROFILE, storage: cachedProfile(600000), api: limited });
  await profileReady(app);
  click(buttonByName(app.document, 'Refresh'));
  await until(() => /Too many requests/.test(app.document.querySelector('.toast-region').textContent), 'rate limit toast');
  assert.match(app.document.querySelector('.summary__time').textContent, /^10 HRS$/);
  await until(() => /Refresh in \d+s/.test(app.document.querySelector('.data-status button').textContent), 'cooldown');
  app.close();
});

await test('recent players are remembered and can be cleared', async () => {
  const app = boot({ hash: PROFILE, api: careerApi() });
  await profileReady(app);
  app.window.location.hash = '#/career';
  const link = await until(() => app.document.querySelector('.recent-player'), 'recent player');
  assert.match(link.textContent, /TestPlayer/);
  click(buttonByName(app.document, 'Clear'));
  await until(() => !app.document.querySelector('.recent-player'), 'cleared');
  app.close();
});

// Patch notes. These use the real imported data, served by the mocked fetch, as it stood when November 3 was the newest
// patch. The patch sync adds new patches by itself, and without this cut-off each one would change what these tests
// expect and stop the site from deploying. One test below opens whichever patch is really the newest.
// The data also counts as just checked, so a few days without a patch sync can't fail a deploy either.
const PATCH_DIR = 'public/data/patches';
const PATCHES_AS_OF = '2026-11-03';
function readPatchFile(name, asOf = PATCHES_AS_OF) {
  const data = JSON.parse(readFileSync(path.join(PATCH_DIR, name), 'utf8'));
  if (!asOf) return data;
  if (name === 'index.json') {
    return {
      ...data,
      lastCheckedAt: new Date().toISOString(),
      seasons: data.seasons.filter((season) => season.start <= asOf),
      patches: data.patches.filter((patch) => patch.date <= asOf),
    };
  }
  if (name === 'heroes.json') {
    const heroes = Object.entries(data.heroes).map(([id, tallies]) => [id, tallies.filter((tally) => tally.date <= asOf)]);
    return { ...data, heroes: Object.fromEntries(heroes.filter(([, tallies]) => tallies.length > 0)) };
  }
  return data;
}
function patchApi(overrides = {}, { asOf = PATCHES_AS_OF } = {}) {
  return (target, init, count) => {
    const match = /\/OW2\/data\/patches\/(.+)$/.exec(target.pathname);
    if (!match) return jsonResponse({}, { status: 404 });
    if (overrides[match[1]]) return overrides[match[1]](count);
    const date = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(match[1])?.[1];
    if (asOf && date && date > asOf) return jsonResponse({}, { status: 404 });
    return jsonResponse(readPatchFile(match[1], asOf));
  };
}
const cardNames = (document, group) => [...document.querySelectorAll(group ? `.result-section[data-group="${group}"] .hero-card__name` : '.hero-card__name')].map((node) => node.textContent);
const patchesReady = (app) => until(() => app.document.querySelector('.hero-card__name'), 'hero cards');
const cardFor = (document, name, group = 'standard') => [...document.querySelectorAll(`.result-section[data-group="${group}"] .hero-card`)].find((card) => card.querySelector('.hero-card__name').textContent === name);
const chip = (document, label) => [...document.querySelectorAll('.filter-chip')].find((button) => button.textContent.trim() === label);
const selectNamed = (document, label) => [...document.querySelectorAll('.select-field')].find((field) => field.textContent.trim().startsWith(label)).querySelector('select');
const novemberPristine = JSON.parse(readFileSync(path.join(PATCH_DIR, '2026-11-03.json'), 'utf8')).revisions.length === 0;

await test('the patch page shows the latest patch with unique hero counts and sources', async () => {
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  assert.equal(app.document.querySelector('.site-nav__link.is-active').getAttribute('aria-label'), 'Patch Notes');
  assert.match(app.document.title, /Patch Notes/);
  if (novemberPristine) {
    assert.match(app.document.querySelector('.patch-hero__title').textContent, /November 3, 2026/);
    const tiles = [...app.document.querySelectorAll('.patch-tile')].map((tile) => tile.textContent);
    assert.ok(tiles[0].includes('9') && /Heroes buffed/.test(tiles[0]));
    assert.ok(tiles[1].includes('7') && /Heroes nerfed/.test(tiles[1]));
    assert.ok(tiles[2].includes('3') && /Mixed/.test(tiles[2]));
    assert.ok(tiles[3].includes('1') && /Neutral/.test(tiles[3]));
    assert.ok(tiles[4].includes('42') && /19 buff lines, 22 nerf lines/.test(tiles[4]));
    assert.match(app.document.querySelector('.patch-hero__extras').textContent, /Stadium is counted separately: 5 heroes, 7 lines/);
    assert.match(app.document.querySelector('.patch-hero__meta').textContent, /Season 5/);
  }
  const links = [...app.document.querySelectorAll('.patch-hero__links a')].map((link) => link.href);
  assert.ok(links.some((href) => href.startsWith('https://overwatch.blizzard.com/en-us/news/patch-notes/live/')));
  assert.match(app.document.querySelector('.patch-hero__verify').textContent, /Last checked/);
  assert.deepEqual(app.errors, []);
  app.close();
});

await test('hero cards show results, values, and Stadium stays in its own section', async () => {
  if (!novemberPristine) return;
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  assert.equal(cardNames(app.document, 'standard').length, 22);
  assert.deepEqual(cardNames(app.document, 'stadium').sort(), ['Cassidy', 'Genji', 'Sojourn', 'Vendetta', 'Winston']);

  const ana = cardFor(app.document, 'Ana');
  assert.match(ana.querySelector('.class-badge').textContent, /Nerfed/);
  assert.equal(ana.querySelector('.class-badge').dataset.class, 'nerf');
  assert.match(ana.querySelector('.change__values').textContent, /90\s*to\s*60\s*−33\.3%/);
  assert.match(ana.querySelector('.change__result').textContent, /Result: Nerf/);
  assert.ok(ana.querySelector('.portrait'));
  assert.match(ana.querySelector('.hero-card__foot a').href, /patch-2026-11-03$/);

  const sombra = cardFor(app.document, 'Sombra');
  assert.match(sombra.querySelector('.class-badge').textContent, /Mixed/);
  assert.match(sombra.querySelector('.hero-card__analysis').textContent, /Analysis.*leans toward nerfs/);

  const queen = cardFor(app.document, 'Junker Queen');
  assert.match(queen.querySelector('.change-tag--scope').textContent, /6v6/);
  assert.equal(cardFor(app.document, 'Baptiste').querySelector('.class-badge').dataset.class, 'neutral');
  assert.match(cardFor(app.document, 'Baptiste').querySelector('.change__result').textContent, /Quality of life/);
  app.close();
});

await test('expanding a card reveals all its changes and the summarized reason', async () => {
  if (!novemberPristine) return;
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  const doctrine = cardFor(app.document, 'Doctrine');
  assert.equal(doctrine.querySelectorAll('.change').length - doctrine.querySelectorAll('.hero-card__more .change').length, 3);
  const toggle = doctrine.querySelector('.hero-card__toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(doctrine.querySelector('.hero-card__more').hidden, true);
  assert.match(toggle.textContent, /Show all 5 changes/);
  click(toggle);
  await until(() => toggle.getAttribute('aria-expanded') === 'true', 'expanded');
  assert.equal(doctrine.querySelector('.hero-card__more').hidden, false);
  assert.equal(doctrine.querySelectorAll('.change').length, 5);
  assert.match(doctrine.querySelector('.hero-card__intent').textContent, /summarized/);
  app.close();
});

await test('filters update the list and the URL, and a shared link restores them', async () => {
  if (!novemberPristine) return;
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  click(chip(app.document, 'Nerfs Only'));
  await until(() => cardNames(app.document, 'standard').length === 7, 'nerf cards');
  assert.deepEqual(cardNames(app.document, 'stadium').sort(), ['Vendetta', 'Winston']);
  await until(() => /balance=nerf/.test(app.window.location.hash), 'balance in the URL');

  click(buttonByName(app.document, /More filters/));
  click(chip(app.document, 'Support'));
  await until(() => cardNames(app.document).length === 2, 'support nerfs');
  assert.deepEqual(cardNames(app.document), ['Ana', 'Doctrine']);
  await until(() => /role=support/.test(app.window.location.hash), 'role in the URL');
  assert.equal(app.window.location.hash, '#/patches?balance=nerf&role=support');
  app.close();

  const shared = boot({ hash: '#/patches?balance=nerf&role=support', api: patchApi() });
  await patchesReady(shared);
  assert.deepEqual(cardNames(shared.document), ['Ana', 'Doctrine']);
  assert.equal(chip(shared.document, 'Nerfs Only').getAttribute('aria-pressed'), 'true');
  click(buttonByName(shared.document, /Reset filters/));
  await until(() => cardNames(shared.document).length === 27, 'all cards back');
  await until(() => shared.window.location.hash === '#/patches', 'clean URL');
  shared.close();
});

await test('search, change type and stat filters combine, with an empty state to recover from', async () => {
  if (!novemberPristine) return;
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  const hero = app.document.querySelector('input[placeholder="Hero name"]');
  setInput(app.window, hero, 'jetpack');
  await until(() => cardNames(app.document).join() === 'Jetpack Cat', 'hero search');
  assert.equal(app.document.activeElement === app.document.body || app.document.contains(hero), true);
  setInput(app.window, hero, '');

  setInput(app.window, app.document.querySelector('input[placeholder="Ability, perk or stat"]'), 'deflect');
  await until(() => cardNames(app.document).join() === 'Genji', 'ability search');
  setInput(app.window, app.document.querySelector('input[placeholder="Ability, perk or stat"]'), '');

  click(buttonByName(app.document, /More filters/));
  setInput(app.window, selectNamed(app.document, 'Change type'), 'perk-major');
  await until(() => cardNames(app.document).length === 3, 'major perks');
  assert.deepEqual(cardNames(app.document).sort(), ['D.Mon', 'Hanzo', 'Winston']);
  assert.match(cardFor(app.document, 'D.Mon').querySelector('.hero-card__narrowed').textContent, /Showing 1 of 5 changes/);
  await until(() => /type=perk-major/.test(app.window.location.hash), 'type in the URL');

  setInput(app.window, selectNamed(app.document, 'Change type'), 'all');
  setInput(app.window, selectNamed(app.document, 'Format'), '6v6');
  await until(() => cardNames(app.document).join() === 'Junker Queen', '6v6 only');
  setInput(app.window, selectNamed(app.document, 'Format'), 'stadium');
  await until(() => cardNames(app.document).length === 5, 'Stadium only');
  assert.equal(app.document.querySelectorAll('.result-section[data-group="standard"]').length, 0);

  setInput(app.window, selectNamed(app.document, 'Stat'), 'armor');
  await until(() => app.document.querySelector('.patch-results .state-block'), 'empty state');
  assert.match(app.document.querySelector('.patch-results .state-block').textContent, /No changes match/);
  click([...app.document.querySelectorAll('.patch-results .state-block button')][0]);
  await until(() => cardNames(app.document).length === 27, 'recovered');
  app.close();
});

await test('sorting works, and the queue filter explains itself', async () => {
  if (!novemberPristine) return;
  const app = boot({ hash: '#/patches?sort=name&format=5v5', api: patchApi() });
  await patchesReady(app);
  assert.deepEqual(cardNames(app.document).slice(0, 3), ['Ana', 'Anran', 'Baptiste']);
  setInput(app.window, selectNamed(app.document, 'Sort by'), 'nerfs');
  await until(() => cardNames(app.document)[0] === 'Doctrine', 'most nerfs first');
  setInput(app.window, selectNamed(app.document, 'Queue'), 'competitive');
  await until(() => /listed for only one queue/.test(app.document.querySelector('.patch-results').textContent), 'queue note');
  assert.ok(cardNames(app.document).length > 0);
  app.close();
});

await test('choosing a season or an older patch loads that patch, keeping results paged', async () => {
  const app = boot({ hash: '#/patches?patch=all', api: patchApi() });
  await patchesReady(app);
  await until(() => /patches selected/.test(app.document.querySelector('.patch-results__summary').textContent), 'range summary');
  await until(() => app.document.querySelectorAll('.hero-card__name').length === 36, 'first page of results');
  click(buttonByName(app.document, 'Show more'));
  await until(() => app.document.querySelectorAll('.hero-card__name').length === 72, 'second page');
  assert.ok(app.document.querySelectorAll('.result-section__date').length > 0);
  setInput(app.window, selectNamed(app.document, 'Season'), '2026-s3');
  await until(() => {
    const dates = [...app.document.querySelectorAll('.result-section__date')].map((node) => node.textContent);
    return dates.length > 0 && dates.every((date) => /Jun|Jul|Aug/.test(date));
  }, 'season 3 patches');
  assert.equal(selectNamed(app.document, 'Patch').value, 'latest');
  assert.match(selectNamed(app.document, 'Patch').options[0].textContent, /All in Season 3/);
  setInput(app.window, selectNamed(app.document, 'Patch'), '2026-06-16');
  await until(() => /June 16, 2026/.test(app.document.querySelector('.patch-hero__title').textContent), 'older patch header');
  assert.match(app.document.querySelector('.patch-hero .eyebrow').textContent, /Selected patch/);
  assert.match(app.document.querySelector('.patch-hero__verify').textContent, /Classified by rules/);
  app.close();
});

await test('the hero panel shows before, after, difference and result, then closes cleanly', async () => {
  if (!novemberPristine) return;
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  const opener = buttonByName(app.document, /Open full details for Genji/);
  opener.focus();
  click(opener);
  const dialog = await until(() => app.document.querySelector('[role="dialog"]'), 'dialog');
  await until(() => dialog.querySelector('.change-detail'), 'details');
  assert.match(app.window.location.hash, /open=genji&at=2026-11-03/);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(app.document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Genji');
  assert.ok(dialog.contains(app.document.activeElement));

  const facts = dialog.querySelector('.change-detail').textContent;
  assert.match(facts, /Duration/);
  assert.match(facts, /Previous\s*2s/);
  assert.match(facts, /New\s*1\.5s/);
  assert.match(facts, /Change\s*−25%/);
  assert.match(facts, /Classification\s*Nerf/);
  assert.match(dialog.textContent, /Blizzard's reason, summarized/);
  assert.ok([...dialog.querySelectorAll('a')].some((link) => /patch-2026-11-03$/.test(link.href)));
  assert.ok([...dialog.querySelectorAll('a')].some((link) => link.href.startsWith('https://us.forums.blizzard.com/')));
  assert.deepEqual([...dialog.querySelectorAll('.hero-drawer__group h3')].slice(0, 2).map((node) => node.textContent), ['Standard play', 'Stadium']);

  // Its history and timeline load from the other patches.
  await until(() => dialog.querySelectorAll('.hero-history__row').length > 1, 'patch history');
  await until(() => dialog.querySelector('.step-chart svg'), 'timeline');
  assert.match(dialog.querySelector('.timeline__title').textContent, /Deflect/);
  assert.ok(dialog.querySelector('.timeline__table tbody tr'));

  // Choosing an older patch keeps the panel open on that patch.
  const older = [...dialog.querySelectorAll('.hero-history__row')].find((row) => !row.classList.contains('is-current'));
  click(older);
  await until(() => !/at=2026-11-03/.test(app.window.location.hash), 'older patch in the URL');
  assert.ok(app.document.querySelector('[role="dialog"]'));

  dialog.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !app.document.querySelector('[role="dialog"]'), 'closed');
  await until(() => !/open=/.test(app.window.location.hash), 'URL restored');
  assert.equal(app.document.activeElement, opener);
  app.close();
});

await test('a link can open the panel directly, and the back button closes it', async () => {
  const direct = boot({ hash: '#/patches?open=ana&at=2026-11-03', api: patchApi() });
  const dialog = await until(() => direct.document.querySelector('[role="dialog"]'), 'dialog from a link');
  await until(() => dialog.querySelector('.change-detail'), 'details');
  assert.match(dialog.textContent, /Biotic Grenade/);
  direct.close();

  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  click(buttonByName(app.document, /Open full details for/));
  await until(() => app.document.querySelector('[role="dialog"]'), 'dialog');
  app.window.history.back();
  await until(() => !app.document.querySelector('[role="dialog"]'), 'closed by back');
  app.close();

  const missing = boot({ hash: '#/patches?open=not-a-hero', api: patchApi() });
  const empty = await until(() => missing.document.querySelector('[role="dialog"]'), 'dialog');
  await until(() => /No recorded changes/.test(empty.textContent), 'no record message');
  missing.close();
});

await test('history browses patches, compares two and shows repeated changes', async () => {
  const app = boot({ hash: '#/patches/history', api: patchApi() });
  await until(() => app.document.querySelector('.patch-row'), 'patch list');
  assert.equal(app.document.querySelectorAll('.patch-row').length, 15);
  click(buttonByName(app.document, 'Show more'));
  await until(() => app.document.querySelectorAll('.patch-row').length === 30, 'more patches');

  setInput(app.window, selectNamed(app.document, 'Season'), '2026-s3');
  await until(() => [...app.document.querySelectorAll('.patch-row__date')].every((node) => /Jun|Jul|Aug/.test(node.textContent)), 'season filter');
  await until(() => /season=2026-s3/.test(app.window.location.hash), 'season in the URL');
  const months = selectNamed(app.document, 'Month');
  assert.ok([...months.options].some((option) => /July 2026/.test(option.textContent)));
  setInput(app.window, months, '2026-07');
  await until(() => [...app.document.querySelectorAll('.patch-row__date')].every((node) => /Jul/.test(node.textContent)), 'month filter');

  // Compare two patches, defaulting to the latest pair with balance changes.
  const compare = await until(() => app.document.querySelector('.compare'), 'comparison table');
  assert.ok(compare.querySelectorAll('tbody tr').length > 0);
  const patchA = selectNamed(app.document, 'Patch A');
  setInput(app.window, patchA, '2026-08-11');
  await until(() => /a=2026-08-11/.test(app.window.location.hash), 'compare in the URL');
  await until(() => /Aug 11/.test(app.document.querySelector('.compare thead')?.textContent ?? ''), 'new column');

  // Repeated buffs and nerfs.
  const repeat = await until(() => app.document.querySelector('.repeat tbody tr'), 'repeat table');
  assert.ok(repeat);
  assert.match(app.document.querySelector('.patch-history__tools').textContent, /not how strong that hero is/);
  assert.deepEqual(app.errors, []);
  app.close();
});

await test('the hero timeline charts published values and totals only connected ones', async () => {
  const app = boot({ hash: '#/patches/history?hero=genji', api: patchApi() });
  const chart = await until(() => app.document.querySelector('.step-chart svg'), 'chart');
  assert.ok(chart.querySelector('.step-chart__line').getAttribute('d').startsWith('M'));
  await until(() => app.document.querySelector('.timeline__table tbody tr'), 'values table');
  const rows = app.document.querySelectorAll('.timeline__table tbody tr').length;
  assert.equal(chart.querySelectorAll('.step-chart__point').length, rows);
  assert.ok(chart.querySelector('.step-chart__point').getAttribute('aria-label').includes(':'));

  setInput(app.window, selectNamed(app.document, 'Ability'), 'Deflect');
  await until(() => /Deflect/.test(app.document.querySelector('.timeline__title').textContent), 'Deflect selected');
  await until(() => /series=/.test(app.window.location.hash), 'series in the URL');
  setInput(app.window, selectNamed(app.document, 'Stat'), 'standard/genji/deflect/duration');
  await until(() => /Duration/.test(app.document.querySelector('.timeline__title').textContent), 'Duration selected');
  await until(() => /2s/.test(app.document.querySelector('.timeline__table').textContent) && /1\.5s/.test(app.document.querySelector('.timeline__table').textContent), 'published values in the table');

  setInput(app.window, selectNamed(app.document, 'Hero'), 'ana');
  await until(() => /Ana/.test(app.document.querySelector('.timeline__title')?.textContent ?? ''), 'hero change');
  await until(() => /hero=ana/.test(app.window.location.hash), 'hero in the URL');
  app.close();
});

await test('a timeline gap never draws an invented connection or a total', async () => {
  const base = JSON.parse(readFileSync(path.join(PATCH_DIR, '2026-11-03.json'), 'utf8'));
  const makeLine = (id, previous, next) => ({ ...base.changes.find((change) => change.heroId === 'genji'), id, previous, next, series: 'standard/genji/deflect/duration', percentChange: null, ability: 'Deflect', stat: 'Duration', unit: 's', scope: 'standard', direction: 'nerf' });
  const patches = {
    'heroes.json': () => jsonResponse({ schema: 1, heroes: { genji: [{ patch: '2026-03-10', date: '2026-03-10', group: 'standard', classification: 'nerf', buffs: 0, nerfs: 1, other: 0, review: 0 }, { patch: '2026-08-11', date: '2026-08-11', group: 'standard', classification: 'nerf', buffs: 0, nerfs: 1, other: 0, review: 0 }] } }),
    '2026-03-10.json': () => jsonResponse({ ...base, id: '2026-03-10', date: '2026-03-10', changes: [makeLine('2026-03-10/x', 3, 2.5)] }),
    '2026-08-11.json': () => jsonResponse({ ...base, id: '2026-08-11', date: '2026-08-11', changes: [makeLine('2026-08-11/x', 2, 1.5)] }),
  };
  const app = boot({ hash: '#/patches/history?hero=genji', api: patchApi(patches) });
  const chart = await until(() => app.document.querySelector('.step-chart svg'), 'chart');
  await until(() => chart.querySelectorAll('.step-chart__point').length === 2, 'two points');
  assert.equal(chart.querySelectorAll('.step-chart__gap').length, 1);
  assert.equal((chart.querySelector('.step-chart__line').getAttribute('d').match(/M/g) ?? []).length, 2);
  assert.match(app.document.querySelector('.timeline').textContent, /Gap before this/);
  assert.match(app.document.querySelector('.timeline__total-text').textContent, /No total for this range/);
  app.close();
});

await test('load failures show an error with retry, and retry recovers', async () => {
  let indexFails = true;
  const app = boot({ hash: '#/patches', api: patchApi({ 'index.json': () => (indexFails ? jsonResponse({}, { status: 500 }) : jsonResponse(readPatchFile('index.json'))) }) });
  await until(() => /Could not load patch data/.test(app.document.querySelector('.patches')?.textContent ?? ''), 'index error');
  assert.equal(app.document.querySelectorAll('.hero-card__name').length, 0);
  indexFails = false;
  click(buttonByName(app.document, 'Try again'));
  await patchesReady(app);
  app.close();

  let patchFails = true;
  const file = '2026-11-03.json';
  const second = boot({ hash: '#/patches?patch=2026-11-03', api: patchApi({ [file]: () => (patchFails ? jsonResponse({}, { status: 503 }) : jsonResponse(readPatchFile(file))) }) });
  await until(() => /Could not load these patches/.test(second.document.querySelector('.patch-results')?.textContent ?? ''), 'patch error');
  assert.ok(second.document.querySelector('.patch-hero'), 'the header still shows');
  patchFails = false;
  click(buttonByName(second.document, 'Try again'));
  await patchesReady(second);
  second.close();
});

await test('old data is called out rather than presented as current', async () => {
  const stale = { ...readPatchFile('index.json'), lastCheckedAt: '2020-01-01T00:00:00.000Z' };
  const app = boot({ hash: '#/patches', api: patchApi({ 'index.json': () => jsonResponse(stale) }) });
  await patchesReady(app);
  assert.match(app.document.querySelector('.patch-hero__verify').textContent, /may be out of date/);
  app.close();
});

await test('the newest stored patch opens without errors, whichever it is', async () => {
  const newest = [...readPatchFile('index.json', null).patches].sort((a, b) => b.date.localeCompare(a.date))[0];
  const app = boot({ hash: '#/patches', api: patchApi({}, { asOf: null }) });
  await until(() => app.document.querySelector('.patch-hero__title')?.textContent === newest.title, `${newest.id} shown first`);
  const results = await until(() => app.document.querySelector('.patch-results[aria-busy="false"]'), 'patch loaded');
  assert.doesNotMatch(results.textContent, /Could not load/);
  assert.deepEqual(app.errors, []);
  app.close();
});

await test('other updates and bug fixes stay available from the patch view', async () => {
  if (!novemberPristine) return;
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  const toggle = await until(() => app.document.querySelector('.other-updates__toggle'), 'other updates');
  click(toggle);
  await until(() => app.document.querySelector('.other-updates__body'), 'expanded');
  const text = app.document.querySelector('.other-updates__body').textContent;
  assert.match(text, /Taking Reign/);
  assert.match(text, /Gameplay Sabotage Detection/);
  assert.match(text, /Other bug fixes/);
  assert.match(text, /El'Saka Suppressor/);
  app.close();
});

await test('the other pages are unaffected by the new section', async () => {
  const app = boot({ hash: '#/patches', api: patchApi() });
  await patchesReady(app);
  app.window.location.hash = '#/heroes';
  await until(() => app.document.querySelector('.site-nav__link.is-active').textContent === 'Heroes', 'heroes route');
  await until(() => !app.document.querySelector('.patches'), 'patch page removed');
  assert.ok(app.document.querySelector('.roster, .hero-tile, .stage, [class*="roster"]'));
  app.window.location.hash = '#/career';
  await until(() => app.document.querySelector('.site-nav__link.is-active').textContent === 'Career', 'career route');
  await until(() => !/Patch Notes/.test(app.document.title), 'title restored');
  app.window.location.hash = '#/patches/history';
  await until(() => app.document.querySelector('.patch-history'), 'back on patch history');
  assert.equal(app.document.querySelector('.patch-tabs__link.is-active').textContent.trim(), 'History and compare');
  assert.deepEqual(app.errors, []);
  app.close();
});

// Player statistics. All counts below are made up for the tests. The site only shows recorded readings.
const NOW_SECONDS = Math.floor(Date.now() / 1000);
const isoAt = (seconds) => new Date(seconds * 1000).toISOString();

function playerLatest(overrides = {}) {
  return {
    schema: 1,
    appId: 2357570,
    source: 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=2357570',
    trackingSince: isoAt(NOW_SECONDS - 40 * 86400),
    readings: 3840,
    current: { players: 45123, at: isoAt(NOW_SECONDS - 300) },
    lastAttempt: { at: isoAt(NOW_SECONDS - 300), ok: true, error: null },
    stats: {
      peak24h: { players: 57111, at: isoAt(NOW_SECONDS - 7200), coveredHours: 24 },
      change24h: { percent: 5.2, players: 2231, comparedTo: { players: 42892, at: isoAt(NOW_SECONDS - 86400) } },
      average30d: { players: 39876, hours: 700 },
      peakRecorded: { players: 61234, at: isoAt(NOW_SECONDS - 20 * 86400) },
      coverage: { hoursOf24: 24, daysTracked: 40, hoursOf720: 700 },
    },
    sparkline: [[NOW_SECONDS - 7200, 40000], [NOW_SECONDS - 3600, 43000], [NOW_SECONDS - 300, 45123]],
    ...overrides,
  };
}

const collectingLatest = () => playerLatest({
  trackingSince: isoAt(NOW_SECONDS - 3 * 3600),
  readings: 12,
  stats: { peak24h: null, change24h: null, average30d: null, peakRecorded: { players: 45123, at: isoAt(NOW_SECONDS - 300) }, coverage: { hoursOf24: 3, daysTracked: 0.1, hoursOf720: 3 } },
});

function playerHours(days, startOffset = 0) {
  const rows = [];
  const end = NOW_SECONDS - (NOW_SECONDS % 3600) - startOffset;
  for (let time = end - days * 86400; time < end; time += 3600) rows.push([time, 30000, 40000, 50000, 4]);
  return { schema: 1, hours: rows };
}

function playerRecent() {
  const rows = [];
  for (let time = NOW_SECONDS - 8 * 86400; time <= NOW_SECONDS - 300; time += 300) rows.push([time, 40000 + (time % 1000)]);
  return { schema: 1, samples: rows };
}

/** Serves the data branch's files, recording which hosts the browser contacts. */
function playerApi(files = {}, hosts = [], patchFiles = {}) {
  const served = { 'latest.json': playerLatest(), 'recent.json': playerRecent(), 'hourly.json': playerHours(40), ...files };
  const patches = patchApi(patchFiles);
  return (target, init, count) => {
    hosts.push(target.hostname);
    if (target.hostname !== 'raw.githubusercontent.com') return patches(target, init, count);
    const name = target.pathname.split('/').pop();
    const file = served[name];
    if (file === undefined) return jsonResponse({}, { status: 404 });
    return typeof file === 'function' ? file(count) : jsonResponse(file);
  };
}

const widget = (app) => app.document.querySelector('.live-strip');
const cardNamed = (document, label) => [...document.querySelectorAll('.pstat-card')].find((card) => card.querySelector('.pstat-card__label').textContent === label);
const cardValue = (document, label) => cardNamed(document, label).querySelector('.pstat-card__value').textContent;
const playersReady = (app) => until(() => app.document.querySelector('.pstat-cards .pstat-card__label'), 'player cards');

await test('the homepage widget shows the recorded count, change and peak, and opens the full page', async () => {
  const hosts = [];
  const app = boot({ storage: MOTION_OFF, api: playerApi({}, hosts) });
  const strip = await until(() => app.document.querySelector('.live-strip__now'), 'widget').then(() => widget(app));
  assert.equal(strip.tagName, 'A');
  assert.equal(strip.getAttribute('href'), '#/players');
  const text = strip.textContent;
  assert.match(text, /Steam player activity/);
  assert.match(text, /Steam only/);
  assert.match(text, /45,123/);
  assert.match(text, /Playing now/);
  assert.match(text, /\+5\.2%/);
  assert.match(text, /vs 24 hours ago/);
  assert.match(text, /57,111/);
  assert.ok(strip.querySelector('.pstat-spark path'), 'sparkline');
  assert.ok(app.document.querySelector('.randomizer__top'), 'the randomizer is still there');
  assert.equal(app.document.querySelectorAll('.hero-tile').length, 54);

  app.window.location.hash = strip.getAttribute('href');
  await playersReady(app);
  assert.equal(app.document.querySelector('.site-nav__link.is-active').textContent, 'Players');
  await until(() => /Player Statistics/.test(app.document.title), 'page title');
  assert.ok(hosts.every((host) => !/steampowered|steamdb|steamcharts/.test(host)), hosts.join());
  assert.deepEqual(app.errors, []);
  app.close();
});

await test('the widget says when figures are still collecting, and never shows a made-up number', async () => {
  const app = boot({ storage: MOTION_OFF, api: playerApi({ 'latest.json': collectingLatest() }) });
  await until(() => app.document.querySelector('.live-strip__now'), 'widget');
  const text = widget(app).textContent;
  assert.match(text, /45,123/);
  assert.match(text, /24h change: collecting/);
  assert.match(text, /24h peak:\s*collecting/);
  assert.ok(!/57,111|\+5\.2/.test(text));
  app.close();
});

await test('the homepage still works when player data is missing or failing', async () => {
  const missing = boot({ storage: MOTION_OFF, api: playerApi({ 'latest.json': undefined }) });
  await until(() => /Recording has not started yet/.test(widget(missing)?.textContent ?? ''), 'not started note');
  assert.equal(missing.document.querySelectorAll('.hero-tile').length, 54);
  missing.close();

  const failing = boot({ storage: MOTION_OFF, api: playerApi({ 'latest.json': () => jsonResponse({}, { status: 500 }) }) });
  await until(() => /unavailable right now/.test(widget(failing)?.textContent ?? ''), 'unavailable note');
  assert.ok(failing.document.querySelector('.stage'));
  failing.close();

  const garbage = boot({ storage: MOTION_OFF, api: playerApi({ 'latest.json': { schema: 1, current: { players: 'many' } } }) });
  await until(() => /unavailable right now/.test(widget(garbage)?.textContent ?? ''), 'rejected data');
  assert.ok(!/many/.test(widget(garbage).textContent));
  garbage.close();
});

await test('the page shows every statistic, labeled as Steam only', async () => {
  const app = boot({ hash: '#/players', api: playerApi() });
  await playersReady(app);
  assert.match(app.document.querySelector('.pstat-head').textContent, /Steam players only/);
  assert.match(app.document.querySelector('.pstat-head__note').textContent, /Battle\.net or consoles/);
  assert.match(cardValue(app.document, 'Playing Now'), /45,123/);
  assert.match(cardValue(app.document, '24-Hour Peak'), /57,111/);
  assert.match(cardValue(app.document, 'Recorded Peak'), /61,234/);
  assert.match(cardNamed(app.document, 'Recorded Peak').textContent, /true all-time Steam peak may be higher/);
  assert.match(cardValue(app.document, '24-Hour Change'), /\+5\.2%/);
  assert.equal(cardNamed(app.document, '24-Hour Change').querySelector('.pstat-change').dataset.trend, 'up');
  assert.match(cardNamed(app.document, '24-Hour Change').textContent, /vs 42,892 24 hours ago/);
  assert.match(cardValue(app.document, '30-Day Average'), /39,876/);
  assert.match(cardValue(app.document, 'Last Updated'), /5 min ago/);
  for (const card of app.document.querySelectorAll('.pstat-card')) {
    assert.ok(card.querySelector('.pstat-card__icon svg'), 'icon');
    const button = card.querySelector('.pstat-info__button');
    assert.match(button.getAttribute('aria-label'), /^About /);
    assert.ok(app.document.getElementById(button.getAttribute('aria-describedby')).textContent.length > 20, 'tooltip');
  }
  assert.ok(!app.document.querySelector('.pstat-banner'), 'fresh data has no stale warning');
  assert.match(app.document.querySelector('.pstat-about').textContent, /not affiliated with or endorsed by Valve/);
  assert.deepEqual(app.errors, []);
  app.close();
});

await test('a falling count shows a down arrow state', async () => {
  const latest = playerLatest();
  latest.stats.change24h = { percent: -3.4, players: -1500, comparedTo: { players: 46623, at: isoAt(NOW_SECONDS - 86400) } };
  const app = boot({ hash: '#/players', api: playerApi({ 'latest.json': latest }) });
  await playersReady(app);
  const change = cardNamed(app.document, '24-Hour Change').querySelector('.pstat-change');
  assert.equal(change.dataset.trend, 'down');
  assert.match(change.textContent, /−3\.4%/);
  assert.match(change.textContent, /decrease/);
  app.close();
});

await test('statistics without enough data say so, with progress instead of numbers', async () => {
  const app = boot({ hash: '#/players', api: playerApi({ 'latest.json': collectingLatest(), 'hourly.json': playerHours(0.1), 'recent.json': { schema: 1, samples: [[NOW_SECONDS - 1800, 44000], [NOW_SECONDS - 900, 44500], [NOW_SECONDS - 300, 45123]] } }) });
  await playersReady(app);
  assert.equal(cardValue(app.document, '24-Hour Peak'), 'Collecting');
  assert.match(cardNamed(app.document, '24-Hour Peak').textContent, /3 of the last 24 hours recorded/);
  assert.equal(cardValue(app.document, '24-Hour Change'), 'Collecting');
  assert.equal(cardValue(app.document, '30-Day Average'), 'Collecting');
  assert.match(cardNamed(app.document, '30-Day Average').textContent, /Day 1 of 30/);
  assert.equal(app.document.querySelectorAll('.pstat-progress__track').length, 2);
  assert.match(cardValue(app.document, 'Playing Now'), /45,123/);
  await until(() => /shows less than the last 24 hours/.test(app.document.querySelector('.pstat-panel').textContent), 'partial range note');
  assert.match(app.document.querySelector('.pstat-panel').textContent, /Recording began/);
  assert.match(app.document.querySelector('.pstat-compares').textContent, /Available after 48 hours/);
  assert.match(app.document.querySelector('.pstat-compares').textContent, /Available after 14 days/);
  app.close();
});

await test('old or failed readings stay on screen with a stale data warning', async () => {
  const old = playerLatest({ current: { players: 44444, at: isoAt(NOW_SECONDS - 3 * 3600) } });
  const app = boot({ hash: '#/players', api: playerApi({ 'latest.json': old }) });
  await playersReady(app);
  const banner = app.document.querySelector('.pstat-banner');
  assert.match(banner.textContent, /Stale data/);
  assert.match(banner.textContent, /No new reading has arrived recently/);
  assert.match(banner.textContent, /last valid count/);
  assert.match(cardValue(app.document, 'Playing Now'), /44,444/);
  assert.match(cardNamed(app.document, 'Playing Now').textContent, /Last valid count/);
  assert.match(cardValue(app.document, 'Last Updated'), /3 hr ago/);
  app.close();

  const failed = playerLatest({ lastAttempt: { at: isoAt(NOW_SECONDS - 60), ok: false, error: 'Steam returned HTTP 500' } });
  const second = boot({ hash: '#/players', api: playerApi({ 'latest.json': failed }) });
  await playersReady(second);
  assert.match(second.document.querySelector('.pstat-banner').textContent, /last attempt to read Steam failed/);
  assert.match(cardValue(second.document, 'Playing Now'), /45,123/);
  second.close();

  const home = boot({ storage: MOTION_OFF, api: playerApi({ 'latest.json': old }) });
  await until(() => home.document.querySelector('.live-strip__stale'), 'stale on the widget');
  assert.match(widget(home).textContent, /Stale data/);
  assert.match(widget(home).textContent, /44,444/);
  home.close();
});

await test('the page explains an empty store and recovers from a failed load', async () => {
  const empty = boot({ hash: '#/players', api: playerApi({ 'latest.json': undefined }) });
  await until(() => /Recording has not started yet/.test(empty.document.querySelector('.pstat-page')?.textContent ?? ''), 'empty state');
  assert.equal(empty.document.querySelectorAll('.pstat-card__label').length, 0);
  empty.close();

  let fail = true;
  const app = boot({ hash: '#/players', api: playerApi({ 'latest.json': () => (fail ? jsonResponse({}, { status: 503 }) : jsonResponse(playerLatest())) }) });
  await until(() => /Could not load player data/.test(app.document.querySelector('.pstat-page')?.textContent ?? ''), 'error state');
  fail = false;
  click(buttonByName(app.document, 'Try again'));
  await playersReady(app);
  assert.match(cardValue(app.document, 'Playing Now'), /45,123/);
  app.close();
});

await test('ranges and chart options update the URL, and a link restores them', async () => {
  const app = boot({ hash: '#/players', api: playerApi() });
  await playersReady(app);
  const chips = () => [...app.document.querySelectorAll('.pstat-chip')];
  assert.deepEqual(chips().map((chip) => chip.getAttribute('aria-label')), ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 6 months', 'Last year', 'All time']);
  assert.equal(chips()[0].getAttribute('aria-pressed'), 'true');
  click(buttonByName(app.document, 'Last 7 days'));
  await until(() => app.window.location.hash === '#/players?range=7d', 'range in the URL');
  assert.match(app.document.querySelector('.pstat-panel__sub').textContent, /last 7 days/);

  const toggle = (name) => [...app.document.querySelectorAll('.pstat-toggle')].find((label) => label.textContent.includes(name)).querySelector('input');
  click(toggle('Moving average'));
  await until(() => /average=1/.test(app.window.location.hash), 'average in the URL');
  click(toggle('Patch markers'));
  await until(() => /patches=0/.test(app.window.location.hash), 'markers off in the URL');
  click(toggle('Compare previous week'));
  await until(() => /compare=1/.test(app.window.location.hash), 'compare in the URL');
  // Comparing needs the hourly file, so the legend returns once that has loaded.
  await until(() => app.document.querySelectorAll('.pstat-legend li').length === 3, 'the legend with all three lines');
  assert.deepEqual([...app.document.querySelectorAll('.pstat-legend li')].map((item) => item.textContent), ['Players, hourly average', '6-hour average', 'Same time a week earlier']);

  click(buttonByName(app.document, 'Last 30 days'));
  await until(() => /range=30d/.test(app.window.location.hash), 'range change');
  assert.equal(toggle('Compare (24H or 7D)').disabled, true);
  app.close();

  const shared = boot({ hash: '#/players?range=90d&average=1', api: playerApi() });
  await playersReady(shared);
  await until(() => [...shared.document.querySelectorAll('.pstat-chip.is-active')].map((chip) => chip.getAttribute('aria-label')).join() === 'Last 90 days', 'restored range');
  shared.close();

  const unknown = boot({ hash: '#/players?range=forever', api: playerApi() });
  await playersReady(unknown);
  assert.equal(unknown.document.querySelector('.pstat-chip.is-active').getAttribute('aria-label'), 'Last 24 hours');
  unknown.close();
});

await test('on short ranges, the moving average needs half a window of readings five minutes apart', async () => {
  const readingsEvery = (seconds) => {
    const rows = [];
    for (let time = NOW_SECONDS - 6 * 3600; time <= NOW_SECONDS - 300; time += seconds) rows.push([time, 44000]);
    return { schema: 1, samples: rows };
  };
  const waitingNote = (app) => [...app.document.querySelectorAll('.pstat-note')].some((note) => /1-hour average starts/.test(note.textContent));
  const legend = (app) => [...app.document.querySelectorAll('.pstat-legend li')].map((item) => item.textContent);

  const regular = boot({ hash: '#/players?average=1', api: playerApi({ 'recent.json': readingsEvery(300) }) });
  await until(() => legend(regular).includes('1-hour average'), 'the average in the legend');
  assert.equal(waitingNote(regular), false);
  regular.close();

  // Readings 15 minutes apart never fill half of an hour's window.
  const sparse = boot({ hash: '#/players?average=1', api: playerApi({ 'recent.json': readingsEvery(900) }) });
  await until(() => waitingNote(sparse), 'the note that the average has not started');
  sparse.close();
});

await test('a table gives the same values as the chart, with paging', async () => {
  // 90 days over 40 days of readings gives 40 or 41 days, so there's always a second page. With 30 days, just after
  // midnight UTC there are exactly 30, and the test failed for that hour, which is when the patch sync deploys.
  const app = boot({ hash: '#/players?range=90d', api: playerApi() });
  await playersReady(app);
  const details = await until(() => app.document.querySelector('.pstat-panel .pstat-details'), 'table view');
  assert.match(details.querySelector('summary').textContent, /as a table/);
  const rows = () => details.querySelectorAll('tbody tr').length;
  await until(() => rows() === 30, 'first page');
  assert.match(details.querySelector('tbody tr').textContent, /40,000/);
  assert.match(details.querySelector('thead').textContent, /Day \(UTC\)/);
  click([...details.querySelectorAll('button')].find((button) => button.textContent === 'Show more'));
  await until(() => rows() > 30, 'next page');
  app.close();
});

await test('daily and weekly comparisons use recorded hours', async () => {
  const app = boot({ hash: '#/players', api: playerApi() });
  await playersReady(app);
  await until(() => app.document.querySelector('.pstat-compare__grid'), 'comparison');
  const text = app.document.querySelector('.pstat-compares').textContent;
  assert.match(text, /Last 24 hours vs the 24 hours before/);
  assert.match(text, /Last 7 days vs the 7 days before/);
  assert.match(text, /40,000/);
  assert.match(text, /was 40,000/);
  app.close();
});

await test('patches appear beside the chart, with comparisons but no claim of cause', async () => {
  // The newest patch is moved inside the recorded range, so this holds whenever it runs, even after weeks without a patch.
  const index = readPatchFile('index.json');
  const recent = { ...index, patches: [{ ...index.patches[0], date: isoAt(NOW_SECONDS - 5 * 86400).slice(0, 10) }, ...index.patches.slice(1)] };
  const app = boot({ hash: '#/players?range=all', api: playerApi({ 'hourly.json': playerHours(20) }, [], { 'index.json': () => jsonResponse(recent) }) });
  await playersReady(app);
  const subsection = await until(() => app.document.querySelector('.pstat-subsection tbody tr') && app.document.querySelector('.pstat-subsection'), 'patch table');
  const text = subsection.textContent;
  assert.match(text, /not that the patch caused any change/);
  assert.ok(subsection.querySelector('a[href^="#/patches?patch="]'));
  app.close();
});

await test('a history load failure stays local to the chart, and retry works', async () => {
  let fail = true;
  const app = boot({ hash: '#/players', api: playerApi({ 'recent.json': () => (fail ? jsonResponse({}, { status: 500 }) : jsonResponse(playerRecent())) }) });
  await playersReady(app);
  await until(() => /Could not load the player history/.test(app.document.querySelector('.pstat-panel').textContent), 'chart error');
  assert.match(cardValue(app.document, 'Playing Now'), /45,123/);
  fail = false;
  click(buttonByName(app.document, 'Try again'));
  await until(() => !/Could not load the player history/.test(app.document.querySelector('.pstat-panel').textContent), 'recovered');
  app.close();
});

await test('the patch page offers player activity, loading nothing until opened', async () => {
  const hosts = [];
  const app = boot({ hash: '#/patches', api: playerApi({ 'hourly.json': playerHours(3) }, hosts) });
  await patchesReady(app);
  const toggle = await until(() => app.document.querySelector('.pstat-activity__toggle'), 'collapsed section');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.match(toggle.textContent, /Player activity around this patch/);
  assert.match(toggle.textContent, /Steam only/);
  assert.ok(!hosts.includes('raw.githubusercontent.com'), 'nothing loaded while collapsed');
  click(toggle);
  await until(() => toggle.getAttribute('aria-expanded') === 'true', 'expanded');
  await until(() => hosts.includes('raw.githubusercontent.com'), 'loads when opened');
  app.close();
});

await test('patch activity is honest about patches from before recording began', async () => {
  if (!novemberPristine) return;
  const hourly = playerHours(1);
  const latest = playerLatest({ trackingSince: isoAt(NOW_SECONDS - 86400) });
  // Far enough ahead of November 3 that nothing was recorded around it.
  const future = hourly.hours.map((row) => [row[0] + 400 * 86400, row[1], row[2], row[3], row[4]]);
  const app = boot({ hash: '#/patches?patch=2026-11-03', api: playerApi({ 'latest.json': latest, 'hourly.json': { schema: 1, hours: future } }) });
  await patchesReady(app);
  click(await until(() => app.document.querySelector('.pstat-activity__toggle'), 'section'));
  const body = await until(() => {
    const node = app.document.querySelector('.pstat-activity__body');
    return /No player readings exist around this patch/.test(node?.textContent ?? '') ? node : null;
  }, 'no data message');
  assert.match(body.textContent, /Recording began/);
  assert.ok(!body.querySelector('table'));
  app.close();
});

await test('patch activity compares sampled days before and after, without claiming a cause', async () => {
  if (!novemberPristine) return;
  const released = Date.UTC(2026, 10, 3) / 1000;
  const rows = [];
  for (let time = released - 10 * 86400; time < released; time += 3600) rows.push([time, 30000, 40000, 50000, 4]);
  for (let time = released; time < released + 86400; time += 3600) rows.push([time, 99000, 99000, 99000, 4]);
  for (let time = released + 86400; time < released + 12 * 86400; time += 3600) rows.push([time, 33000, 44000, 55000, 4]);
  const latest = playerLatest({ current: { players: 45123, at: isoAt(released + 12 * 86400) } });
  const app = boot({ hash: '#/patches?patch=2026-11-03', api: playerApi({ 'latest.json': latest, 'hourly.json': { schema: 1, hours: rows } }) });
  await patchesReady(app);
  click(await until(() => app.document.querySelector('.pstat-activity__toggle'), 'section'));
  const table = await until(() => app.document.querySelector('.pstat-activity table'), 'comparison table');
  const cells = [...table.querySelectorAll('tbody tr')].map((row) => [...row.children].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(cells[0].slice(0, 2), ['1 day', '40,000']);
  assert.equal(cells[0][2], '44,000');
  assert.match(cells[0][3], /\+10\.0%/);
  assert.equal(cells[1][0], '3 days');
  assert.equal(cells[2][0], '7 days');
  assert.ok(!table.textContent.includes('99,000'), 'the release day is left out');
  const text = app.document.querySelector('.pstat-activity__body').textContent;
  assert.match(text, /does not show that the patch caused a change/);
  assert.match(text, /release day is left out/);
  app.close();
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((failure) => console.error('FAIL ' + failure));
  process.exit(1);
}
process.exit(0);
