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
    const target = new URL(url);
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

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((failure) => console.error('FAIL ' + failure));
  process.exit(1);
}
process.exit(0);
