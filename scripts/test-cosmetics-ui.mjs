// Drives the cosmetics pages in the real app, in jsdom, with made-up data served in place of the built files.
// Run with: npm run test:cosmetics-ui
import assert from 'node:assert/strict';
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
    'import.meta.env': JSON.stringify({ BASE_URL: '/OW2/', VITE_CAREER_API_URL: '', VITE_ACCOUNT_API_URL: 'https://accounts.test' }),
    'process.env.NODE_ENV': '"production"',
  },
  loader: { '.css': 'empty' },
  logLevel: 'silent',
});
const bundle = result.outputFiles[0].text;

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => lower[name.toLowerCase()] ?? null }, json: async () => body };
}

const NOW = Date.now();
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const DAY = 86400000;

const row = (over) => ({ id: 'x', name: 'X', type: 'skin', rarity: 'epic', hero: 'ana', image: null, season: null, event: null, tags: [], pools: [], prices: [], availability: 'not-listed', lastSeen: null, seen: 0, order: 0, ...over });
const CATALOG = [
  row({ id: 'skin.ana.aurora', name: 'Aurora', rarity: 'legendary', tags: ['shop'], prices: [{ amount: 1900, currency: 'coins' }], availability: 'in-shop', seen: 2, lastSeen: '2026-11-05', order: 900, season: '2026-s5', pools: ['esports'], image: 'https://catalog.blzstatic.com//a/aurora.png' }),
  row({ id: 'skin.ana.bastet', name: 'Bastet', rarity: 'epic', event: 'bastet', tags: ['event', 'limited'], order: 800 }),
  row({ id: 'skin.genji.citrine', name: 'Citrine', rarity: 'rare', hero: 'genji', tags: ['gallery'], prices: [{ amount: 75, currency: 'credits' }], availability: 'gallery', order: 700 }),
  row({ id: 'weapon-charm.double-dice', name: 'Double Dice', type: 'weapon-charm', hero: null, tags: ['battle-pass'], seen: 1, lastSeen: '2025-02-01', prices: [{ amount: 700, currency: 'coins' }], order: 600 }),
  row({ id: 'player-title.stalwart-hero', name: 'Stalwart Hero', type: 'player-title', hero: null, rarity: null, tags: ['challenge'], order: 0 }),
  row({ id: 'skin.ana.a-7000-wargod', name: 'A-7000 Wargod', rarity: 'mythic', tags: ['mythic-shop'], prices: [{ amount: 80, currency: 'prisms' }], order: 500 }),
  ...Array.from({ length: 60 }, (_, index) => row({ id: `spray.ana.spray-${index}`, name: `Spray ${String(index).padStart(2, '0')}`, type: 'spray', rarity: 'common', order: 100 - index })),
];

const META = {
  schema: 1,
  generatedAt: '2026-11-05T00:00:00.000Z',
  counts: { cosmetics: CATALOG.length, bundles: 2, rotations: 2, passes: 1, mythics: 1, campaigns: 2 },
  sources: [
    { id: 'itemshop', name: 'itemshop.gg', url: 'https://itemshop.gg/overwatch', license: 'x', lastSuccess: '2026-11-05T00:00:00Z', records: 5, note: null },
    { id: 'wiki', name: 'Overwatch Wiki', url: 'https://overwatch.wiki/', license: 'CC BY-NC-SA 3.0', lastSuccess: '2026-11-04T00:00:00Z', records: 5, note: null },
  ],
  facets: {
    heroes: [{ id: 'ana', label: 'Ana', count: 63 }, { id: 'genji', label: 'Genji', count: 1 }],
    types: [{ id: 'skin', label: 'Skins', count: 4 }, { id: 'weapon-charm', label: 'Weapon Charms', count: 1 }, { id: 'spray', label: 'Sprays', count: 60 }, { id: 'player-title', label: 'Player Titles', count: 1 }],
    rarities: [{ id: 'common', label: 'Common', count: 60 }, { id: 'rare', label: 'Rare', count: 1 }, { id: 'epic', label: 'Epic', count: 2 }, { id: 'legendary', label: 'Legendary', count: 1 }, { id: 'mythic', label: 'Mythic', count: 1 }],
    seasons: [{ id: '2026-s5', label: '2026: Season 5', count: 1 }],
    events: [{ id: 'bastet', label: "Ana's Bastet Challenge", count: 1 }],
    pools: [{ id: 'esports', label: 'E-Sports Loot Pool', count: 1 }],
    tags: [],
  },
  priceMax: 1900,
  shardCount: 64,
  shopHistoryFrom: '2026-11-03',
  shopHistoryComplete: false,
};

const BUNDLE_ITEM = (over) => ({ id: 'skin.ana.aurora', name: 'Aurora', type: 'skin', typeLabel: 'Skins · Ana', rarity: 'legendary', hero: 'ana', image: null, quantity: 1, prices: [], ...over });
const BUNDLES = [
  { id: '100', name: 'Aurora Mega Bundle', productId: 100, rarity: 'legendary', image: 'https://catalog.blzstatic.com//b/a.png', price: { amount: 2800, currency: 'Coins', label: null }, statedCount: 3, items: [BUNDLE_ITEM({}), BUNDLE_ITEM({ id: 'weapon-charm.double-dice', name: 'Double Dice', type: 'weapon-charm', typeLabel: 'Weapon Charms', hero: null, rarity: 'epic' }), BUNDLE_ITEM({ id: null, name: '20 Battle Pass Tiers', type: null, typeLabel: null, hero: null, rarity: null })], heroes: ['ana'], types: ['skin', 'weapon-charm'], status: 'active', until: iso(5 * DAY), badge: '40% off', url: 'https://us.shop.battle.net/x', firstSeen: '2026-11-03', lastSeen: '2026-11-05', seen: 1, season: null, section: 'Overwatch Shop' },
  { id: '200', name: 'Old Bundle', productId: 200, rarity: 'epic', image: null, price: { amount: 700, currency: 'Coins', label: null }, statedCount: null, items: [], heroes: [], types: [], status: 'previous', until: null, badge: null, url: null, firstSeen: '2026-10-01', lastSeen: '2026-10-10', seen: 1, season: null, section: 'Overwatch Shop' },
];

const SHOP_LISTING = (over) => ({ id: over.key ?? 'ow:bundle:100', key: 'ow:bundle:100', name: 'Aurora Mega Bundle', kind: 'bundle', typeLabel: 'Bundle 3', type: null, hero: null, rarity: 'legendary', amount: 2800, priceLabel: null, currency: 'Coins', regular: null, image: null, badge: '40% off', from: null, until: iso(5 * DAY), untilLabel: null, contents: [], statedCount: 3, soldOut: false, url: 'https://us.shop.battle.net/x', cosmeticId: null, ...over });
const RECORDED = {
  schema: 1,
  recordedAt: iso(-3600000),
  rotation: { id: 'r2', at: iso(-DAY), shopDate: '2026-11-05', count: 2, added: 1, removed: 1, exact: true },
  snapshot: {
    shopDate: '2026-11-05',
    updatedAt: iso(-3600000),
    expiresAt: iso(5 * DAY),
    stale: false,
    itemCount: 2,
    sections: [
      { title: 'Seasonal Packs', upcoming: false, endsAt: null, listings: [SHOP_LISTING({ key: 'ow:item:300', name: 'Premium Pass', kind: 'product', typeLabel: null, amount: null, badge: null, until: null, statedCount: null, rarity: null })] },
      { title: 'Overwatch Shop', upcoming: false, endsAt: iso(5 * DAY), listings: [SHOP_LISTING({})] },
    ],
  },
  changes: { previousAt: iso(-8 * DAY), added: [{ key: 'ow:bundle:100', name: 'Aurora Mega Bundle', image: null, amount: 2800, currency: 'Coins', bundle: true, href: '#/bundles/100' }], removed: [{ key: 'ow:bundle:200', name: 'Old Bundle', image: null, amount: 700, currency: 'Coins', bundle: true, href: '#/bundles/200' }] },
};

const liveItem = (over) => ({ id: 'live-1', itemKey: 'ow:bundle:400', name: 'Brand New Bundle', type: 'Bundle 2', rarity: { name: 'Epic', color: '#b45cf0' }, price: { amount: 900, label: null, currency: 'Coins', currencyIcon: null, regular: null }, images: { card: null, render: null }, badge: 'New', availability: { from: null, until: iso(2 * DAY), untilLabel: null }, bundle: null, contents: [], soldOut: false, sourceUrl: 'https://us.shop.battle.net/live', paint: null, ...over });
const LIVE = (over = {}) => ({ data: { game: 'overwatch', shopDate: '2026-11-06', updatedAt: iso(-60000), expiresAt: iso(2 * DAY), stale: false, itemCount: 1, images: [], sections: [{ title: 'Overwatch Shop', upcoming: false, endsAt: iso(2 * DAY), items: [liveItem({})] }], ...over }, meta: {} });

const DETAIL = {
  ...CATALOG[0],
  description: 'A made-up description.',
  images: ['https://catalog.blzstatic.com//a/aurora.png', 'https://catalog.blzstatic.com//a/aurora-2.png'],
  productIds: [101],
  acquisition: ['Listed at 1,900 coins'],
  bundles: ['100'],
  stays: [
    { start: iso(-DAY), end: null, price: null, currency: null, section: 'Overwatch Shop', bundle: 'Aurora Mega Bundle', source: 'recorded' },
    { start: iso(-40 * DAY), end: iso(-33 * DAY), price: 1900, currency: 'Coins', section: 'Overwatch Shop', bundle: null, source: 'recorded' },
  ],
  sources: [{ source: 'itemshop.gg', title: 'Data from itemshop.gg', url: 'https://itemshop.gg/overwatch', checkedAt: '2026-11-05' }, { source: 'Overwatch Wiki', title: 'Overwatch Wiki: Ana/Cosmetics', url: 'https://overwatch.wiki/w/Ana/Cosmetics', checkedAt: '2026-11-04' }],
  mythic: null,
  storeUrl: 'https://us.shop.battle.net/item',
};

const MYTHICS = [{ id: 'ana-a-7000-wargod', cosmeticId: 'skin.ana.a-7000-wargod', name: 'A-7000 Wargod', kind: 'skin', hero: 'ana', season: '2026-s5', image: null, options: [{ name: 'Weapon', count: 2 }, { name: 'Color', count: 3 }], prisms: 80, note: null, sources: [{ source: 'Overwatch Wiki', title: 'Mythic Skins', url: 'https://overwatch.wiki/w/Mythic_Skins', checkedAt: null }] }];
const reward = (tier, track, name, over = {}) => ({ tier, track, name, id: null, type: null, typeLabel: null, rarity: null, hero: null, image: null, quantity: null, ...over });
const PASS = { id: '2026-s5', seasonId: '2026-s5', label: '2026: Season 5', title: 'A Grim Doctrine', start: '2026-10-06', end: null, image: null, tiers: 81, rewardCount: 3, rewards: [reward(1, 'free', 'Aurora', { id: 'skin.ana.aurora', type: 'skin', rarity: 'legendary', hero: 'ana' }), reward(1, 'premium', '200 Coins'), reward(12, 'premium', 'Double Dice', { id: 'weapon-charm.double-dice', type: 'weapon-charm', rarity: 'epic' })], note: null, sources: [{ source: 'Overwatch Wiki', title: 'Battle Pass', url: 'https://overwatch.wiki/w/Battle_Pass', checkedAt: null }] };
const campaign = (id, name, start, end, over = {}) => ({ id, name, start, end, claimUntil: null, image: null, channels: [{ label: 'Overwatch streams', url: 'https://www.twitch.tv/directory/category/overwatch?filter=drops' }], channelNote: 'Any Overwatch stream.', rewards: [{ id: '30-a', name: 'River Spray', minutes: 30, type: 'spray', cosmeticId: null, image: null, note: null }, { id: '90-b', name: 'Loot Box', minutes: 90, type: null, cosmeticId: null, image: null, note: null }], url: 'https://us.forums.blizzard.com/x', sources: [{ source: 'Blizzard', title: 'Announcement', url: 'https://us.forums.blizzard.com/x', checkedAt: '2026-11-05' }], ...over });
const DROPS = [campaign('now', 'Running Campaign', iso(-DAY), iso(10 * DAY)), campaign('soon', 'Upcoming Campaign', iso(3 * DAY), iso(9 * DAY)), campaign('past', 'Finished Campaign', iso(-30 * DAY), iso(-20 * DAY))];
const POOLS = [
  { slug: 'esports', name: 'E-Sports Loot Pool', description: 'Made-up description.', basis: 'Made-up basis.', sources: [{ source: 'Blizzard', title: 'Post', url: 'https://x.test', checkedAt: null }], count: 1, confirmed: false },
  { slug: 'just-for-you', name: 'Just For You Pool', description: 'Made-up description.', basis: 'Only the game can show your own offers.', sources: [{ source: 'Blizzard', title: 'Post', url: 'https://x.test', checkedAt: null }], count: null, confirmed: false },
];
const STATS = { total: CATALOG.length, byType: META.facets.types, byRarity: META.facets.rarities, skinsByRarity: META.facets.rarities, byHero: META.facets.heroes, bySeason: [], origins: [{ id: 'shop', label: 'Seen in shop data', count: 2 }], mythics: { skins: 1, weapons: 0 }, bundles: { total: 2, active: 1, previous: 1, averageItems: 1.5 }, rotationsByMonth: [{ month: '2026-11', rotations: 2, listings: 3 }], appearancesByType: [], mostSeen: [] };
const RATES = [{ hero: 'ana', pickrate: 24.1, winrate: 45.5, banrate: null }, { hero: 'genji', pickrate: 14, winrate: 52.5, banrate: 9.6 }, { hero: 'reinhardt', pickrate: 13.6, winrate: 53.6, banrate: 3.2 }];

const FILES = {
  'meta.json': META,
  'catalog.json': CATALOG,
  'bundles.json': BUNDLES,
  'stats.json': STATS,
  'seasons.json': [{ id: '2026-s5', label: '2026: Season 5', era: 'reign-of-talon', number: 5, start: '2026-10-06', end: null, title: null }],
  'events.json': [{ id: 'bastet', label: "Ana's Bastet Challenge" }],
  'mythics.json': MYTHICS,
  'battle-passes.json': [{ ...PASS, rewards: undefined }],
  'battle-passes/2026-s5.json': PASS,
  'twitch-drops.json': DROPS,
  'loot-pools.json': POOLS,
  'shop.json': RECORDED,
  'rotations.json': [RECORDED.rotation, { id: 'r1', at: iso(-8 * DAY), shopDate: '2026-10-28', count: 1, added: 0, removed: 0, exact: true }],
};

function dataApi({ files = FILES, live = () => jsonResponse(LIVE()), rates = () => jsonResponse(RATES), account = null } = {}) {
  return (target, init) => {
    if (target.hostname === 'itemshop.gg') return live();
    if (target.hostname === 'overfast-api.tekrop.fr') return rates(target);
    if (target.hostname === 'accounts.test') return account ? account(target, init) : jsonResponse({ error: 'no' }, { status: 500 });
    const match = /\/OW2\/data\/cosmetics\/(.+)$/.exec(target.pathname);
    if (match) {
      if (/^items\//.test(match[1])) return jsonResponse(Object.fromEntries(CATALOG.map((item) => [item.id, item.id === DETAIL.id ? DETAIL : { ...item, description: null, images: [], productIds: [], acquisition: [], bundles: [], stays: [], sources: [], mythic: null, storeUrl: null }])));
      if (match[1] in files) return jsonResponse(files[match[1]]);
      return jsonResponse({}, { status: 404 });
    }
    return jsonResponse({}, { status: 404 });
  };
}

const openWindows = new Set();

function boot({ hash = '#/cosmetics', storage = {}, api = dataApi() } = {}) {
  const errors = [];
  const calls = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(String(error)));
  virtualConsole.on('error', (error) => errors.push(String(error)));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: `http://localhost/OW2/${hash}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  Object.entries(storage).forEach(([key, value]) => window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)));
  window.fetch = async (url, init) => {
    const target = new URL(url, 'http://localhost');
    calls.push({ url: target.href, init });
    return api(target, init, calls.length);
  };
  window.eval(bundle);
  openWindows.add(window);
  return {
    window,
    document: window.document,
    errors,
    calls,
    close: () => {
      openWindows.delete(window);
      window.close();
    },
  };
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

const click = (element) => element.dispatchEvent(new element.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
function setInput(window, input, value) {
  const proto = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
const text = (element) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const buttonNamed = (document, name) => [...document.querySelectorAll('button')].find((button) => (name instanceof RegExp ? name.test(text(button)) || name.test(button.getAttribute('aria-label') ?? '') : text(button) === name || button.getAttribute('aria-label') === name));
const cardNames = (document) => [...document.querySelectorAll('.cx-card__name, .cx-row__name')].map(text);
const resultCount = (document) => text(document.querySelector('.cx-results-count strong'));
const selectLabeled = (document, label) => [...document.querySelectorAll('label.select-field')].find((field) => text(field).startsWith(label))?.querySelector('select');

let passed = 0;
const failures = [];
async function test(name, run) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    await run();
    passed += 1;
  } catch (error) {
    failures.push(`${name}\n    ${error.message}`);
  }
  // A failed test can leave its page open, and an open page keeps timers running.
  for (const window of openWindows) window.close();
  openWindows.clear();
}

// Navigation and routes
await test('the header menu opens, links to every section and closes with Escape', async () => {
  const app = boot({ hash: '#/shop' });
  const toggle = await until(() => app.document.querySelector('.cx-nav__button'), 'the menu');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(toggle.classList.contains('is-active'), 'marks the section you are in');
  click(toggle);
  await until(() => toggle.getAttribute('aria-expanded') === 'true', 'the menu to open');
  const links = [...app.document.querySelectorAll('.cx-nav__link')].map((link) => link.getAttribute('href'));
  assert.deepEqual(links, ['#/cosmetics', '#/bundles', '#/shop', '#/loot-pools', '#/hub/mythics', '#/hub/battle-passes', '#/hub/twitch-drops', '#/hub/stats', '#/collection']);
  app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => toggle.getAttribute('aria-expanded') === 'false', 'the menu to close');
  app.close();
});

await test('every new route opens with no errors', async () => {
  for (const hash of ['#/cosmetics', '#/cosmetics/skin.ana.aurora', '#/bundles', '#/bundles/100', '#/shop', '#/loot-pools', '#/loot-pools/esports', '#/hub/mythics', '#/hub/mythics/ana-a-7000-wargod', '#/hub/battle-passes', '#/hub/battle-passes/2026-s5', '#/hub/twitch-drops', '#/hub/stats', '#/hub/stats?tab=heroes', '#/hub/stats?tab=collection', '#/collection', '#/collection?tab=alerts']) {
    const app = boot({ hash });
    await until(() => app.document.querySelector('h1'), `${hash} to render`);
    await wait(60);
    assert.deepEqual(app.errors, [], hash);
    assert.equal(app.document.querySelectorAll('h1').length, 1, `${hash} has one heading`);
    app.close();
  }
});

await test('the other pages still open, and only the section you visit loads its data', async () => {
  const app = boot({ hash: '#/heroes' });
  await until(() => app.document.querySelector('.roster__head'), 'the roster');
  await wait(60);
  assert.ok(!app.calls.some((call) => call.url.includes('/data/cosmetics/')), 'no cosmetics data on the heroes page');
  app.close();
});

// Gallery
await test('the gallery shows a real count, one page of results and working pages', async () => {
  const app = boot();
  await until(() => cardNames(app.document).length > 0, 'cards');
  assert.equal(resultCount(app.document), String(CATALOG.length));
  assert.equal(cardNames(app.document).length, 48);
  click(app.document.querySelector('.cx-pagination a[aria-label="Page 2"]'));
  await until(() => cardNames(app.document).length === CATALOG.length - 48, 'page 2');
  await until(() => app.window.location.hash.includes('page=2'), 'the page in the address');
  app.close();
});

await test('filters narrow immediately, combine and show in the address', async () => {
  const app = boot();
  await until(() => cardNames(app.document).length > 0, 'cards');
  setInput(app.window, selectLabeled(app.document, 'Hero'), 'ana');
  await until(() => resultCount(app.document) === '63', 'the hero filter');
  click(buttonNamed(app.document, 'Skins'));
  await until(() => resultCount(app.document) === '3', 'the type filter on top');
  setInput(app.window, selectLabeled(app.document, 'Rarity'), 'legendary');
  await until(() => resultCount(app.document) === '1', 'the rarity filter on top');
  assert.deepEqual(cardNames(app.document), ['Aurora']);
  await until(() => /hero=ana/.test(app.window.location.hash) && /type=skin/.test(app.window.location.hash) && /rarity=legendary/.test(app.window.location.hash), 'filters in the address');
  click(buttonNamed(app.document, /Reset filters/));
  await until(() => resultCount(app.document) === String(CATALOG.length), 'the reset');
  app.close();
});

await test('a shared link restores its filters', async () => {
  const app = boot({ hash: '#/cosmetics?type=spray&q=spray%2001&view=list' });
  await until(() => cardNames(app.document).length > 0, 'results');
  assert.deepEqual(cardNames(app.document), ['Spray 01']);
  assert.ok(app.document.querySelector('.cx-list'), 'list view');
  assert.equal(app.document.querySelector('.cx-toolbar input[type="search"]').value, 'spray 01');
  app.close();
});

await test('following a link with new filters updates the page', async () => {
  const app = boot({ hash: '#/cosmetics?type=spray' });
  await until(() => resultCount(app.document) === '60', 'sprays');
  app.window.location.hash = '#/cosmetics?type=weapon-charm';
  await until(() => resultCount(app.document) === '1', 'the charm');
  assert.deepEqual(cardNames(app.document), ['Double Dice']);
  app.close();
});

await test('the grid and list toggle and Random both work', async () => {
  const app = boot({ hash: '#/cosmetics?type=weapon-charm' });
  await until(() => cardNames(app.document).length === 1, 'one result');
  click(buttonNamed(app.document, 'List view'));
  await until(() => app.document.querySelector('.cx-list'), 'the list');
  click(buttonNamed(app.document, /^Random$/));
  await until(() => app.window.location.hash === '#/cosmetics/weapon-charm.double-dice', 'the random pick from these results');
  app.close();
});

await test('with no matches it says so and offers a reset', async () => {
  const app = boot({ hash: '#/cosmetics?q=nothing-like-this' });
  await until(() => app.document.querySelector('.state-block'), 'the empty state');
  assert.match(text(app.document.querySelector('.state-block')), /No cosmetics match/);
  assert.equal(resultCount(app.document), '0');
  assert.ok(buttonNamed(app.document.querySelector('.state-block'), /Reset filters/));
  app.close();
});

await test('a type with nothing imported is disabled, and a title has a text tile', async () => {
  const app = boot();
  await until(() => cardNames(app.document).length > 0, 'cards');
  assert.equal(buttonNamed(app.document, 'Souvenirs').disabled, true);
  app.close();
  const titles = boot({ hash: '#/cosmetics?type=player-title' });
  await until(() => titles.document.querySelector('.cx-thumb__text'), 'the text tile');
  assert.equal(text(titles.document.querySelector('.cx-thumb__text')), 'Stalwart Hero');
  titles.close();
});

await test('with nothing published, pages explain and invent nothing', async () => {
  const app = boot({ api: dataApi({ files: {} }) });
  await until(() => app.document.querySelector('.state-block'), 'the state block');
  assert.match(text(app.document.querySelector('.state-block')), /No cosmetics published yet/);
  assert.equal(app.document.querySelectorAll('.cx-card').length, 0);
  app.close();
});

await test('a failed load offers a retry that works', async () => {
  let fail = true;
  const base = dataApi();
  const app = boot({ api: (target, init) => (fail && target.pathname.endsWith('catalog.json') ? jsonResponse({}, { status: 500 }) : base(target, init)) });
  await until(() => app.document.querySelector('.state-block--error'), 'the error');
  fail = false;
  click(buttonNamed(app.document, 'Try again'));
  await until(() => cardNames(app.document).length > 0, 'cards after the retry');
  app.close();
});

// Marks
await test('marks persist, and mine filters use them', async () => {
  const app = boot();
  await until(() => cardNames(app.document).length > 0, 'cards');
  click(buttonNamed(app.document, 'Mark Aurora as owned'));
  click(buttonNamed(app.document, 'Add Bastet to wishlist'));
  await until(() => buttonNamed(app.document, 'Mark Aurora as owned').getAttribute('aria-pressed') === 'true', 'the mark');
  const stored = JSON.parse(app.window.localStorage.getItem('ow2.collection.v1'));
  assert.equal(stored['owned:skin.ana.aurora'][0], 1);
  assert.equal(stored['wishlist:skin.ana.bastet'][0], 1);
  app.close();

  const again = boot({ hash: '#/cosmetics?mine=owned', storage: { 'ow2.collection.v1': stored } });
  await until(() => cardNames(again.document).length > 0, 'owned cards');
  assert.deepEqual(cardNames(again.document), ['Aurora']);
  assert.equal(buttonNamed(again.document, 'Mark Aurora as owned').getAttribute('aria-pressed'), 'true');
  again.close();
});

await test('removing a mark keeps the removal, so it can reach other devices', async () => {
  const app = boot({ storage: { 'ow2.collection.v1': { 'owned:skin.ana.aurora': [1, 100] } } });
  await until(() => buttonNamed(app.document, 'Mark Aurora as owned'), 'the card');
  click(buttonNamed(app.document, 'Mark Aurora as owned'));
  await until(() => buttonNamed(app.document, 'Mark Aurora as owned').getAttribute('aria-pressed') === 'false', 'the removal');
  assert.equal(JSON.parse(app.window.localStorage.getItem('ow2.collection.v1'))['owned:skin.ana.aurora'][0], 0);
  app.close();
});

await test('a damaged saved collection doesn\'t break the page', async () => {
  const app = boot({ storage: { 'ow2.collection.v1': { 'owned:a': 'nonsense', 'bad key': [1, 1] } } });
  await until(() => cardNames(app.document).length > 0, 'cards');
  assert.deepEqual(app.errors, []);
  app.close();
  const broken = boot({ storage: { 'ow2.collection.v1': '{not json' } });
  await until(() => cardNames(broken.document).length > 0, 'cards');
  assert.deepEqual(broken.errors, []);
  broken.close();
});

// Detail page
await test('a cosmetic page shows its record and links everything related', async () => {
  const app = boot({ hash: '#/cosmetics/skin.ana.aurora' });
  await until(() => app.document.querySelector('.cx-detail__name'), 'the name');
  await until(() => app.document.querySelector('.cx-bundle__link'), 'the bundle link');
  const page = text(app.document.querySelector('.cx-page'));
  assert.equal(text(app.document.querySelector('.cx-detail__name')), 'Aurora');
  for (const piece of ['A made-up description.', '2026: Season 5', '101', '1,900 Coins', 'In the shop, on its own or in a bundle', 'Last seen in shop', 'Data from itemshop.gg', 'Overwatch Wiki']) assert.ok(page.includes(piece), piece);
  assert.equal(app.document.querySelector('.cx-bundle__link').getAttribute('href'), '#/bundles/100');
  assert.ok(app.document.querySelector('a.cx-buy').href.startsWith('https://us.shop.battle.net/'), 'official store link');
  assert.ok([...app.document.querySelectorAll('.cx-related .cx-card__link')].some((link) => link.getAttribute('href') === '#/cosmetics/skin.ana.bastet'), 'similar skins link');
  await until(() => app.document.title === 'Aurora | OW2 Hero Selector', 'the page title');
  app.close();
});

await test('shop history expands with dates, prices and how it was sold', async () => {
  const app = boot({ hash: '#/cosmetics/skin.ana.aurora' });
  const heading = await until(() => [...app.document.querySelectorAll('.cx-collapse__heading button')].find((button) => /Shop history/.test(text(button))), 'the section');
  if (heading.getAttribute('aria-expanded') === 'false') click(heading);
  const rows = await until(() => { const list = app.document.querySelectorAll('.cx-collapse table tbody tr'); return list.length ? list : null; }, 'the rows');
  assert.equal(rows.length, 2);
  assert.match(text(rows[0]), /Still listed/);
  assert.match(text(rows[0]), /In Aurora Mega Bundle/);
  assert.match(text(rows[1]), /1,900 Coins/);
  assert.match(text(app.document.querySelector('.cx-collapse__body')), /Earlier appearances aren't included/);
  app.close();
});

await test('an unknown cosmetic says so', async () => {
  const app = boot({ hash: '#/cosmetics/skin.nobody.nothing' });
  await until(() => app.document.querySelector('.state-block'), 'the state');
  assert.match(text(app.document.querySelector('.state-block')), /isn't in the catalogue/);
  app.close();
});

await test('the image opens large and closes with Escape, with focus back on its button', async () => {
  const app = boot({ hash: '#/cosmetics/skin.ana.aurora' });
  const zoom = await until(() => app.document.querySelector('.cx-zoom'), 'the image button');
  zoom.focus();
  click(zoom);
  await until(() => app.document.querySelector('.cx-lightbox'), 'the lightbox');
  assert.equal(app.document.activeElement.className, 'cx-lightbox__close');
  app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !app.document.querySelector('.cx-lightbox'), 'it to close');
  assert.equal(app.document.activeElement, app.document.querySelector('.cx-zoom'));
  app.close();
});

await test('a failed image falls back to the original, then to a placeholder', async () => {
  const app = boot({ hash: '#/cosmetics/skin.ana.aurora' });
  const image = await until(() => app.document.querySelector('.cx-detail__stage img'), 'the image');
  assert.match(image.getAttribute('src'), /^https:\/\/wsrv\.nl\//);
  image.dispatchEvent(new app.window.Event('error'));
  const original = await until(() => { const next = app.document.querySelector('.cx-detail__stage img'); return next && next.getAttribute('src').startsWith('https://catalog.blzstatic.com') ? next : null; }, 'the original');
  original.dispatchEvent(new app.window.Event('error'));
  await until(() => app.document.querySelector('.cx-detail__stage .cx-thumb--empty'), 'the placeholder');
  app.close();
});

// Bundles
await test('bundles start on what\'s in the shop, and filters keep to the address', async () => {
  const app = boot({ hash: '#/bundles' });
  await until(() => app.document.querySelector('.cx-bundle__name'), 'cards');
  assert.deepEqual([...app.document.querySelectorAll('.cx-bundle__name')].map(text), ['Aurora Mega Bundle']);
  click(buttonNamed(app.document, /Previously available/));
  await until(() => text(app.document.querySelector('.cx-bundle__name')) === 'Old Bundle', 'the previous bundle');
  await until(() => /status=previous/.test(app.window.location.hash), 'the address');
  app.close();
});

await test('a bundle page tracks owned items without claiming you own the bundle', async () => {
  const app = boot({ hash: '#/bundles/100', storage: { 'ow2.collection.v1': { 'owned:skin.ana.aurora': [1, 100] } } });
  const tracker = await until(() => app.document.querySelector('.cx-tracker'), 'the tracker');
  assert.match(text(tracker), /Collection: 1 \/ 2 items owned/);
  assert.match(text(tracker), /doesn't mean you bought this bundle/);
  assert.match(text(app.document.querySelector('.cx-bundle-hero')), /2,800 Coins/);
  assert.match(text(app.document.querySelector('.cx-bundle-hero')), /40% off/);
  click(buttonNamed(app.document, /Mark all owned/));
  await until(() => /Collection: 2 \/ 2/.test(text(app.document.querySelector('.cx-tracker'))), 'all marked');
  // Items link to their pages, and tier skips aren't a cosmetic.
  const links = [...app.document.querySelectorAll('.cx-related a.cx-card__link')].map((link) => link.getAttribute('href'));
  assert.deepEqual(links, ['#/cosmetics/skin.ana.aurora', '#/cosmetics/weapon-charm.double-dice']);
  assert.ok(text(app.document.querySelector('.cx-related')).includes('20 Battle Pass Tiers'));
  click(buttonNamed(app.document, /Weapon Charms/));
  await until(() => app.document.querySelectorAll('.cx-related .cx-card').length === 1, 'the category filter');
  app.close();
});

const STORE_ITEM = (id, name) => `https://us.shop.battle.net/en-us/family/overwatch/items/${id}/${name}`;
const opensStore = (link, url) => {
  assert.equal(link.getAttribute('href'), url);
  assert.equal(link.getAttribute('target'), '_blank', 'the site stays open');
  assert.match(link.getAttribute('rel'), /noreferrer/);
};

await test('on a bundle in the shop, clicking an item goes to that item in the store', async () => {
  const items = [
    BUNDLE_ITEM({ storeUrl: STORE_ITEM(101, 'aurora') }),
    BUNDLE_ITEM({ id: 'weapon-skin.ana.mythic', name: 'Mythic Rifle', type: 'weapon-skin', rarity: 'mythic' }),
    BUNDLE_ITEM({ id: null, name: '20 Battle Pass Tiers', type: null, typeLabel: null, hero: null, rarity: null }),
  ];
  const app = boot({ hash: '#/bundles/100', api: dataApi({ files: { ...FILES, 'bundles.json': [{ ...BUNDLES[0], items }, BUNDLES[1]] } }) });
  await until(() => app.document.querySelector('.cx-related .cx-card'), 'the items');
  const [aurora, mythic, tiers] = app.document.querySelectorAll('.cx-related .cx-card');
  opensStore(aurora.querySelector('.cx-card__link'), STORE_ITEM(101, 'aurora'));
  assert.match(text(aurora), /Buy on Battle\.net/);
  assert.equal(aurora.querySelector('.cx-track__link').getAttribute('href'), '#/cosmetics/skin.ana.aurora', 'its page here is still a click away');
  assert.equal(mythic.querySelector('.cx-card__link').getAttribute('href'), '#/cosmetics/weapon-skin.ana.mythic', 'no store page, so it opens here');
  assert.doesNotMatch(text(mythic), /Buy/);
  assert.equal(tiers.querySelector('a'), null);
  assert.match(text(app.document.querySelector('.cx-related')), /Want just one\?/);
  app.close();
});

await test('on a bundle that has left, items open here, and only what\'s still on sale offers a buy link', async () => {
  const items = [BUNDLE_ITEM({ storeUrl: STORE_ITEM(101, 'aurora') }), BUNDLE_ITEM({ id: 'skin.ana.bastet', name: 'Bastet' })];
  const app = boot({ hash: '#/bundles/200', api: dataApi({ files: { ...FILES, 'bundles.json': [BUNDLES[0], { ...BUNDLES[1], items, types: ['skin'] }] } }) });
  await until(() => app.document.querySelector('.cx-related .cx-card'), 'the items');
  const [aurora, bastet] = app.document.querySelectorAll('.cx-related .cx-card');
  assert.equal(aurora.querySelector('.cx-card__link').getAttribute('href'), '#/cosmetics/skin.ana.aurora');
  opensStore(aurora.querySelector('.cx-track__link--buy'), STORE_ITEM(101, 'aurora'));
  assert.equal(bastet.querySelector('.cx-track__link'), null);
  assert.doesNotMatch(text(app.document.querySelector('.cx-related')), /Want just one\?/);
  app.close();
});

await test('catalogue cards open here, with a buy link only on what\'s on sale', async () => {
  const catalog = CATALOG.map((row, index) => (index === 0 ? { ...row, storeUrl: STORE_ITEM(101, 'aurora') } : row));
  const app = boot({ hash: '#/cosmetics', api: dataApi({ files: { ...FILES, 'catalog.json': catalog } }) });
  await until(() => app.document.querySelector('.cx-grid .cx-card'), 'the cards');
  const cards = [...app.document.querySelectorAll('.cx-grid .cx-card')];
  const aurora = cards.find((card) => text(card.querySelector('.cx-card__name')) === catalog[0].name);
  assert.equal(aurora.querySelector('.cx-card__link').getAttribute('href'), `#/cosmetics/${catalog[0].id}`);
  const buy = aurora.querySelector('.cx-track__link--buy');
  opensStore(buy, STORE_ITEM(101, 'aurora'));
  assert.equal(buy.getAttribute('aria-label'), `Buy ${catalog[0].name} on Battle.net`);
  assert.equal(app.document.querySelectorAll('.cx-grid .cx-track__link--buy').length, 1, 'nothing else offers one');
  app.close();
});

await test('a cosmetic out of the shop, or with no store page, has no buy button', async () => {
  const app = boot({ hash: '#/cosmetics/skin.ana.bastet' });
  await until(() => app.document.querySelector('.cx-detail__name'), 'the page');
  assert.equal(app.document.querySelector('a.cx-buy'), null);
  app.close();
});

// Shop
const AURORA_CONTENT = { key: 'ow:item:101', name: 'Aurora', typeLabel: 'Skins · Ana', type: 'skin', hero: 'ana', rarity: 'legendary', image: null, quantity: 1, cosmeticId: 'skin.ana.aurora', url: STORE_ITEM(101, 'aurora') };
const shopWith = (contents, items = {}) => ({
  ...RECORDED,
  items,
  snapshot: { ...RECORDED.snapshot, sections: [{ title: 'Overwatch Shop', upcoming: false, endsAt: iso(5 * DAY), listings: [SHOP_LISTING({ contents })] }] },
});
const CHARM_CONTENT = { key: 'ow:item:102', name: 'Double Dice', typeLabel: 'Weapon Charms', type: 'weapon-charm', hero: null, rarity: 'epic', image: null, quantity: 1, cosmeticId: 'weapon-charm.double-dice', url: STORE_ITEM(102, 'double-dice') };
const TIERS_CONTENT = { key: 'ow:item:103', name: '20 Battle Pass Tiers', typeLabel: null, type: null, hero: null, rarity: null, image: null, quantity: 1, cosmeticId: null, url: null };

await test('Individual Cosmetics lists what\'s inside bundles, and a click goes to that item in the store', async () => {
  const files = { ...FILES, 'shop.json': shopWith([AURORA_CONTENT, CHARM_CONTENT, TIERS_CONTENT], { 'ow:item:101': { id: 'skin.ana.aurora', prices: [{ amount: 1900, currency: 'coins' }] }, 'ow:item:102': { id: 'weapon-charm.double-dice', prices: [{ amount: 50, currency: 'credits' }] } }) };
  const app = boot({ hash: '#/shop?show=cosmetics', api: dataApi({ files, live: () => jsonResponse({}, { status: 503 }) }) });
  await until(() => app.document.querySelector('.cx-grid .cx-card'), 'the items');
  assert.equal(app.document.querySelectorAll('.cx-bundle').length, 0, 'items, not bundles');
  assert.deepEqual(cardNames(app.document), ['Aurora', 'Double Dice'], 'tier skips aren\'t a cosmetic');
  assert.equal(resultCount(app.document), '2');
  const [aurora, charm] = app.document.querySelectorAll('.cx-grid .cx-card');
  opensStore(aurora.querySelector('.cx-card__link'), STORE_ITEM(101, 'aurora'));
  assert.match(text(aurora), /1,900 Coins/);
  assert.equal(aurora.querySelector('.cx-track__link').getAttribute('href'), '#/cosmetics/skin.ana.aurora');
  assert.ok(aurora.querySelector('.cx-track [data-mark="owned"]'), 'the marks are still there');
  assert.doesNotMatch(text(charm), /Credits/, 'the store sells in Coins, so a Credits price would be wrong here');
  app.close();
});

await test('the live shop\'s items join their catalogue records, and new ones still link to the store', async () => {
  const files = { ...FILES, 'shop.json': shopWith([AURORA_CONTENT], { 'ow:item:101': { id: 'skin.ana.aurora-canonical', prices: [{ amount: 1900, currency: 'coins' }] } }) };
  const contents = [
    { name: 'Aurora', type: 'Skins · Ana', rarity: { name: 'Legendary', color: '#fff' }, image: null, quantity: 1, itemKey: 'ow:item:101', paint: null },
    { name: 'Brand New', type: 'Skins · Ana', rarity: { name: 'Epic', color: '#fff' }, image: null, quantity: 1, itemKey: 'ow:item:999', paint: null },
  ];
  const live = () => jsonResponse(LIVE({ sections: [{ title: 'Overwatch Shop', upcoming: false, endsAt: iso(2 * DAY), items: [liveItem({ contents })] }] }));
  const app = boot({ hash: '#/shop?show=cosmetics', api: dataApi({ files, live }) });
  const cards = await until(() => { const list = [...app.document.querySelectorAll('.cx-grid .cx-card')]; return list.length === 2 && /1,900 Coins/.test(text(list[0])) ? list : null; }, 'the live items');
  assert.equal(cards[0].querySelector('.cx-track__link').getAttribute('href'), '#/cosmetics/skin.ana.aurora-canonical', 'marks and links use the catalogue\'s own id');
  opensStore(cards[1].querySelector('.cx-card__link'), STORE_ITEM(999, 'brand-new'));
  assert.doesNotMatch(text(cards[1]), /Coins/, 'no price is guessed');
  app.close();
});

await test('Individual Cosmetics filters by type, hero and search, and keeps them in the address', async () => {
  const files = { ...FILES, 'shop.json': shopWith([AURORA_CONTENT, CHARM_CONTENT]) };
  const app = boot({ hash: '#/shop?show=cosmetics', api: dataApi({ files, live: () => jsonResponse({}, { status: 503 }) }) });
  await until(() => app.document.querySelector('.cx-grid .cx-card'), 'the items');
  click(buttonNamed(app.document, /^Weapon Charms/));
  await until(() => cardNames(app.document).join() === 'Double Dice', 'the type filter');
  await until(() => app.window.location.hash === '#/shop?show=cosmetics&type=weapon-charm', 'the address');
  click(buttonNamed(app.document, 'Reset'));
  await until(() => cardNames(app.document).length === 2, 'the reset');
  setInput(app.window, selectLabeled(app.document, 'Hero'), 'ana');
  await until(() => cardNames(app.document).join() === 'Aurora', 'the hero filter');
  await until(() => app.window.location.hash === '#/shop?show=cosmetics&hero=ana', 'the address');
  click(buttonNamed(app.document, 'Reset'));
  await until(() => cardNames(app.document).length === 2, 'the reset');
  setInput(app.window, app.document.querySelector('.cx-toolbar input[type="search"]'), 'nothing like this');
  await until(() => /No items match/.test(text(app.document.querySelector('.cx-page'))), 'the empty state');
  app.close();
  const linked = boot({ hash: '#/shop?show=cosmetics&q=dice', api: dataApi({ files, live: () => jsonResponse({}, { status: 503 }) }) });
  await until(() => cardNames(linked.document).join() === 'Double Dice', 'a shared link');
  linked.close();
});

await test('a single cosmetic on the shop goes straight to the store, and a bundle opens here first', async () => {
  const alone = SHOP_LISTING({ key: 'ow:item:200', name: 'Eclypse', kind: 'cosmetic', typeLabel: 'Skin - Illari', type: 'skin', hero: 'illari', amount: 1900, badge: null, statedCount: null, url: STORE_ITEM(200, 'eclypse'), cosmeticId: 'skin.illari.eclypse' });
  const files = { ...FILES, 'shop.json': { ...RECORDED, snapshot: { ...RECORDED.snapshot, sections: [{ title: 'Overwatch Shop', upcoming: false, endsAt: iso(5 * DAY), listings: [SHOP_LISTING({}), alone] }] } } };
  const app = boot({ hash: '#/shop', api: dataApi({ files, live: () => jsonResponse({}, { status: 503 }) }) });
  const cards = await until(() => { const list = [...app.document.querySelectorAll('.cx-shop-card')]; return list.length === 2 ? list : null; }, 'the listings');
  assert.equal(cards[0].querySelector('.cx-bundle__link').getAttribute('href'), '#/bundles/100');
  assert.equal(cards[0].querySelector('.cx-shop-card__more'), null);
  opensStore(cards[1].querySelector('.cx-bundle__link'), STORE_ITEM(200, 'eclypse'));
  assert.equal(cards[1].querySelector('.cx-shop-card__more').getAttribute('href'), '#/cosmetics/skin.illari.eclypse');
  app.close();
});

await test('the live shop shows with its attribution, and new items compare with the recording', async () => {
  const app = boot({ hash: '#/shop' });
  await until(() => [...app.document.querySelectorAll('.cx-bundle__name')].some((name) => text(name) === 'Brand New Bundle'), 'the live listing');
  assert.match(text(app.document.querySelector('.cx-shop-status')), /Live/);
  const credit = app.document.querySelector('.cx-credit a');
  assert.equal(credit.getAttribute('href'), 'https://itemshop.gg/overwatch');
  assert.equal(text(credit), 'Data from itemshop.gg');
  const changes = text(app.document.querySelector('.cx-shop-changes'));
  assert.match(changes, /New 1s*Brand New Bundle/);
  assert.match(changes, /Gone 2s*Premium Passs*Aurora Mega Bundle/);
  assert.ok(app.document.querySelector('.cx-shop-card__buy').href.startsWith('https://us.shop.battle.net/'));
  assert.match(text(app.document.querySelector('.cx-countdown')), /^Ends in/);
  app.close();
});

await test('when the source can\'t be reached, the recorded shop shows and says so', async () => {
  const app = boot({ hash: '#/shop', api: dataApi({ live: () => jsonResponse({}, { status: 503 }) }) });
  await until(() => /Couldn't reach itemshop\.gg/.test(text(app.document.querySelector('.cx-page'))), 'the note');
  assert.match(text(app.document.querySelector('.cx-shop-status')), /Last recorded/);
  assert.ok([...app.document.querySelectorAll('.cx-bundle__name')].some((name) => text(name) === 'Aurora Mega Bundle'));
  assert.match(text(app.document.querySelector('.cx-shop-changes')), /New 1s*Aurora Mega Bundle.*Gone 1s*Old Bundle/);
  app.close();
});

await test('a stale answer is marked, and a damaged one falls back to the recording', async () => {
  const stale = boot({ hash: '#/shop', api: dataApi({ live: () => jsonResponse(LIVE({ stale: true })) }) });
  await until(() => /last good copy/.test(text(stale.document.querySelector('.cx-page'))), 'the stale note');
  assert.match(text(stale.document.querySelector('.cx-shop-status')), /Last recorded/);
  stale.close();
  const broken = boot({ hash: '#/shop', api: dataApi({ live: () => jsonResponse({ data: { game: 'valorant', sections: [] } }) }) });
  await until(() => /Couldn't reach itemshop\.gg/.test(text(broken.document.querySelector('.cx-page'))), 'the fallback');
  assert.ok([...broken.document.querySelectorAll('.cx-bundle__name')].some((name) => text(name) === 'Aurora Mega Bundle'));
  broken.close();
});

await test('with no recording and no source, the shop shows nothing made up', async () => {
  const files = { ...FILES };
  delete files['shop.json'];
  const app = boot({ hash: '#/shop', api: dataApi({ files, live: () => jsonResponse({}, { status: 503 }) }) });
  await until(() => /isn't available right now/.test(text(app.document.querySelector('.cx-page'))), 'the empty state');
  assert.equal(app.document.querySelectorAll('.cx-bundle').length, 0);
  app.close();
});

await test('a listing with no end time shows no countdown, and sections have their own', async () => {
  const app = boot({ hash: '#/shop', api: dataApi({ live: () => jsonResponse({}, { status: 503 }) }) });
  const card = await until(() => [...app.document.querySelectorAll('.cx-shop-card')].find((item) => /Premium Pass/.test(text(item))), 'the pass');
  assert.equal(card.querySelector('.cx-countdown'), null);
  assert.match(text(card), /No end date from the source/);
  assert.match(text(card), /See store for price/);
  const sections = [...app.document.querySelectorAll('.cx-shop-section__head')];
  assert.match(text(sections[0]), /Overwatch Shop.*Ends in/, 'a rotating section comes first');
  assert.equal(sections[1].querySelector('.cx-countdown'), null);
  app.close();
});

await test('shop groups filter, and past shops open', async () => {
  const app = boot({ hash: '#/shop?show=passes', api: dataApi({ live: () => jsonResponse({}, { status: 503 }), files: { ...FILES, 'rotations/2026-11.json': [], 'rotations/2026-10.json': [] } }) });
  const names = await until(() => { const list = [...app.document.querySelectorAll('.cx-bundle__name')]; return list.length ? list : null; }, 'the listings');
  assert.deepEqual(names.map(text), ['Premium Pass']);
  const past = [...app.document.querySelectorAll('.cx-collapse__heading button')].find((button) => /Past shops/.test(text(button)));
  click(past);
  await until(() => app.document.querySelectorAll('.cx-rotations li').length === 2, 'the past shops');
  app.close();
});

// Loot pools, mythics, passes, drops
await test('loot pools say what is and isn\'t known, and state no odds', async () => {
  const app = boot({ hash: '#/loot-pools' });
  await until(() => app.document.querySelector('.cx-pool'), 'the pools');
  const pools = [...app.document.querySelectorAll('.cx-pool')].map(text);
  assert.match(pools[0], /1 related cosmetics/);
  assert.match(pools[1], /No list published/);
  assert.match(text(app.document.querySelector('.cx-page')), /doesn't publish drop chances/);
  app.close();
  const detail = boot({ hash: '#/loot-pools/just-for-you' });
  await until(() => /isn't your personal offer/.test(text(detail.document.querySelector('.cx-page'))), 'the Just For You note');
  assert.equal(detail.document.querySelectorAll('.cx-card').length, 0, 'no list is invented');
  detail.close();
  const esports = boot({ hash: '#/loot-pools/esports' });
  await until(() => cardNames(esports.document).length > 0, 'the pool');
  assert.deepEqual(cardNames(esports.document), ['Aurora']);
  esports.close();
});

await test('a mythic shows its real options, and tracks unlocked ones', async () => {
  const app = boot({ hash: '#/hub/mythics/ana-a-7000-wargod' });
  await until(() => app.document.querySelector('.cx-option'), 'the options');
  assert.deepEqual([...app.document.querySelectorAll('.cx-option__name')].map(text), ['Weapon', 'Color']);
  assert.equal(app.document.querySelectorAll('.cx-option__choice').length, 5);
  click(buttonNamed(app.document, 'Color option 2'));
  await until(() => /1 of 5 marked/.test(text(app.document.querySelector('.cx-mythic-options'))), 'the mark');
  assert.ok(JSON.parse(app.window.localStorage.getItem('ow2.collection.v1'))['mythic:ana-a-7000-wargod/Color/2']);
  app.close();
});

await test('a Battle Pass browses by tier range, links rewards and tracks progress', async () => {
  const app = boot({ hash: '#/hub/battle-passes/2026-s5' });
  await until(() => app.document.querySelector('.cx-tier'), 'the tiers');
  assert.deepEqual([...app.document.querySelectorAll('.cx-tiers .cx-chips button')].map(text), ['1–10', '11–12']);
  assert.equal(app.document.querySelectorAll('.cx-tier').length, 1);
  const first = app.document.querySelector('.cx-tier');
  assert.equal(first.querySelector('.cx-reward a').getAttribute('href'), '#/cosmetics/skin.ana.aurora');
  assert.match(text(first), /Free/);
  assert.match(text(first), /Premium/);
  click(first.querySelector('.cx-tier__head'));
  await until(() => /50% of tiers/.test(text(app.document.querySelector('.cx-tracker'))), 'the progress');
  click(buttonNamed(app.document, '11–12'));
  await until(() => text(app.document.querySelector('.cx-tier__number')) === '12', 'the next range');
  assert.match(text(app.document.querySelector('.cx-tracker')), /can't see your in-game progress/);
  app.close();
});

await test('Twitch campaigns sort by date, with a countdown and manual claim marks', async () => {
  const app = boot({ hash: '#/hub/twitch-drops' });
  await until(() => app.document.querySelector('.cx-drop'), 'the campaigns');
  const names = [...app.document.querySelectorAll('.cx-drop__name')].map(text);
  assert.deepEqual(names, ['Running Campaign', 'Upcoming Campaign'], 'past campaigns start collapsed');
  const past = [...app.document.querySelectorAll('.cx-collapse__heading button')].find((button) => /Finished Campaign/.test(text(button)));
  assert.equal(past.getAttribute('aria-expanded'), 'false');
  const running = app.document.querySelector('.cx-drop');
  assert.match(text(running.querySelector('.cx-countdown')), /^Ends in/);
  assert.match(text(app.document.querySelectorAll('.cx-drop')[1].querySelector('.cx-countdown')), /^Starts in/);
  click(past);
  await until(() => app.document.querySelectorAll('.cx-drop').length === 3, 'the past campaign to open');
  assert.equal(app.document.querySelectorAll('.cx-drop')[2].querySelector('.cx-countdown'), null);
  assert.deepEqual([...running.querySelectorAll('.cx-drop-reward__time')].map(text), ['30 min', '1.5 hours']);
  assert.match(text(app.document.querySelector('.cx-page')), /doesn't see your Twitch account or watch time/);
  click(buttonNamed(running, 'Mark River Spray as claimed'));
  await until(() => /1 \/ 2 marked claimed/.test(text(running)), 'the claim');
  app.close();
});

// Statistics
await test('stats come from the published counts and keep sources apart', async () => {
  const app = boot({ hash: '#/hub/stats' });
  await until(() => app.document.querySelector('.cx-number__value'), 'the numbers');
  assert.equal(text(app.document.querySelector('.cx-number__value')), String(CATALOG.length));
  assert.ok(app.document.querySelector('.cx-bars li'));
  app.close();
});

await test('sources show when they last updated, and old ones are flagged', async () => {
  const old = { ...META, sources: [{ ...META.sources[0], lastSuccess: iso(-20 * DAY) }, { ...META.sources[1], lastSuccess: iso(-DAY) }] };
  const app = boot({ hash: '#/hub/stats', api: dataApi({ files: { ...FILES, 'meta.json': old } }) });
  const rows = await until(() => {
    const list = [...app.document.querySelectorAll('.cx-stat-panel table tbody tr')];
    return list.length ? list : null;
  }, 'the source table');
  assert.match(text(rows[0]), /itemshop\.gg.*May be out of date/);
  assert.doesNotMatch(text(rows[1]), /May be out of date/);
  app.close();
});

await test('until the wider import, pages say what the catalogue covers', async () => {
  const shopOnly = { ...META, sources: [META.sources[0]] };
  const files = { ...FILES, 'meta.json': shopOnly };
  const app = boot({ hash: '#/cosmetics', api: dataApi({ files }) });
  await until(() => /holds what the shop data has listed since Nov 3, 2026/.test(text(app.document.querySelector('.cx-page'))), 'the note');
  assert.doesNotMatch(text(app.document.querySelector('.cx-page')), /Overwatch Wiki/);
  app.close();
  const mythics = boot({ hash: '#/hub/mythics', api: dataApi({ files }) });
  await until(() => /only mythics in the shop data are listed/.test(text(mythics.document.querySelector('.cx-page'))), 'the mythics note');
  mythics.close();
  const full = boot({ hash: '#/cosmetics' });
  await until(() => /CC BY-NC-SA/.test(text(full.document.querySelector('.cx-page'))), 'the wiki credit');
  assert.doesNotMatch(text(full.document.querySelector('.cx-page')), /holds what the shop data/);
  full.close();
});

await test('hero rates use Blizzard\'s filters, show ban rate only in Competitive, and link back', async () => {
  const urls = [];
  const app = boot({ hash: '#/hub/stats?tab=heroes', api: dataApi({ rates: (target) => { urls.push(target.href); return jsonResponse(RATES); } }) });
  await until(() => app.document.querySelector('.cx-rates tbody tr'), 'the table');
  assert.ok(urls[0].includes('platform=pc') && urls[0].includes('gamemode=quickplay') && urls[0].includes('region=europe'));
  assert.deepEqual([...app.document.querySelectorAll('.cx-rates thead th')].map(text), ['Hero', 'Pick rate', 'Win rate']);
  assert.match(text(app.document.querySelector('.cx-rates tbody tr')), /Ana\s*24\.1%\s*45\.5%/);
  setInput(app.window, selectLabeled(app.document, 'Game mode'), 'competitive');
  await until(() => urls.some((url) => url.includes('gamemode=competitive')), 'the competitive request');
  await until(() => [...app.document.querySelectorAll('.cx-rates thead th')].map(text).includes('Ban rate'), 'the ban column');
  setInput(app.window, selectLabeled(app.document, 'Role'), 'tank');
  await until(() => app.document.querySelectorAll('.cx-rates tbody tr').length === 1, 'the role filter');
  assert.match(text(app.document.querySelector('.cx-rates tbody tr')), /Reinhardt/);
  const official = [...app.document.querySelectorAll('.cx-credit a')].find((link) => /Blizzard/.test(text(link)));
  assert.match(official.href, /rates\/\?input=PC.*rq=1/);
  await until(() => /tab=heroes/.test(app.window.location.hash) && /mode=competitive/.test(app.window.location.hash), 'the address');
  app.close();
});

await test('hero rates failing says so and retries', async () => {
  let ok = false;
  const app = boot({ hash: '#/hub/stats?tab=heroes', api: dataApi({ rates: () => (ok ? jsonResponse(RATES) : jsonResponse({}, { status: 503 })) }) });
  await until(() => app.document.querySelector('.state-block--error'), 'the error');
  ok = true;
  click(buttonNamed(app.document, 'Try again'));
  await until(() => app.document.querySelector('.cx-rates tbody tr'), 'the table');
  app.close();
});

// Collection and accounts
await test('the collection page says tracking is manual and local, and exports', async () => {
  const app = boot({ hash: '#/collection', storage: { 'ow2.collection.v1': { 'owned:skin.ana.aurora': [1, 100], 'wishlist:skin.ana.bastet': [1, 100] } } });
  await until(() => cardNames(app.document).length > 0, 'cards');
  assert.deepEqual(cardNames(app.document), ['Aurora']);
  const page = text(app.document.querySelector('.cx-page'));
  assert.match(page, /can't read your game account/);
  assert.match(page, /Saved in this browser only/);
  const wishlist = [...app.document.querySelectorAll('.cx-tabs__item')].find((link) => /Wishlist/.test(text(link)));
  assert.match(text(wishlist), /Wishlist 1/);
  app.window.location.hash = wishlist.getAttribute('href');
  await until(() => cardNames(app.document)[0] === 'Bastet', 'the wishlist');
  app.close();
});

await test('an import merges, and a wrong file changes nothing', async () => {
  const app = boot({ hash: '#/collection', storage: { 'ow2.collection.v1': { 'owned:skin.ana.aurora': [1, 100] } } });
  const input = await until(() => app.document.querySelector('.cx-data-tools input[type="file"]'), 'the file input');
  const pick = (content) => {
    const file = new app.window.File([content], 'export.json', { type: 'application/json' });
    file.text = async () => content;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  };
  pick('{"not":"ours"}');
  await until(() => /isn't a collection export|not a collection export/.test(text(app.document.querySelector('.toast'))), 'the refusal');
  assert.equal(Object.keys(JSON.parse(app.window.localStorage.getItem('ow2.collection.v1'))).length, 1);
  pick(JSON.stringify({ app: 'ow2-hero-selector-collection', schema: 1, entries: { 'owned:skin.ana.bastet': [1, 200] } }));
  await until(() => /Imported 1 change/.test(text(app.document.querySelector('.toast'))), 'the import');
  assert.ok(JSON.parse(app.window.localStorage.getItem('ow2.collection.v1'))['owned:skin.ana.bastet']);
  app.close();
});

function accountApi(state) {
  return (target, init) => {
    state.calls.push(`${init?.method ?? 'GET'} ${target.pathname}`);
    if (target.pathname === '/auth/exchange') return jsonResponse({ token: 't'.repeat(40), user: { name: 'Player One', avatar: null } });
    if (target.pathname === '/collection') return jsonResponse({ entries: { 'favorite:skin.ana.bastet': [1, 500] }, cursor: 5, more: false });
    if (target.pathname === '/collection/changes') {
      state.sent.push(JSON.parse(init.body).changes);
      return jsonResponse({ accepted: 1 });
    }
    if (target.pathname === '/auth/logout') return jsonResponse({ ok: true });
    return jsonResponse({}, { status: 404 });
  };
}

await test('signing in finishes with a one-time code, merges both ways and clears the address', async () => {
  const state = { calls: [], sent: [] };
  const app = boot({ hash: '#/collection?login=one-time-code', storage: { 'ow2.collection.v1': { 'owned:skin.ana.aurora': [1, 100] } }, api: dataApi({ account: accountApi(state) }) });
  await until(() => /Signed in as Player One/.test(text(app.document.querySelector('.cx-account'))), 'the signed-in state');
  assert.equal(app.window.location.hash, '#/collection', 'the code is gone from the address');
  await until(() => state.sent.length > 0, 'local marks sent to the account');
  assert.ok(state.sent[0]['owned:skin.ana.aurora'], 'tracking from before signing in joins the account');
  await until(() => JSON.parse(app.window.localStorage.getItem('ow2.collection.v1'))['favorite:skin.ana.bastet'], 'account marks merged in');
  assert.ok(!app.window.localStorage.getItem('ow2.account.v1').includes('one-time-code'));
  click(buttonNamed(app.document, /Sign out/));
  await until(() => /Sign in with Discord/.test(text(app.document.querySelector('.cx-account'))), 'signed out');
  assert.equal(app.window.localStorage.getItem('ow2.account.v1'), null);
  assert.ok(JSON.parse(app.window.localStorage.getItem('ow2.collection.v1'))['owned:skin.ana.aurora'], 'tracking stays in the browser');
  app.close();
});

await test('a mark made while signed in goes to the account', async () => {
  const state = { calls: [], sent: [] };
  const session = { token: 't'.repeat(40), user: { name: 'Player One', avatar: null } };
  const app = boot({ storage: { 'ow2.account.v1': session, 'ow2.account.cursor.v1': 5 }, api: dataApi({ account: accountApi(state) }) });
  const button = await until(() => buttonNamed(app.document, 'Mark Aurora as owned'), 'the card');
  click(button);
  await until(() => state.sent.some((changes) => changes['owned:skin.ana.aurora']), 'the change to be sent', 4000);
  app.close();
});

await test('an expired session falls back to local tracking with a clear message', async () => {
  const session = { token: 't'.repeat(40), user: { name: 'Player One', avatar: null } };
  const app = boot({ hash: '#/collection', storage: { 'ow2.account.v1': session, 'ow2.account.cursor.v1': 5 }, api: dataApi({ account: () => jsonResponse({ error: 'signed_out' }, { status: 401 }) }) });
  await until(() => /Sign in with Discord/.test(text(app.document.querySelector('.cx-account'))), 'the signed-out state');
  assert.match(text(app.document.querySelector('.cx-account')), /expired/);
  app.close();
});

// Alerts
await test('a watched cosmetic in the shop gets one message, once', async () => {
  const storage = { 'ow2.collection.v1': { 'notify:skin.ana.aurora': [1, 100] } };
  const app = boot({ hash: '#/bundles', storage });
  await until(() => /Aurora is in the shop now/.test(text(app.document.querySelector('.toast'))), 'the message');
  const seen = app.window.localStorage.getItem('ow2.alerts.seen.v1');
  app.close();
  const again = boot({ hash: '#/bundles', storage: { ...storage, 'ow2.alerts.seen.v1': seen } });
  await until(() => again.document.querySelector('.cx-bundle__name'), 'the page');
  await wait(100);
  assert.equal(again.document.querySelector('.toast'), null);
  again.close();
});

await test('a watched campaign near its end gets a reminder', async () => {
  const files = { ...FILES, 'twitch-drops.json': [campaign('ending', 'Ending Campaign', iso(-5 * DAY), iso(DAY))] };
  const app = boot({ hash: '#/hub/twitch-drops', storage: { 'ow2.collection.v1': { 'notify:drop-ending': [1, 100] } }, api: dataApi({ files }) });
  await until(() => /Ending Campaign/.test(text(app.document.querySelector('.toast'))), 'the reminder');
  app.close();
});

console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(failures.length > 0 ? 1 : 0);
