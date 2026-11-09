// Tests the cosmetics data model, filters, tracking, shop recorder, wiki import and catalogue build. Run with: npm run test:cosmetics
// Shop answers and wikitext here copy the shape of the real sources, with values made up for the tests.
// The real stored data lives in data/cosmetics and is checked at the end of this file.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const work = mkdtempSync(path.join(tmpdir(), 'ow2-cx-test-'));
const outfile = path.join(work, 'core.cjs');
await build({ entryPoints: ['src/features/cosmetics/core/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
const core = require(outfile);

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

// A fake itemshop.gg. Tests change `api` to decide what it answers.
const api = { fingerprint: 'fp-1', shop: null, changedAt: '2026-11-03T20:00:00.000Z', etag: 'W/"one"', calls: [], respond: null, history: {}, items: {} };
const server = http.createServer((request, response) => {
  api.calls.push({ url: request.url, headers: request.headers });
  const send = (status, body, headers = {}) => {
    response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const override = api.respond?.(request);
  if (override) return send(override.status, override.body, override.headers);
  if (request.url === '/rotations') return send(200, { data: { overwatch: { fingerprint: api.fingerprint, changedAt: api.changedAt } }, meta: {} });
  if (request.url === '/shop/overwatch') {
    if (request.headers['if-none-match'] === api.etag) return send(304);
    return send(200, api.shop, { ETag: api.etag });
  }
  if (request.url === '/history/overwatch') {
    if (!request.headers.authorization) return send(401, { error: { code: 'key_required', message: 'This endpoint needs an API key' } });
    return send(200, { data: Object.keys(api.history).sort().reverse() });
  }
  const day = /^\/history\/overwatch\/(\d{4}-\d{2}-\d{2})$/.exec(request.url);
  if (day) return send(200, { data: { date: day[1], shopDate: day[1], exact: true, shop: api.history[day[1]] } });
  const item = /^\/items\/overwatch\/(.+)$/.exec(request.url);
  if (item) {
    const stays = api.items[decodeURIComponent(item[1])];
    return stays ? send(200, { data: { item: {}, stays } }) : send(404, { error: { code: 'unknown_item', message: 'Not found' } });
  }
  return send(404, { error: { code: 'not_found', message: 'Not found' } });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.env.ITEMSHOP_API_URL = `http://127.0.0.1:${server.address().port}`;

const dataDir = path.join(work, 'data');
const outDir = path.join(work, 'out');
process.env.COSMETICS_DATA_DIR = dataDir;
process.env.COSMETICS_OUT_DIR = outDir;
delete process.env.ITEMSHOP_API_KEY;

const importScript = (name) => import(pathToFileURL(path.resolve('scripts/cosmetics', name)).href);
const { syncShop, backfillShop, request: apiRequest, mergeItems } = await importScript('itemshop.mjs');
const { buildCatalog } = await importScript('build.mjs');
const { reconcileShop } = await importScript('reconcile.mjs');
const wiki = await importScript('wiki.mjs');

const noWait = async () => {};
const resetData = () => {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  api.calls = [];
  api.respond = null;
  api.fingerprint = 'fp-1';
  api.changedAt = '2026-11-03T20:00:00.000Z';
  api.history = {};
  api.items = {};
};

const content = (name, typeLabel, rarity, key, image = `https://catalog.blzstatic.com//x/${key}.png`) => ({ name, type: typeLabel, rarity: rarity ? { name: rarity, color: '#fff' } : null, image, quantity: 1, itemKey: key, paint: null });
const listing = (over = {}) => ({
  id: 'listing-1',
  itemKey: 'ow:bundle:100',
  name: 'Test Mega Bundle',
  type: 'Bundle 3',
  rarity: { name: 'Legendary', color: '#f0a232' },
  price: { amount: 2800, label: null, currency: 'Coins', currencyIcon: null, regular: null },
  images: { card: 'https://catalog.blzstatic.com//a/bundle.png', render: null },
  badge: '40% off',
  availability: { from: null, until: '2026-11-10T19:15:00.000Z', untilLabel: null },
  bundle: null,
  contents: [content('Eve', 'Skins · Widowmaker', 'Legendary', 'ow:item:101'), content('Stellar Reload', 'Highlight Intros · Widowmaker', 'Epic', 'ow:item:102'), content('20 Battle Pass Tiers', null, null, 'ow:item:103')],
  soldOut: false,
  sourceUrl: 'https://us.shop.battle.net/en-us/family/overwatch/items/100/test',
  paint: null,
  ...over,
});
const single = listing({ id: 'listing-2', itemKey: 'ow:item:200', name: 'Eclypse', type: 'Skin - Illari', rarity: { name: 'Legendary', color: '#f0a232' }, price: { amount: 1900, label: null, currency: 'Coins', currencyIcon: null, regular: null }, badge: null, contents: [], sourceUrl: 'https://us.shop.battle.net/en-us/family/overwatch/items/200/eclypse' });
const pack = listing({ id: 'listing-3', itemKey: 'ow:item:300', name: 'Premium Battle Pass', type: null, rarity: null, price: { amount: null, label: null, currency: 'USD', currencyIcon: null, regular: null }, badge: null, contents: [], availability: { from: null, until: null, untilLabel: null } });
const shopAnswer = (sections, over = {}) => ({
  data: { game: 'overwatch', shopDate: '2026-11-05', updatedAt: '2026-11-05T00:00:00.000Z', expiresAt: '2026-11-10T19:15:00.000Z', stale: false, itemCount: 3, images: [], sections, ...over },
  meta: {},
});
const section = (title, items, over = {}) => ({ title, upcoming: false, endsAt: '2026-11-10T19:15:00.000Z', items, ...over });

// Type labels and ids
await test('type labels from the feed become a type and a hero', () => {
  assert.deepEqual(core.parseTypeLabel('Skins · D.Va'), { type: 'skin', heroName: 'D.Va' });
  assert.deepEqual(core.parseTypeLabel('Skin - Illari'), { type: 'skin', heroName: 'Illari' });
  assert.deepEqual(core.parseTypeLabel('Weapon Charms'), { type: 'weapon-charm', heroName: null });
  assert.deepEqual(core.parseTypeLabel('Name Cards · Soldier: 76'), { type: 'name-card', heroName: 'Soldier: 76' });
  assert.deepEqual(core.parseTypeLabel('Bundle 36'), { type: null, heroName: null });
  assert.deepEqual(core.parseTypeLabel('Team-Based Action Game'), { type: null, heroName: null });
  assert.deepEqual(core.parseTypeLabel(null), { type: null, heroName: null });
});

await test('hero names match with or without punctuation and accents', () => {
  assert.equal(core.heroIdFromName('D.Va'), 'dva');
  assert.equal(core.heroIdFromName('Soldier: 76'), 'soldier-76');
  assert.equal(core.heroIdFromName('Lúcio'), 'lucio');
  assert.equal(core.heroIdFromName('Lucio'), 'lucio');
  assert.equal(core.heroIdFromName('Torbjörn'), 'torbjorn');
  assert.equal(core.heroIdFromName('Jetpack Cat'), 'jetpack-cat');
  assert.equal(core.heroIdFromName('Not A Hero'), null);
});

await test('cosmetic ids are stable and keep heroes apart', () => {
  assert.equal(core.cosmeticId('skin', 'widowmaker', 'EVE'), 'skin.widowmaker.eve');
  assert.equal(core.cosmeticId('skin', 'widowmaker', 'Eve!'), 'skin.widowmaker.eve');
  assert.notEqual(core.cosmeticId('skin', 'moira', 'OWCS Crazy Raccoon 2026'), core.cosmeticId('skin', 'genji', 'OWCS Crazy Raccoon 2026'));
  assert.equal(core.cosmeticId('weapon-charm', null, 'Double Dice'), 'weapon-charm.double-dice');
  const symbols = core.cosmeticId('player-title', null, '(/°□°)/︵ ┻━┻');
  assert.match(symbols, /^player-title\.[a-z0-9-]+$/);
  assert.equal(symbols, core.cosmeticId('player-title', null, '(/°□°)/︵ ┻━┻'));
});

await test('each kind of image loads at a sensible size', () => {
  const wikiFile = 'https://overwatch.weirdgloop.org/images/Ana_Skin_Citrine.png';
  assert.equal(core.resizedImage(wikiFile, 400), 'https://overwatch.weirdgloop.org/images/thumb/Ana_Skin_Citrine.png/240px-Ana_Skin_Citrine.png', 'a card takes the wiki\'s small thumbnail');
  assert.equal(core.resizedImage(wikiFile, 200), core.resizedImage(wikiFile, 420), 'set sizes, so each thumbnail is only made once');
  assert.equal(core.resizedImage(wikiFile, 800), 'https://overwatch.weirdgloop.org/images/thumb/Ana_Skin_Citrine.png/640px-Ana_Skin_Citrine.png');
  assert.equal(core.resizedImage('https://overwatch.weirdgloop.org/images/NameCard_Acropolis.png', 400), 'https://overwatch.weirdgloop.org/images/thumb/NameCard_Acropolis.png/480px-NameCard_Acropolis.png', 'a name card needs more pixels across');
  const poster = 'https://overwatch.weirdgloop.org/images/thumb/Ana_Emote_Dance.webm/640px--Ana_Emote_Dance.webm.jpg';
  assert.equal(core.resizedImage(poster, 400), 'https://overwatch.weirdgloop.org/images/thumb/Ana_Emote_Dance.webm/240px--Ana_Emote_Dance.webm.jpg', 'a video\'s frame works the same way');
  assert.equal(core.resizedImage(poster, 800), poster);
  assert.equal(core.resizedImage('https://overwatch.weirdgloop.org/images/Lúcio_Skin.png', 400), 'https://overwatch.weirdgloop.org/images/thumb/L%C3%BAcio_Skin.png/240px-L%C3%BAcio_Skin.png', 'an accent in a name stays encoded');
  assert.equal(core.resizedImage('https://overwatch.weirdgloop.org/w/Some_Page', 400), 'https://overwatch.weirdgloop.org/w/Some_Page', 'anything else on the wiki is left alone');
  assert.match(core.resizedImage('https://catalog.blzstatic.com//a/b.png', 400), /^https:\/\/wsrv\.nl\/\?url=catalog\.blzstatic\.com/);
  assert.match(core.resizedImage('https://bnetcmsus-a.akamaihd.net/cms/gallery/X.png', 640), /^https:\/\/wsrv\.nl\/\?url=bnetcmsus-a\.akamaihd\.net%2Fcms%2Fgallery%2FX\.png&w=640/, 'an article picture on the Events page');
  assert.ok(!core.resizedImage(wikiFile, 400).includes('wsrv'), 'the wiki\'s pictures go straight to the visitor\'s browser');
  assert.equal(core.resizedImage('https://example.com/a.png', 400), 'https://example.com/a.png');
  assert.equal(core.resizedImage('not a url', 400), 'not a url');
});

await test('only https links get through', () => {
  assert.equal(core.safeUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(core.safeUrl('http://example.com/a.png'), null);
  assert.equal(core.safeUrl('javascript:alert(1)'), null);
  assert.equal(core.safeUrl('not a url'), null);
  assert.equal(core.safeUrl(5), null);
});

// Shop answers
await test('a shop answer becomes bundles, cosmetics and products', () => {
  const snapshot = core.normalizeShop(shopAnswer([section('Overwatch Shop', [listing(), single, pack])]));
  const [bundle, skin, product] = snapshot.sections[0].listings;
  assert.equal(bundle.kind, 'bundle');
  assert.equal(bundle.statedCount, 3);
  assert.equal(bundle.contents[0].cosmeticId, 'skin.widowmaker.eve');
  assert.equal(bundle.contents[2].cosmeticId, null, 'tier skips are not a cosmetic');
  assert.equal(skin.kind, 'cosmetic');
  assert.equal(skin.hero, 'illari');
  assert.equal(skin.cosmeticId, 'skin.illari.eclypse');
  assert.equal(product.kind, 'product');
  assert.equal(product.amount, null);
});

await test('store links must be Blizzard pages, and images must be https', () => {
  const snapshot = core.normalizeShop(shopAnswer([section('S', [listing({ sourceUrl: 'https://evil.example/buy', images: { card: 'http://x.test/a.png', render: null } })])]));
  assert.equal(snapshot.sections[0].listings[0].url, null);
  assert.equal(snapshot.sections[0].listings[0].image, null);
  const allowed = core.normalizeShop(shopAnswer([section('S', [listing()])]));
  assert.match(allowed.sections[0].listings[0].url, /^https:\/\/us\.shop\.battle\.net/);
});

await test('a damaged answer is refused', () => {
  for (const bad of [null, {}, { data: {} }, { data: { game: 'valorant', sections: [] } }, { data: { game: 'overwatch' } }, { data: { game: 'overwatch', sections: [{ title: 'x' }] } }, { data: { game: 'overwatch', sections: [{ title: 'x', items: [{ name: 'no id' }] }] } }]) {
    assert.throws(() => core.normalizeShop(bad), core.ShopFormatError);
  }
});

await test('negative or non-numeric prices become unknown, never a number', () => {
  const snapshot = core.normalizeShop(shopAnswer([section('S', [listing({ price: { amount: -5, currency: 'Coins' } }), listing({ id: 'b', price: { amount: '900', currency: 'Coins' } })])]));
  assert.equal(snapshot.sections[0].listings[0].amount, null);
  assert.equal(snapshot.sections[0].listings[1].amount, null);
});

await test('the fingerprint follows what is on sale, not when it was read', () => {
  const a = core.normalizeShop(shopAnswer([section('S', [listing(), single])]));
  const reread = core.normalizeShop(shopAnswer([section('S', [single, listing({ images: { card: 'https://x.test/new.png', render: null } })])], { updatedAt: '2026-11-06T00:00:00.000Z' }));
  const repriced = core.normalizeShop(shopAnswer([section('S', [listing({ price: { amount: 1, currency: 'Coins' } }), single])]));
  assert.equal(core.shopFingerprint(a), core.shopFingerprint(reread));
  assert.notEqual(core.shopFingerprint(a), core.shopFingerprint(repriced));
});

await test('differences between shops go by item, not listing', () => {
  assert.deepEqual(core.diffListings([{ key: 'a' }, { key: 'b' }], [{ key: 'b' }, { key: 'c' }]), { added: ['a'], removed: ['c'] });
});

await test('shop groups sort listings the way their labels say', () => {
  const snapshot = core.normalizeShop(shopAnswer([section('Overwatch Esports Shop', [listing(), single]), section('Seasonal Packs', [pack], { endsAt: null })]));
  const [esports, packs] = snapshot.sections;
  const group = (id) => [...esports.listings.filter((item) => core.matchesShopGroup(item, esports, id)).map((item) => item.name), ...packs.listings.filter((item) => core.matchesShopGroup(item, packs, id)).map((item) => item.name)];
  assert.deepEqual(group('bundles'), ['Test Mega Bundle']);
  assert.deepEqual(group('cosmetics'), ['Eclypse']);
  assert.deepEqual(group('offers'), ['Test Mega Bundle']);
  assert.deepEqual(group('esports'), ['Test Mega Bundle', 'Eclypse']);
  assert.deepEqual(group('passes'), ['Premium Battle Pass']);
  assert.ok(!group('limited').includes('Premium Battle Pass'), 'no end time means not limited');
});

const STORE = 'https://us.shop.battle.net/en-us/family/overwatch/items';

await test('each item has its own store page', () => {
  assert.equal(core.itemStoreUrl('ow:item:2145353', 'EVE'), `${STORE}/2145353/eve`);
  assert.equal(core.itemStoreUrl('ow:item:7', 'Lily & Providence'), `${STORE}/7/lily-and-providence`);
  assert.equal(core.itemStoreUrl('ow:item:7', '(/°□°)/'), `${STORE}/7`, 'the store doesn\'t need the name part');
  for (const key of [null, undefined, '', 'ow:bundle:7', 'listing:7:eve', 'ow:item:7:eve', 'ow:item:eve']) assert.equal(core.itemStoreUrl(key, 'Eve'), null, String(key));

  const [eve, intro, tiers] = core.normalizeShop(shopAnswer([section('S', [listing()])])).sections[0].listings[0].contents;
  assert.equal(eve.url, `${STORE}/101/eve`);
  assert.equal(intro.url, `${STORE}/102/stellar-reload`);
  assert.equal(tiers.url, null, 'tier skips aren\'t a cosmetic');
});

await test('a mythic inside a bundle has no store page of its own', () => {
  const sections = core.normalizeShop(shopAnswer([section('S', [listing({ contents: [content('Treblemaker', 'Weapon Skin · Lúcio', 'Mythic', 'ow:item:500')] })])])).sections;
  assert.equal(sections[0].listings[0].contents[0].url, null);
  assert.deepEqual(core.shopItemGroups(sections), []);
});

await test('a single cosmetic with no link from the feed still gets its page, and a bundle doesn\'t', () => {
  const [alone, whole] = core.normalizeShop(shopAnswer([section('S', [{ ...single, sourceUrl: null }, listing({ sourceUrl: null })])])).sections[0].listings;
  assert.equal(alone.url, `${STORE}/200/eclypse`);
  assert.equal(whole.url, null);
});

await test('what you can buy on its own is listed once, wherever it appears', () => {
  const second = listing({ id: 'b2', itemKey: 'ow:bundle:900', name: 'Second Bundle', contents: [content('Eve', 'Skins · Widowmaker', 'Legendary', 'ow:item:101'), content('Eclypse', 'Skins · Illari', 'Legendary', 'ow:item:200')] });
  const team = listing({ id: 'b3', itemKey: 'ow:bundle:500', name: 'Team Bundle', contents: [content('OWCS Team', 'Sprays', 'Common', 'ow:item:501'), content('Lily', 'Skins · D.Va', 'Ultra', 'ow:item:502'), content('Eve', 'Skins · Widowmaker', 'Legendary', 'ow:item:101')] });
  const later = listing({ id: 'b4', itemKey: 'ow:bundle:600', name: 'Later Bundle', contents: [content('Later', 'Skins · Ana', 'Epic', 'ow:item:601')] });
  const gone = listing({ id: 'b5', itemKey: 'ow:bundle:700', name: 'Gone Bundle', soldOut: true, contents: [content('Gone', 'Skins · Ana', 'Epic', 'ow:item:701')] });
  const { sections } = core.normalizeShop(shopAnswer([section('Shop', [listing(), second]), section('Esports', [single, team, gone]), section('Next Week', [later], { upcoming: true })]));
  const groups = core.shopItemGroups(sections);
  assert.deepEqual(groups.map(({ section: part, items }) => [part.title, items.map((item) => item.name)]), [
    ['Shop', ['Eclypse', 'Eve', 'Stellar Reload']],
    ['Esports', ['Lily', 'OWCS Team']],
  ], 'skins first, what isn\'t on sale yet or is sold out left off, and no repeats');
  const items = groups.flatMap((group) => group.items);
  const find = (name) => items.find((item) => item.name === name);
  assert.deepEqual(find('Eve').bundles, ['Test Mega Bundle', 'Second Bundle', 'Team Bundle']);
  assert.equal(find('Eve').storeUrl, `${STORE}/101/eve`);
  assert.deepEqual(find('Eve').prices, [], 'a bundle\'s price is never an item\'s price');
  assert.deepEqual(find('Eclypse').prices, [{ amount: 1900, currency: 'coins' }], 'its own listing gives its own price, even if a bundle came first');
  assert.equal(find('Eclypse').storeUrl, `${STORE}/200/eclypse`);
  assert.equal(find('Eclypse').id, 'skin.illari.eclypse');

  const names = (filters) => items.filter((item) => core.matchesShopItem(item, { q: '', hero: 'all', type: 'all', ...filters })).map((item) => item.name);
  assert.equal(names({}).length, items.length);
  assert.deepEqual(names({ type: 'spray' }), ['OWCS Team']);
  assert.deepEqual(names({ hero: 'illari' }), ['Eclypse']);
  assert.deepEqual(names({ q: 'widowmaker' }), ['Eve', 'Stellar Reload'], 'searches the hero');
  assert.deepEqual(names({ q: 'EVE wido' }), ['Eve'], 'every word has to match');
  assert.deepEqual(names({ q: 'dva' }), ['Lily'], 'a hero\'s name with a dot still matches');
  assert.deepEqual(names({ q: 'team bundle', type: 'skin' }), ['Eve', 'Lily'], 'searches the bundles it comes in');
  assert.deepEqual(names({ q: 'nothing like this' }), []);
});

await test('a countdown needs a real time', () => {
  assert.equal(core.secondsUntil(null, 0), null);
  assert.equal(core.secondsUntil('not a time', 0), null);
  assert.equal(core.secondsUntil('2026-01-01T00:01:00Z', Date.parse('2026-01-01T00:00:00Z')), 60);
  assert.equal(core.formatCountdown(5 * 86400 + 16 * 3600), '5d 16h');
  assert.equal(core.formatCountdown(3 * 3600 + 720), '3h 12m');
  assert.equal(core.formatCountdown(0), 'now');
});

// Filters
const row = (over) => ({ id: 'x', name: 'X', type: 'skin', rarity: 'epic', hero: 'ana', image: null, season: null, event: null, tags: [], pools: [], prices: [], availability: 'not-listed', lastSeen: null, seen: 0, order: 0, ...over });
const rows = [
  row({ id: 'a', name: 'Aurora', type: 'skin', rarity: 'legendary', hero: 'ana', season: '2026-s1', tags: ['shop'], prices: [{ amount: 1900, currency: 'coins' }], availability: 'in-shop', seen: 3, lastSeen: '2026-11-05', order: 300, pools: ['standard', 'esports'] }),
  row({ id: 'b', name: 'Bastet', type: 'skin', rarity: 'epic', hero: 'ana', event: 'bastet', tags: ['event', 'limited', 'challenge'], order: 100 }),
  row({ id: 'c', name: 'Citrine', type: 'skin', rarity: 'rare', hero: 'genji', tags: ['gallery'], prices: [{ amount: 75, currency: 'credits' }], availability: 'gallery', order: 200 }),
  row({ id: 'd', name: 'Double Dice', type: 'weapon-charm', rarity: 'epic', hero: null, tags: ['battle-pass'], season: 'ow2-s1', order: 50, seen: 1, lastSeen: '2025-01-01', prices: [{ amount: 700, currency: 'coins' }] }),
  row({ id: 'e', name: 'Eve Icon', type: 'player-icon', rarity: 'rare', hero: 'widowmaker', tags: ['esports'], pools: ['esports'], order: 0 }),
];
const filter = (over, context = {}) => core.applyFilters(rows, { ...core.DEFAULT_FILTERS, ...over }, context).map((item) => item.id);

await test('filters read from a link and write back the same', () => {
  const filters = { ...core.DEFAULT_FILTERS, q: 'eve', type: 'skin', rarity: 'epic', hero: 'ana', role: 'support', availability: 'previous', battlePass: true, esports: true, limited: true, pool: 'esports', event: 'winter', season: '2026-s1', mine: 'owned', currency: 'credits', min: 10, max: 900, sort: 'price-low', view: 'list', page: 3 };
  assert.deepEqual(core.parseFilters(core.serializeFilters(filters)), filters);
});

await test('defaults leave the link empty, and unknown values fall back', () => {
  assert.equal(core.serializeFilters(core.DEFAULT_FILTERS), '');
  assert.deepEqual(core.parseFilters('type=nonsense&rarity=shiny&sort=best&page=-3&min=abc&hero=%3Cscript%3E&view=cards&availability=maybe'), core.DEFAULT_FILTERS);
});

await test('search finds names, heroes and types across every category', () => {
  assert.deepEqual(filter({ q: 'aurora' }), ['a']);
  assert.deepEqual(filter({ q: 'GENJI' }), ['c']);
  assert.deepEqual(filter({ q: 'charm' }), ['d']);
  assert.deepEqual(filter({ q: 'player icon' }), ['e']);
  assert.deepEqual(filter({ q: 'ana epic' }), ['b'], 'every word must match');
  assert.deepEqual(filter({ q: 'nothing like this' }), []);
});

await test('filters combine', () => {
  assert.deepEqual(filter({ hero: 'ana', type: 'skin', rarity: 'epic' }), ['b']);
  assert.deepEqual(filter({ role: 'support', type: 'skin' }).sort(), ['a', 'b']);
  assert.deepEqual(filter({ role: 'damage' }).sort(), ['c', 'e'], 'hero role');
  assert.deepEqual(filter({ limited: true, hero: 'ana' }), ['b']);
  assert.deepEqual(filter({ esports: true }), ['e']);
  assert.deepEqual(filter({ battlePass: true }), ['d']);
  assert.deepEqual(filter({ event: 'bastet' }), ['b']);
  assert.deepEqual(filter({ season: '2026-s1' }), ['a']);
  assert.deepEqual(filter({ pool: 'esports' }).sort(), ['a', 'e'], 'one cosmetic can be in several pools');
  assert.deepEqual(filter({ pool: 'standard' }), ['a']);
  assert.deepEqual(filter({ pool: 'esports', hero: 'ana', rarity: 'rare' }), []);
});

await test('availability filters use recorded appearances', () => {
  assert.deepEqual(filter({ availability: 'in-shop' }), ['a']);
  assert.deepEqual(filter({ availability: 'previous' }), ['d'], 'seen before, not in the shop now');
  assert.deepEqual(filter({ availability: 'never-seen' }).sort(), ['b', 'c', 'e']);
  assert.deepEqual(filter({ availability: 'gallery' }), ['c']);
});

await test('collection filters use the visitor\'s marks', () => {
  const context = { isOwned: (id) => id === 'a', isWished: (id) => id === 'b', isFavorite: (id) => id === 'c' };
  assert.deepEqual(filter({ mine: 'owned' }, context), ['a']);
  assert.deepEqual(filter({ mine: 'wishlist' }, context), ['b']);
  assert.deepEqual(filter({ mine: 'favorites' }, context), ['c']);
  assert.ok(!filter({ mine: 'unowned' }, context).includes('a'));
});

await test('a price range only keeps items priced in that currency', () => {
  assert.deepEqual(filter({ min: 500, max: 1000 }), ['d']);
  assert.deepEqual(filter({ min: 1000 }), ['a']);
  assert.deepEqual(filter({ currency: 'credits', max: 100 }), ['c']);
  assert.deepEqual(filter({ max: 100 }), [], 'an item with no Coins price is not free');
});

await test('sorting is accurate, and unknown values go last in both directions', () => {
  assert.deepEqual(filter({ sort: 'newest' }), ['a', 'c', 'b', 'd', 'e']);
  assert.deepEqual(filter({ sort: 'oldest' }), ['d', 'b', 'c', 'a', 'e']);
  assert.deepEqual(filter({ sort: 'name' }), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(filter({ sort: 'rarity' }), ['a', 'b', 'd', 'c', 'e']);
  assert.deepEqual(filter({ sort: 'last-seen' }).slice(0, 2), ['a', 'd']);
  assert.deepEqual(filter({ sort: 'price-low' }).slice(0, 3), ['c', 'd', 'a']);
  assert.deepEqual(filter({ sort: 'price-high' }).slice(0, 3), ['a', 'd', 'c']);
  assert.deepEqual(filter({ sort: 'price-high' }).slice(-2).sort(), ['b', 'e']);
});

await test('pages hold their size and never run past the end', () => {
  const list = Array.from({ length: 100 }, (_, index) => index);
  assert.equal(core.pageOf(list, 1).items.length, core.PAGE_SIZE);
  assert.equal(core.pageOf(list, 3).items.length, 100 - 2 * core.PAGE_SIZE);
  assert.equal(core.pageOf(list, 99).page, 3);
  assert.equal(core.pageOf([], 1).pages, 1);
  assert.deepEqual(core.pageNumbers(5, 20), [1, null, 4, 5, 6, null, 20]);
  assert.deepEqual(core.pageNumbers(1, 3), [1, 2, 3]);
});

// Bundles
const bundleRecord = (over) => ({ id: '1', name: 'B', productId: 1, rarity: null, image: null, price: { amount: 100, currency: 'Coins', label: null }, statedCount: null, items: [], heroes: [], types: [], status: 'active', until: null, badge: null, url: null, firstSeen: null, lastSeen: null, seen: 1, season: null, section: null, ...over });

await test('bundle filters and sorting', () => {
  const bundles = [
    bundleRecord({ id: 'a', name: 'Alpha Mega Bundle', productId: 3, price: { amount: 2800, currency: 'Coins', label: null }, heroes: ['ana'], types: ['skin'] }),
    bundleRecord({ id: 'b', name: 'Beta Bundle', productId: 2, status: 'previous', price: { amount: 700, currency: 'Coins', label: null }, heroes: ['genji'], types: ['spray'], statedCount: 40 }),
    bundleRecord({ id: 'c', name: 'Real Money Pack', productId: 1, price: { amount: 39.99, currency: 'USD', label: null }, heroes: ['ana'], types: ['spray'] }),
  ];
  const run = (over) => core.applyBundleFilters(bundles, { ...core.DEFAULT_BUNDLE_FILTERS, ...over }).map((item) => item.id);
  assert.deepEqual(run({}), ['a', 'c'], 'starts on what is in the shop');
  assert.deepEqual(run({ status: 'previous' }), ['b']);
  assert.deepEqual(run({ status: 'all', hero: 'ana' }), ['a', 'c']);
  assert.deepEqual(run({ status: 'all', type: 'spray' }), ['b', 'c']);
  assert.deepEqual(run({ status: 'all', q: 'mega' }), ['a']);
  assert.deepEqual(run({ status: 'all', min: 500, max: 1000 }), ['b'], 'Coins only, so a dollar price never matches');
  assert.deepEqual(run({ status: 'all', sort: 'price-low' }), ['b', 'a', 'c']);
  assert.deepEqual(run({ status: 'all', sort: 'items' })[0], 'b');
  assert.deepEqual(core.parseBundleFilters(core.serializeBundleFilters({ ...core.DEFAULT_BUNDLE_FILTERS, status: 'all', hero: 'ana', type: 'spray', min: 5, sort: 'name', page: 2, q: 'x' })), { ...core.DEFAULT_BUNDLE_FILTERS, status: 'all', hero: 'ana', type: 'spray', min: 5, sort: 'name', page: 2, q: 'x' });
  assert.equal(core.serializeBundleFilters(core.DEFAULT_BUNDLE_FILTERS), '');
});

// Tracking
await test('the newest change to a mark wins, and a removal is kept', () => {
  const { merged, changed } = core.mergeEntries({ 'owned:a': [1, 100], 'owned:b': [0, 500], 'owned:c': [1, 100] }, { 'owned:a': [0, 200], 'owned:b': [1, 400], 'owned:d': [1, 50], 'bad key': [1, 1], 'owned:e': ['yes', 1] });
  assert.deepEqual(merged, { 'owned:a': [0, 200], 'owned:b': [0, 500], 'owned:c': [1, 100], 'owned:d': [1, 50] });
  assert.deepEqual(changed.sort(), ['owned:a', 'owned:d']);
  assert.deepEqual(core.mergeEntries({ 'owned:a': [0, 100] }, { 'owned:a': [1, 100] }).merged['owned:a'], [1, 100], 'a tie keeps the mark');
  assert.equal(core.isSet(merged, 'owned', 'a'), false);
  assert.equal(core.isSet(merged, 'owned', 'c'), true);
});

await test('an export can be imported, and anything else is refused', () => {
  const entries = { 'owned:a': [1, 100], 'tier:pass/5': [1, 200] };
  assert.deepEqual(core.parseImport(JSON.stringify(core.exportDocument(entries))), entries);
  for (const bad of ['not json', '{}', '[]', JSON.stringify({ app: 'other', schema: 1, entries: {} }), JSON.stringify({ app: core.EXPORT_APP, schema: 2, entries: {} }), JSON.stringify({ app: core.EXPORT_APP, schema: 1, entries: { 'owned:a': [1] } }), JSON.stringify({ app: core.EXPORT_APP, schema: 1, entries: { 'hack:a': [1, 1] } })]) {
    assert.throws(() => core.parseImport(bad), core.ImportError);
  }
});

await test('the bundle tracker counts only cosmetics marked as owned', () => {
  const bundle = { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: null }] };
  assert.deepEqual(core.bundleProgress(bundle, { 'owned:a': [1, 1], 'owned:b': [0, 2], 'owned:other': [1, 1] }), { done: 1, total: 3, percent: 33.3 });
});

await test('Battle Pass, mythic and drop progress', () => {
  const pass = { id: 'p', rewards: [{ tier: 1, id: 'a' }, { tier: 1, id: null }, { tier: 2, id: 'b' }, { tier: 3, id: null }] };
  const entries = { [core.entryKey('tier', core.tierId('p', 1))]: [1, 1], 'owned:b': [1, 1] };
  const result = core.passProgress(pass, entries);
  assert.deepEqual(result.tiers, { done: 1, total: 3, percent: 33.3 });
  assert.deepEqual(result.cosmetics, { done: 1, total: 2, percent: 50 });
  assert.equal(result.remaining, 1);
  const item = { id: 'm', options: [{ name: 'Weapon', count: 2 }, { name: 'Color', count: 3 }] };
  assert.deepEqual(core.mythicProgress(item, { [core.entryKey('mythic', core.mythicOptionId('m', 'Color', 2))]: [1, 1] }), { done: 1, total: 5, percent: 20 });
  const campaign = { id: 'c', rewards: [{ id: 'r1' }, { id: 'r2' }] };
  assert.deepEqual(core.dropProgress(campaign, { [core.entryKey('drop', core.dropRewardId('c', 'r2'))]: [1, 1] }), { done: 1, total: 2, percent: 50 });
});

await test('personal statistics count only marked items', () => {
  const stats = core.personalStats(rows, { 'owned:a': [1, 1], 'owned:b': [1, 1], 'owned:gone': [1, 1], 'owned:c': [0, 1], 'wishlist:d': [1, 1], 'favorite:e': [1, 1] }, { hero: (id) => id, rarity: (id) => id, type: (id) => id });
  assert.equal(stats.owned, 2);
  assert.equal(stats.unknown, 1);
  assert.equal(stats.wishlist, 1);
  assert.equal(stats.favorites, 1);
  assert.equal(stats.completion, 40);
  assert.deepEqual(stats.byHero, [{ id: 'ana', label: 'ana', count: 2 }]);
});

// Hero rates
await test('rate links match Blizzard\'s page', () => {
  assert.equal(core.officialRatesUrl(core.DEFAULT_RATE_FILTERS), 'https://overwatch.blizzard.com/en-us/rates/?input=PC&map=all-maps&region=Europe&role=All&rq=0&tier=All');
  const url = new URL(core.officialRatesUrl({ ...core.DEFAULT_RATE_FILTERS, platform: 'console', mode: 'competitive', region: 'asia', role: 'flanker', map: 'busan', division: 'gold' }));
  assert.equal(url.searchParams.get('input'), 'Console');
  assert.equal(url.searchParams.get('rq'), '1');
  assert.equal(url.searchParams.get('region'), 'Asia');
  assert.equal(url.searchParams.get('role'), 'flanker');
  assert.equal(url.searchParams.get('map'), 'busan');
  assert.equal(url.searchParams.get('tier'), 'Gold');
});

await test('rate requests carry the chosen filters, and rank only applies to Competitive', () => {
  const api = new URL(core.ratesApiUrl({ ...core.DEFAULT_RATE_FILTERS, mode: 'competitive', region: 'americas', map: 'nepal', division: 'master' }));
  assert.equal(api.searchParams.get('gamemode'), 'competitive');
  assert.equal(api.searchParams.get('region'), 'americas');
  assert.equal(api.searchParams.get('map'), 'nepal');
  assert.equal(api.searchParams.get('competitive_division'), 'master');
  assert.equal(new URL(core.ratesApiUrl({ ...core.DEFAULT_RATE_FILTERS, division: 'master' })).searchParams.get('competitive_division'), null);
});

await test('rates parse, sort and filter by role and sub-role', () => {
  const parsed = core.parseRates([{ hero: 'ana', pickrate: 24.1, winrate: 45.5, banrate: null }, { hero: 'genji', pickrate: 14, winrate: 52.5, banrate: 9.6 }, { hero: 'tracer', pickrate: 8.8, winrate: 51.6, banrate: 9.8 }, { hero: 'zarya', pickrate: 4.2, winrate: 'x', banrate: 200 }, { nothing: true }]);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[3].win, null);
  assert.equal(parsed[3].ban, null);
  assert.deepEqual(core.sortRates(parsed, 'pick', 'all').map((item) => item.hero), ['ana', 'genji', 'tracer', 'zarya']);
  assert.deepEqual(core.sortRates(parsed, 'win', 'all').map((item) => item.hero), ['genji', 'tracer', 'ana', 'zarya']);
  assert.deepEqual(core.sortRates(parsed, 'pick', 'damage').map((item) => item.hero), ['genji', 'tracer']);
  assert.deepEqual(core.sortRates(parsed, 'pick', 'support').map((item) => item.hero), ['ana']);
  assert.deepEqual(core.sortRates(parsed, 'name', 'flanker').map((item) => item.hero), ['genji', 'tracer']);
  assert.throws(() => core.parseRates({ error: 'x' }));
  assert.deepEqual(core.parseRateFilters(core.serializeRateFilters({ ...core.DEFAULT_RATE_FILTERS, mode: 'competitive', region: 'asia', role: 'medic', division: 'gold', sort: 'ban', map: 'busan', platform: 'console' })), { ...core.DEFAULT_RATE_FILTERS, mode: 'competitive', region: 'asia', role: 'medic', division: 'gold', sort: 'ban', map: 'busan', platform: 'console' });
});

// Shop recorder
const snapshotFiles = () => {
  const files = {};
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else files[path.relative(dataDir, target)] = readFileSync(target, 'utf8');
    }
  };
  walk(dataDir);
  return files;
};
const sync = (options = {}) => syncShop(core, { wait: noWait, pace: 0, now: new Date('2026-11-05T12:00:00Z'), ...options });
const readRotationsDirect = () => readFileSync(path.join(dataDir, 'shop/rotations/2026-11.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));

await test('the first read stores the shop, item details and a log line', async () => {
  resetData();
  api.shop = shopAnswer([section('Overwatch Shop', [listing(), single])]);
  const result = await sync();
  assert.equal(result.recorded, true);
  const rotations = readRotationsDirect();
  assert.equal(rotations.length, 1);
  assert.equal(rotations[0].sections[0].listings[0][0], 'ow:bundle:100');
  const items = JSON.parse(readFileSync(path.join(dataDir, 'shop/items.json'), 'utf8'));
  assert.equal(items['ow:bundle:100'].kind, 'bundle');
  assert.equal(items['ow:bundle:100'].contents.length, 3);
  assert.ok(existsSync(path.join(dataDir, 'log.jsonl')));
});

await test('a quiet check makes one request and changes nothing', async () => {
  const before = snapshotFiles();
  api.calls = [];
  const result = await sync();
  assert.equal(result.changed, false);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, '/rotations');
  assert.deepEqual(snapshotFiles(), before);
});

await test('an unchanged answer behind a new fingerprint sends the ETag and records no new shop', async () => {
  api.fingerprint = 'fp-1b';
  api.calls = [];
  const result = await sync();
  assert.equal(result.recorded, false);
  assert.equal(api.calls[1].headers['if-none-match'], api.etag);
  assert.equal(readRotationsDirect().length, 1);
});

await test('a new shop is stored, and earlier items stay known', async () => {
  api.fingerprint = 'fp-2';
  api.etag = 'W/"two"';
  api.changedAt = '2026-11-10T19:15:00.000Z';
  api.shop = shopAnswer([section('Overwatch Shop', [single, pack])]);
  const result = await sync();
  assert.equal(result.recorded, true);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.equal(readRotationsDirect().length, 2);
  const items = JSON.parse(readFileSync(path.join(dataDir, 'shop/items.json'), 'utf8'));
  assert.ok(items['ow:bundle:100'], 'an item that left is not forgotten');
});

await test('a stale answer changes nothing', async () => {
  const before = snapshotFiles();
  api.fingerprint = 'fp-3';
  api.etag = 'W/"three"';
  api.shop = shopAnswer([], { stale: true });
  const result = await sync();
  assert.equal(result.changed, false);
  assert.deepEqual(snapshotFiles(), before);
});

await test('a damaged answer fails and changes nothing', async () => {
  const before = snapshotFiles();
  api.etag = 'W/"four"';
  api.shop = { data: { game: 'overwatch', sections: [{ title: 'x', items: [{ broken: true }] }] } };
  await assert.rejects(sync(), core.ShopFormatError);
  assert.deepEqual(snapshotFiles(), before);
});

await test('an outage fails and changes nothing', async () => {
  const before = snapshotFiles();
  api.respond = () => ({ status: 503, body: { error: { code: 'shop_unavailable', message: 'Unavailable' } } });
  await assert.rejects(sync(), /Unavailable/);
  api.respond = null;
  assert.deepEqual(snapshotFiles(), before);
});

await test('a rate limit waits for as long as the source asks', async () => {
  const waits = [];
  let count = 0;
  api.respond = () => {
    count += 1;
    return count === 1 ? { status: 429, body: { error: { code: 'rate_limited', message: 'Slow down' } }, headers: { 'Retry-After': '7' } } : null;
  };
  const answer = await apiRequest('/rotations', { wait: async (ms) => waits.push(ms) });
  api.respond = null;
  assert.equal(answer.status, 200);
  assert.deepEqual(waits, [7000]);
});

await test('a refused request isn\'t retried', async () => {
  api.calls = [];
  await assert.rejects(apiRequest('/history/overwatch', { wait: noWait }), /needs an API key/);
  assert.equal(api.calls.length, 1);
});

await test('a blank value never replaces a known one', () => {
  const items = { 'ow:bundle:1': { name: 'Old', kind: 'bundle', typeLabel: 'Bundle 3', rarity: 'epic', image: 'https://x.test/a.png', statedCount: 3, url: 'https://x.test', contents: [{ key: 'k' }], firstSeen: '2026-01-01', lastSeen: '2026-01-02' } };
  const snapshot = core.normalizeShop(shopAnswer([section('S', [listing({ itemKey: 'ow:bundle:1', name: 'New Name', type: null, rarity: null, images: { card: null, render: null }, contents: [], sourceUrl: null })])]));
  mergeItems(items, snapshot, '2026-06-01');
  const item = items['ow:bundle:1'];
  assert.equal(item.name, 'New Name');
  assert.equal(item.rarity, 'epic');
  assert.equal(item.image, 'https://x.test/a.png');
  assert.deepEqual(item.contents, [{ key: 'k' }]);
  assert.equal(item.firstSeen, '2026-01-01');
  assert.equal(item.lastSeen, '2026-06-01');
});

await test('past shops need a key, which is sent only as a header', async () => {
  resetData();
  await assert.rejects(backfillShop(core, { key: null, wait: noWait }), /needs an itemshop\.gg key/);
  api.history = {
    '2026-10-01': shopAnswer([section('Overwatch Shop', [listing()])], { shopDate: '2026-10-01', updatedAt: '2026-10-01T00:00:00.000Z' }).data,
    '2026-10-08': shopAnswer([section('Overwatch Shop', [single])], { shopDate: '2026-10-08', updatedAt: '2026-10-08T00:00:00.000Z' }).data,
  };
  api.items = { 'ow:bundle:100': [{ start: '2026-10-01T00:00:00Z', end: '2026-10-08T00:00:00Z', shop: null, price: 2800, currency: null, state: 'past', days: 7 }] };
  const result = await backfillShop(core, { key: 'isg_test', wait: noWait, pace: 0, now: new Date('2026-11-05T12:00:00Z') });
  assert.equal(result.days, 2);
  assert.equal(result.added, 2);
  assert.ok(api.calls.every((call) => !call.url.includes('isg_test')), 'the key never goes in a URL');
  assert.ok(api.calls.some((call) => call.headers.authorization === 'Bearer isg_test'));
  assert.ok(!JSON.stringify(snapshotFiles()).includes('isg_test'), 'the key is never stored');
  const stays = JSON.parse(readFileSync(path.join(dataDir, 'shop/stays.json'), 'utf8'));
  assert.equal(stays.items['ow:bundle:100'][0][2], 2800);
  // Running it again adds nothing.
  assert.equal((await backfillShop(core, { key: 'isg_test', wait: noWait, pace: 0 })).added, 0);
});

// Catalogue build
const readOut = (file) => JSON.parse(readFileSync(path.join(outDir, file), 'utf8'));
const write = (file, value) => {
  const target = path.join(dataDir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value));
};
const shardFor = (id) => readOut(core.shardFile(core.shardOf(id)))[id];

async function buildTwoShops() {
  resetData();
  const second = listing({ id: 'listing-9', itemKey: 'ow:bundle:900', name: 'Second Bundle', type: 'Bundle 1', price: { amount: 700, label: null, currency: 'Coins', currencyIcon: null, regular: null }, contents: [content('Eve', 'Skins · Widowmaker', 'Legendary', 'ow:item:101')] });
  api.shop = shopAnswer([section('Overwatch Shop', [listing(), second, single])]);
  await sync();
  api.fingerprint = 'fp-2';
  api.etag = 'W/"next"';
  api.changedAt = '2026-11-10T19:15:00.000Z';
  api.shop = shopAnswer([section('Overwatch Shop', [second, pack]), section('Overwatch Esports Shop', [listing({ id: 'e1', itemKey: 'ow:bundle:500', name: 'Team Bundle', type: 'Bundle 1', contents: [content('OWCS Team', 'Sprays', 'Common', 'ow:item:501')] })])]);
  await sync();
}

await test('one cosmetic in two bundles is one record with both links', async () => {
  await buildTwoShops();
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  const catalog = readOut('catalog.json');
  assert.equal(catalog.filter((item) => item.id === 'skin.widowmaker.eve').length, 1);
  const detail = shardFor('skin.widowmaker.eve');
  assert.deepEqual(detail.bundles.sort(), ['100', '900']);
  assert.deepEqual(detail.productIds, [101]);
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length, 'no duplicates');
});

await test('every bundle item and every shop link resolves', async () => {
  const catalog = new Set(readOut('catalog.json').map((item) => item.id));
  const bundles = readOut('bundles.json');
  for (const bundle of bundles) {
    for (const item of bundle.items) {
      if (item.id) assert.ok(catalog.has(item.id), item.id);
      else assert.equal(item.type, null, `${item.name} has a type but no record`);
    }
  }
  const shop = readOut('shop.json');
  for (const part of shop.snapshot.sections) {
    for (const row of part.listings) {
      if (row.cosmeticId) assert.ok(catalog.has(row.cosmeticId));
      for (const item of row.contents) if (item.cosmeticId) assert.ok(catalog.has(item.cosmeticId));
    }
  }
  const ids = new Set(bundles.map((bundle) => bundle.id));
  for (const change of [...shop.changes.added, ...shop.changes.removed]) {
    if (change.href?.startsWith('#/bundles/')) assert.ok(ids.has(change.href.split('/').pop()));
    if (change.href?.startsWith('#/cosmetics/')) assert.ok(catalog.has(change.href.split('/').pop()));
  }
});

await test('a cosmetic has a store link only while it\'s on sale', async () => {
  const catalog = readOut('catalog.json');
  const urlOf = (id) => catalog.find((item) => item.id === id)?.storeUrl;
  assert.equal(urlOf('skin.widowmaker.eve'), `${STORE}/101/eve`, 'on sale inside a bundle');
  assert.equal(shardFor('skin.widowmaker.eve').storeUrl, `${STORE}/101/eve`);
  assert.equal(urlOf('spray.owcs-team'), `${STORE}/501/owcs-team`);
  for (const id of ['skin.illari.eclypse', 'highlight-intro.widowmaker.stellar-reload']) {
    assert.equal(urlOf(id), undefined, `${id} has left the shop`);
    assert.equal(shardFor(id).storeUrl, null, id);
  }
  const old = readOut('bundles.json').find((bundle) => bundle.id === '100');
  assert.equal(old.status, 'previous');
  const inOld = (name) => old.items.find((item) => item.name === name);
  assert.equal(inOld('Eve').storeUrl, `${STORE}/101/eve`, 'still sold through another bundle');
  assert.equal(inOld('Stellar Reload').storeUrl, undefined);
  assert.equal(inOld('20 Battle Pass Tiers').storeUrl, undefined);
  const shop = readOut('shop.json');
  const contents = shop.snapshot.sections.flatMap((part) => part.listings).find((row) => row.key === 'ow:bundle:900').contents;
  assert.equal(contents[0].url, `${STORE}/101/eve`, 'the recorded shop can list items the same way as the live one');
  assert.deepEqual(Object.keys(shop.items).sort(), ['ow:item:101', 'ow:item:501'], 'only what\'s on sale now');
  assert.equal(shop.items['ow:item:101'].id, 'skin.widowmaker.eve');
});

await test('appearances are traceable: dates, prices and how it was sold', async () => {
  const alone = shardFor('skin.illari.eclypse');
  assert.equal(alone.availability, 'not-listed', 'it left in the second shop');
  assert.equal(alone.stays.length, 1);
  assert.equal(alone.stays[0].start, '2026-11-03T20:00:00.000Z');
  assert.equal(alone.stays[0].end, '2026-11-10T19:15:00.000Z');
  assert.equal(alone.stays[0].price, 1900);
  assert.equal(alone.stays[0].currency, 'Coins');
  assert.deepEqual(alone.prices, [{ amount: 1900, currency: 'coins' }]);
  assert.equal(alone.lastSeen, '2026-11-10');
  const inBundle = shardFor('skin.widowmaker.eve');
  assert.equal(inBundle.availability, 'in-shop', 'still in the second bundle');
  assert.equal(inBundle.stays[0].bundle, 'Test Mega Bundle');
  assert.equal(inBundle.stays[0].price, null, 'a bundle price is not the price of one item');
  assert.deepEqual(inBundle.prices, []);
});

await test('bundle status and availability follow the latest shop', async () => {
  const bundles = readOut('bundles.json');
  const old = bundles.find((bundle) => bundle.id === '100');
  const current = bundles.find((bundle) => bundle.id === '900');
  assert.equal(old.status, 'previous');
  assert.equal(old.lastSeen, '2026-11-10');
  assert.equal(current.status, 'active');
  assert.equal(current.until, '2026-11-10T19:15:00.000Z');
  assert.equal(current.price.amount, 700);
  assert.equal(old.statedCount, 3);
  assert.equal(old.items.length, 3);
  assert.equal(old.items.filter((item) => item.id).length, 2, 'tier skips are listed but aren\'t a cosmetic');
});

await test('the shop file holds what changed, and history lists every shop', async () => {
  const shop = readOut('shop.json');
  assert.deepEqual(shop.changes.added.map((item) => item.name).sort(), ['Premium Battle Pass', 'Team Bundle']);
  assert.deepEqual(shop.changes.removed.map((item) => item.name).sort(), ['Eclypse', 'Test Mega Bundle']);
  const rotations = readOut('rotations.json');
  assert.equal(rotations.length, 2);
  assert.equal(rotations[0].at, '2026-11-10T19:15:00.000Z', 'newest first');
  const month = readOut('rotations/2026-11.json');
  assert.equal(month.length, 2);
  assert.ok(month[1].sections.flatMap((part) => part.listings).some((row) => row.name === 'Team Bundle'));
});

await test('statistics are counted from the catalogue', async () => {
  const stats = readOut('stats.json');
  const catalog = readOut('catalog.json');
  assert.equal(stats.total, catalog.length);
  assert.equal(stats.byType.reduce((sum, item) => sum + item.count, 0), catalog.length);
  const meta = readOut('meta.json');
  assert.equal(meta.counts.cosmetics, catalog.length);
  assert.equal(meta.counts.rotations, 2);
  assert.equal(meta.shopHistoryComplete, false);
  assert.equal(stats.bundles.total, readOut('bundles.json').length);
  assert.equal(stats.bundles.active + stats.bundles.previous, stats.bundles.total);
});

await test('esports tags come from the store\'s own section', async () => {
  assert.ok(shardFor('spray.owcs-team').tags.includes('esports'));
  assert.ok(!shardFor('skin.illari.eclypse').tags.includes('esports'));
});

await test('a build gives the same result each time', async () => {
  const when = new Date('2026-11-11T00:00:00Z');
  await buildCatalog({ now: when });
  const first = readFileSync(path.join(outDir, 'catalog.json'), 'utf8') + readFileSync(path.join(outDir, 'meta.json'), 'utf8');
  await buildCatalog({ now: when });
  assert.equal(readFileSync(path.join(outDir, 'catalog.json'), 'utf8') + readFileSync(path.join(outDir, 'meta.json'), 'utf8'), first);
});

await test('corrections are applied, and last across rebuilds', async () => {
  write('corrections.json', { rename: { 'skin.widowmaker.eve': 'skin.widowmaker.eve-corrected' }, hide: ['skin.illari.eclypse'], set: { 'skin.widowmaker.eve-corrected': { rarity: 'mythic' } } });
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  const catalog = readOut('catalog.json');
  assert.ok(!catalog.some((item) => item.id === 'skin.illari.eclypse'));
  assert.ok(!catalog.some((item) => item.id === 'skin.widowmaker.eve'));
  const fixed = catalog.find((item) => item.id === 'skin.widowmaker.eve-corrected');
  assert.ok(fixed);
  assert.equal(shardFor('skin.widowmaker.eve-corrected').rarity, 'mythic');
  const bundle = readOut('bundles.json').find((item) => item.id === '100');
  assert.ok(bundle.items.some((item) => item.id === 'skin.widowmaker.eve-corrected'));
  rmSync(path.join(dataDir, 'corrections.json'));
});

// In-game events
await test('event days follow US Pacific time, through daylight saving changes', () => {
  // In 2026 daylight time runs from 2 AM on March 8 to 2 AM on November 1.
  assert.equal(core.pacificOffsetAt(Date.parse('2026-03-08T09:59:00Z')), 8);
  assert.equal(core.pacificOffsetAt(Date.parse('2026-03-08T10:00:00Z')), 7);
  assert.equal(core.pacificOffsetAt(Date.parse('2026-11-01T08:59:00Z')), 7);
  assert.equal(core.pacificOffsetAt(Date.parse('2026-11-01T09:00:00Z')), 8);
  assert.equal(new Date(core.pacificDayStart('2026-07-01')).toISOString(), '2026-07-01T07:00:00.000Z');
  assert.equal(new Date(core.pacificDayStart('2026-12-01')).toISOString(), '2026-12-01T08:00:00.000Z');
  assert.equal(new Date(core.pacificDayStart('2026-11-01')).toISOString(), '2026-11-01T07:00:00.000Z', 'midnight that day is still daylight time');
  assert.equal(new Date(core.pacificDayStart('2026-03-08')).toISOString(), '2026-03-08T08:00:00.000Z', 'midnight that day is still standard time');
  assert.equal(core.pacificDate(Date.parse('2026-11-10T07:59:00Z')), '2026-11-09');
  assert.equal(core.pacificDate(Date.parse('2026-11-10T08:00:00Z')), '2026-11-10');
  assert.equal(core.daysBetween('2026-11-10', '2026-12-07'), 27);
  assert.equal(core.addDays('2026-12-31', 1), '2027-01-01');
  // Checked against the platform's own time zone data, every few hours across two years.
  const zone = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (let time = Date.parse('2026-01-01T00:00:00Z'); time < Date.parse('2028-01-01T00:00:00Z'); time += 3 * 3600000 + 17 * 60000) {
    assert.equal(core.pacificDate(time), zone.format(time), new Date(time).toISOString());
  }
  for (let day = '2026-01-01'; day < '2028-01-01'; day = core.addDays(day, 1)) {
    const start = core.pacificDayStart(day);
    assert.equal(zone.format(start), day, day);
    assert.equal(zone.format(start - 1), core.addDays(day, -1), `${day} starts exactly at midnight`);
  }
});

await test('an event is live through its last day, and the countdown counts whole days', () => {
  const event = { start: '2026-11-03', end: '2026-12-07' };
  // November 3 is after daylight time ends, so its Pacific midnight is 08:00 UTC.
  assert.equal(core.gameEventState(event, Date.parse('2026-11-03T07:59:00Z')), 'upcoming');
  assert.equal(core.gameEventState(event, Date.parse('2026-11-03T08:00:00Z')), 'live');
  assert.equal(core.gameEventState(event, Date.parse('2026-12-08T07:59:00Z')), 'live', 'through December 7');
  assert.equal(core.gameEventState(event, Date.parse('2026-12-08T08:00:00Z')), 'ended');
  const timing = (at, value = event) => core.gameEventTiming(value, Date.parse(at));
  assert.deepEqual(timing('2026-11-10T20:00:00Z'), { state: 'live', text: 'Ends in 27 days', soon: false });
  assert.deepEqual(timing('2026-12-06T20:00:00Z'), { state: 'live', text: 'Ends tomorrow', soon: true });
  assert.deepEqual(timing('2026-12-07T20:00:00Z'), { state: 'live', text: 'Last day', soon: true });
  assert.deepEqual(timing('2026-11-01T20:00:00Z'), { state: 'upcoming', text: 'Starts in 2 days', soon: true });
  assert.deepEqual(timing('2026-10-20T20:00:00Z'), { state: 'upcoming', text: 'Starts in 14 days', soon: false });
  assert.deepEqual(timing('2026-11-02T20:00:00Z'), { state: 'upcoming', text: 'Starts tomorrow', soon: true });
  assert.deepEqual(timing('2026-12-09T20:00:00Z'), { state: 'ended', text: null, soon: false });
  assert.deepEqual(timing('2026-11-10T20:00:00Z', { start: '2026-11-03', end: null }), { state: 'live', text: 'No end date announced', soon: false });
  // Only a stated time gets an hour-by-hour countdown.
  const timed = { start: '2026-11-03T18:00:00Z', end: '2026-11-05T18:00:00Z' };
  assert.deepEqual(timing('2026-11-04T18:00:00Z', timed), { state: 'live', text: 'Ends in 1d 0h', soon: true });
  assert.deepEqual(timing('2026-11-02T12:00:00Z', timed), { state: 'upcoming', text: 'Starts in 1d 6h', soon: true });
  assert.equal(core.gameEventSpan(timed).exactEnd, true);
  assert.equal(core.gameEventSpan(event).exactEnd, false);
});

await test('events are grouped by now, next, just ended and earlier, each in a useful order', () => {
  const events = [
    { id: 'later', start: '2026-11-03', end: '2026-12-07' },
    { id: 'sooner', start: '2026-11-03', end: '2026-11-17' },
    { id: 'open', start: '2026-09-01', end: null },
    { id: 'next', start: '2026-11-20', end: '2026-11-23' },
    { id: 'after', start: '2026-12-03', end: '2026-12-07' },
    { id: 'just', start: '2026-10-06', end: '2026-11-02' },
    { id: 'before', start: '2026-10-06', end: '2026-10-19' },
    { id: 'old', start: '2026-06-01', end: '2026-06-10' },
  ];
  const groups = core.groupGameEvents(events, Date.parse('2026-11-10T20:00:00Z'));
  const ids = (list) => list.map((event) => event.id);
  assert.deepEqual(ids(groups.live), ['sooner', 'later', 'open'], 'ending soonest first, and no end last');
  assert.deepEqual(ids(groups.upcoming), ['next', 'after']);
  assert.deepEqual(ids(groups.recent), ['just', 'before']);
  assert.deepEqual(ids(groups.earlier), ['old']);
});

await test('in-game events are joined to the catalogue and the recorded shop', async () => {
  const sources = [{ source: 'Blizzard', title: 'Post', url: 'https://overwatch.blizzard.com/en-us/news/1/post/', checkedAt: '2026-11-10' }];
  write('curated/game-events.json', {
    schema: 1,
    checkedAt: '2026-11-10',
    recordedFrom: '2026-10-06',
    events: [
      { id: 'collab', name: 'Collab', kind: 'collab', start: '2026-11-03', end: '2026-11-17', summary: 'Skins.', image: null, cosmetics: ['skin.widowmaker.eve'], sources },
      { id: 'hunt', name: 'Hunt', kind: 'challenge', start: '2026-11-20', end: '2026-11-23', summary: 'Games.', image: { url: 'https://bnetcmsus-a.akamaihd.net/cms/gallery/x.png', credit: 'Blizzard Entertainment' }, challenges: [{ task: 'Complete 5 games', reward: 'A Loot Box' }], sources },
    ],
  });
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  const file = readOut('game-events.json');
  assert.equal(file.checkedAt, '2026-11-10');
  assert.equal(file.recordedFrom, '2026-10-06');
  const collab = file.events.find((event) => event.id === 'collab');
  assert.deepEqual(collab.featured.map((item) => item.id), ['skin.widowmaker.eve']);
  assert.ok(collab.featured[0].name && collab.featured[0].availability);
  assert.ok(collab.bundles.some((bundle) => bundle.id === '100'), 'the bundle that holds the skin');
  const hunt = file.events.find((event) => event.id === 'hunt');
  assert.deepEqual([hunt.modes, hunt.rewards, hunt.notes, hunt.links, hunt.featured, hunt.bundles], [[], [], [], [], [], []], 'every list is filled in for the page');
  assert.equal(hunt.pass, null);
  assert.equal(hunt.catalogue, null);
  assert.equal(readOut('meta.json').counts.events, 2);
  rmSync(path.join(dataDir, 'curated/game-events.json'));
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  assert.ok(!existsSync(path.join(outDir, 'game-events.json')), 'with no list, no file, so the page says none are published');
});

await test('a bad in-game event stops the build and says why', async () => {
  const good = readdirSync(outDir).length;
  const source = [{ source: 'B', title: 'T', url: 'https://x.test' }];
  write('curated/game-events.json', {
    schema: 1,
    checkedAt: '2026-11-10',
    events: [
      { id: 'Bad Id', name: 'X', kind: 'party', start: '2026-12-07', end: '2026-12-03', summary: 'x'.repeat(260), image: { url: 'http://x.test/a.png', credit: '' }, cosmetics: ['skin.nobody.nothing'], cosmeticsEvent: 'no-such-tag', links: [{ label: 'x', href: 'javascript:alert(1)' }], sources: [] },
      { id: 'twice', name: 'A', kind: 'event', start: '2026-11-01', end: null, summary: 'a', image: null, sources: source },
      { id: 'twice', name: 'B', kind: 'event', start: 'soon', end: null, summary: 'b', image: null, sources: source },
    ],
  });
  const report = await buildCatalog({ dryRun: true });
  for (const pattern of [/lowercase words/, /unknown kind/, /ends before it starts/, /under 220 characters/, /https url and a credit/, /no cosmetic skin\.nobody\.nothing/, /no cosmetics are tagged/, /a link needs/, /at least one source/, /used twice/, /start should be/]) {
    assert.ok(report.errors.some((line) => pattern.test(line)), `an error matching ${pattern}`);
  }
  await assert.rejects(buildCatalog(), /nothing was written/);
  assert.equal(readdirSync(outDir).length, good, 'the last good files stay');
  rmSync(path.join(dataDir, 'curated/game-events.json'));
});

await test('admin entries with no source, or bad dates, stop the build', async () => {
  const good = readdirSync(outDir).length;
  write('curated/twitch-drops.json', [{ id: 'x', name: 'X', start: '2026-02-01T00:00:00Z', end: '2026-01-01T00:00:00Z', rewards: [{ id: 'r', name: 'R', minutes: -5, type: null }], sources: [] }]);
  const report = await buildCatalog({ dryRun: true });
  assert.ok(report.errors.some((line) => /no source/.test(line)));
  assert.ok(report.errors.some((line) => /ends before it starts/.test(line)));
  assert.ok(report.errors.some((line) => /bad watch time/.test(line)));
  await assert.rejects(buildCatalog(), /nothing was written/);
  assert.equal(readdirSync(outDir).length, good, 'the last good files stay');
  rmSync(path.join(dataDir, 'curated/twitch-drops.json'));
});

await test('loot pools come from their stated rule, and an unlisted pool stays unlisted', async () => {
  write('curated/loot-pools.json', [
    { slug: 'esports', name: 'E', description: 'd', basis: 'b', rule: { tags: ['esports'] }, confirmed: false, sources: [{ source: 'S', title: 'T', url: 'https://x.test', checkedAt: null }] },
    { slug: 'standard', name: 'S', description: 'd', basis: 'b', rule: null, confirmed: false, sources: [{ source: 'S', title: 'T', url: 'https://x.test', checkedAt: null }] },
    { slug: 'anniversary', name: 'A', description: 'd', basis: 'b', rule: { events: ['anniversary'] }, confirmed: false, sources: [{ source: 'S', title: 'T', url: 'https://x.test', checkedAt: null }] },
  ]);
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  const pools = readOut('loot-pools.json');
  assert.equal(pools.find((pool) => pool.slug === 'esports').count, 1);
  assert.equal(pools.find((pool) => pool.slug === 'standard').count, null);
  assert.equal(pools.find((pool) => pool.slug === 'anniversary').count, null, 'no matches means no list, not an empty one');
  assert.deepEqual(readOut('catalog.json').find((item) => item.id === 'spray.owcs-team').pools, ['esports']);
  rmSync(path.join(dataDir, 'curated/loot-pools.json'));
});

// Wiki import. The wikitext copies the structure of the real pages, with names kept short.
const SKINS = `{{CTH|h=Ana|i=Skins|collapse=mw-collapsible}}
|-
{{CTS|n=Common (Free)}}
{{CPB|h=Ana Skin|l=Classic|n=Overwatch Classic||c=2|w1=1|w2=1}}
{{CPB|h=Ana Skin|l=Overwatch 2|n=Overwatch|c=2|w1=1|w2=1}}
|-
{{CTS|n=‎ {{rl|r}}‎ ‎ ‎ {{Credits}} 75}}
{{CPB|h=Ana Skin|n=Citrine|w1=1|w2=1}}
{{CPB|h=Ana Skin|n=Garnet|w1=1|w2=1}}
{{CPB|h=Ana Skin|n=Peridot|w1=1|w2=1}}
{{CPB|h=Ana Skin|n=Turquoise|w1=1|w2=1}}
|-
{{CTS|n=‎ {{rl|e|Lunar New Year}} {{Lunar Icon}}‎ ‎ ‎ {{Credits}} 750|linend=|c=2}}
{{CTS|n=‎ {{rl|e|Overwatch Anniversary}} {{Anniversary Icon}}‎ ‎ ‎ {{Coins}} 1000}}
{{CPB|h=Ana Skin|n=Tal|w1=1|w2=1|c=2}}
{{CPB|h=Ana Skin|n=Cybermedic|w1=1|w2=1|c=2}}
|-
{{CTS|n=‎ {{rl|e}} - [[Ana's Bastet Challenge]]|linend=|c=2}}
{{CTS|n=‎ {{rl|e}} - [[Mischief and Magic]]}}
{{CPB|h=Ana Skin|n=Bastet|w1=1|w2=1|c=2}}
{{CPB|h=Ana Skin|n=Spiritwarder|w1=1|w2=1|c=2}}
|-
{{CTS|n=‎ {{rl|e|Overwatch Esports}} {{Esports Icon}}‎ ‎ ‎ {{Coins}} 1000}}
{{CPB|h=Ana Skin|n=Crazy Raccoon|w1=1|w2=1}}
{{CPB|h=Ana Skin|n=T1|w1=1|w2=1}}
{{CPB|h=Ana Skin|n=Team Falcons|w1=1|w2=1}}
{{CPB|h=Ana Skin|n=Team Liquid|w1=1|w2=1}}
|-
{{CTS|n=‎ {{rl|e|Stadium}} {{Stadium}}|linend=|c=2}}
{{CTS|n=‎ {{rl|e|Battle Pass}} {{Battle Pass}}|c=2}}
{{CPB|h=Ana Skin|n=Elite|w1=1|w2=1|c=2}}
{{CPB|h=Ana Skin|n=Polar|w1=1|w2=1|c=1}}
{{CPB|h=Ana Skin|n=Sakura|w1=1|w2=1|c=1}}
|-
{{CTS|n=‎ {{rl|m}} - [[Mythic Shop]]‎ ‎ ‎ {{Mythic Prisms}} 80}}
{{CPB|h=Ana Skin|n=A-7000 Wargod|w1=1|w2=1}}
|}
<noinclude>[[Category:Hero cosmetics templates]]</noinclude>`;

const POSES = `{{CTH|h=Ana|i=Victory Poses|collapse=mw-collapsible|e=Ana VP}}
|-
{{CTS|n=‎ {{rl|c}} ‎ ‎ (Free)}}
{{CPB|h=Ana VP|n=Heroic|c=3}}
|-
{{CTS|n=‎ {{rl|r}}‎ ‎ ‎ {{Credits}} 75}}
{{CPB|h=Ana VP|n=Protector}}
|
{{CPB|h=Ana VP|n=Seated}}
|-
{{CTS|n=‎ {{rl|r|Lunar New Year}} {{Lunar Icon}}‎ ‎ ‎ {{Credits}} 200|linend=|c=1}}
{{CTS|n=‎ {{rl|r|Summer Games}} {{Summer Icon}}‎ ‎ ‎ {{Credits}} 200|linend=|c=1}}
{{CTS|n=‎ {{rl|r|Halloween Terror}} {{Halloween Icon}}‎ ‎ ‎ {{Credits}} 200|c=1}}
{{CPB|h=Ana VP|n=Folded Hands}}
{{CPB|h=Ana VP|n=Medal}}
{{CPB|h=Ana VP|n=R.I.P.}}
|}`;

const WEAPONS = `{{CTH|h=Ana|i=Weapon Skins|collapse=mw-collapsible}}
|-
{{CTS|n=‎ {{rl|l|Shop}} {{Shop}}‎ ‎ ‎ {{Coins}} 1200 }}
{{CPB|h=Ana Weapon Skin|n=Frostmourne|w2=1}}
|-
{{CTS|n=‎ {{rl|m}} - [[Mythic Shop]]‎ ‎ ‎ {{Mythic Prisms}} 50}}
{{CPB|h=Ana Weapon Skin|n=Midnight Sun|w2=1}}
|}`;

const CHARMS = `'''Weapon Charms''' are {{rl|e}} [[cosmetics]].

There are '''482''' weapon charms in-game.

== [[Hero Gallery]]==
;{{Credits}} 700
<gallery widths="100">
File:WeaponCharm_Double_Dice.png|<center>Double Dice
File:WeaponCharm_Overwatch_Logo.png|<center>Overwatch Logo
</gallery>

==[[Shop]]==
When available, [[Shop]] {{Shop}} weapon charms can be bought for {{Coins}} 700.
{| class=" mw-collapsible" style="width: 70%;"
|-
|<center>'''Overwatch 2''' ''(2022 - 2026)''</center>
|-
|
;Season 1
<gallery widths="100">
File:WeaponCharm_Black_Cat.png|<center>Black Cat
File:WeaponCharm_Lil'_Turret.png|<center>Lil' Turret
</gallery>
;Season 2
<gallery widths="100">
File:WeaponCharm_Coin_Pouch.png|<center>Coin Pouch
</gallery>
|}`;

const TITLES = `'''Player Titles''' are [[cosmetics]].

== Overwatch ==
{| class="wikitable mw-collapsible"
|+ Overwatch Titles
!Title
!Requirements
!Notes
|-
|Stalwart Hero
|Win 250 games in any mode.
|Can be completed anywhere.
|-
|Tenacious Hero
|Win 750 games in any mode.
|N/A
|}`;

const MYTHICS = `==List of Mythic Skins==
===Overwatch 2===
{| class="wikitable mw-collapsible"
!'''Season'''
!'''Hero'''
!'''Name'''
!'''Image'''
!'''Customization Options'''
|-
|[[Season#Season_1|1]]
|[[Ana]]
|{{Raritylink|text=A-7000 Wargod|rarity=m}}
|[[File:Ana_Skin_A-7000_Wargod.png|frameless|250x250px]]
|
* Weapon - 2
* Tattoo - 3
* Color- 3
|-
|[[Season#Season_2|2]]
|[[Not A Hero]]
|{{Raritylink|text=Skip Me|rarity=m}}
|[[File:Skip.png|frameless]]
|
* Weapon - 2
|}`;

const COSMETICS_PAGE = `{{HeroTabs}}
==Skin Descriptions==
;{{rl|e|Citrine}}
:Ana's biotic [[rifle]] uses a modified technology.
;{{rl|l|Other}}
:Another one.`;

const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const exportXml = (pages) => `<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/" version="0.11"><siteinfo><sitename>Overwatch Wiki</sitename></siteinfo>${pages.map(([title, text]) => `<page><title>${escapeXml(title)}</title><ns>0</ns><id>1</id><revision><id>2</id><timestamp>2026-11-01T00:00:00Z</timestamp><text bytes="1" sha1="x" xml:space="preserve">${escapeXml(text)}</text></revision></page>`).join('')}</mediawiki>`;
const PAGES = [['Template:Ana Skins', SKINS], ['Template:Ana VP', POSES], ['Template:Ana Weapon Skins', WEAPONS], ['Weapon Charms', CHARMS], ['Player Titles', TITLES], ['Mythic Skins', MYTHICS], ['Ana/Cosmetics', COSMETICS_PAGE], ['Some Other Page', 'Nothing here.']];

await test('an export file splits into pages, with entities decoded', () => {
  const { pages, sitename } = wiki.readExport(exportXml(PAGES));
  assert.equal(sitename, 'Overwatch Wiki');
  assert.equal(pages.length, PAGES.length);
  assert.equal(pages[0].title, 'Template:Ana Skins');
  assert.ok(pages[0].text.includes('{{CTS|n='));
  assert.ok(pages[3].text.includes('<gallery'));
  assert.equal(pages[0].timestamp, '2026-11-01T00:00:00Z');
  assert.throws(() => wiki.readExport('<html>not this</html>'), /not a Special:Export/);
});

const skinTable = () => new Map(wiki.parseCosmeticTable(SKINS, { type: 'skin', hero: 'ana', pageTitle: 'Ana/Cosmetics' }).map((record) => [record.name, record]));

await test('items take their rarity and price from the header above their column', () => {
  const table = skinTable();
  assert.equal(table.get('Citrine').rarity, 'rare');
  assert.deepEqual(table.get('Citrine').prices, [{ amount: 75, currency: 'credits' }]);
  assert.ok(table.get('Citrine').tags.includes('gallery'));
  assert.equal(table.get('Turquoise').rarity, 'rare');
  assert.equal(table.get('Tal').event, 'lunar-new-year');
  assert.deepEqual(table.get('Tal').prices, [{ amount: 750, currency: 'credits' }]);
  assert.equal(table.get('Cybermedic').event, 'anniversary');
  assert.deepEqual(table.get('Cybermedic').prices, [{ amount: 1000, currency: 'coins' }]);
  assert.equal(table.get('Overwatch Classic').rarity, 'common');
  assert.ok(table.get('Overwatch Classic').tags.includes('base'));
});

await test('origins are read from the headers', () => {
  const table = skinTable();
  assert.ok(table.get('Team Liquid').tags.includes('esports'));
  assert.deepEqual(table.get('Team Liquid').prices, [{ amount: 1000, currency: 'coins' }]);
  assert.ok(table.get('Sakura').tags.includes('battle-pass'), 'second header');
  assert.equal(table.get('Elite').event, 'stadium', 'first header');
  assert.ok(table.get('Bastet').tags.includes('challenge'));
  assert.ok(table.get('Bastet').tags.includes('limited'));
  assert.equal(table.get('Spiritwarder').event, 'mischief-and-magic');
  assert.equal(table.get('A-7000 Wargod').rarity, 'mythic');
  assert.deepEqual(table.get('A-7000 Wargod').prices, [{ amount: 80, currency: 'prisms' }]);
  assert.ok(table.get('A-7000 Wargod').tags.includes('mythic-shop'));
});

await test('image file names follow the wiki\'s pattern', () => {
  const table = skinTable();
  assert.equal(table.get('Citrine').file, 'Ana Skin Citrine.png');
  assert.equal(table.get('Overwatch Classic').file, 'Ana Skin Classic.png');
});

await test('a three-column table with a blank cell still lines up', () => {
  const table = new Map(wiki.parseCosmeticTable(POSES, { type: 'victory-pose', hero: 'ana', pageTitle: 'Ana/Cosmetics' }).map((record) => [record.name, record]));
  assert.equal(table.get('Seated').rarity, 'rare');
  assert.equal(table.get('Folded Hands').event, 'lunar-new-year');
  assert.equal(table.get('Medal').event, 'summer-games');
  assert.equal(table.get('R.I.P.').event, 'halloween-terror');
  assert.equal(table.get('Heroic').rarity, 'common');
});

await test('gallery pages keep season, price and origin', () => {
  const records = wiki.parseGalleries(CHARMS, { type: 'weapon-charm', pageTitle: 'Weapon Charms', defaults: { rarity: 'epic' } });
  const byName = new Map(records.map((record) => [record.name, record]));
  assert.equal(records.length, 5);
  assert.deepEqual(byName.get('Double Dice').prices, [{ amount: 700, currency: 'credits' }]);
  assert.equal(byName.get('Double Dice').rarity, 'epic');
  assert.equal(byName.get('Black Cat').season, 'ow2-s1');
  assert.equal(byName.get('Coin Pouch').season, 'ow2-s2');
  assert.ok(byName.get('Black Cat').tags.includes('shop'));
  assert.deepEqual(byName.get('Black Cat').prices, [{ amount: 700, currency: 'coins' }]);
  assert.equal(byName.get("Lil' Turret").file, "WeaponCharm Lil' Turret.png");
});

await test('titles, mythics and descriptions are read', () => {
  const titles = wiki.parseTitles(TITLES, 'Player Titles');
  assert.deepEqual(titles.map((title) => title.name), ['Stalwart Hero', 'Tenacious Hero']);
  assert.deepEqual(titles[0].acquisition, ['Win 250 games in any mode.']);
  const mythics = wiki.parseMythics(MYTHICS, core, 'Mythic Skins');
  assert.equal(mythics.length, 1, 'a row for an unknown hero is skipped');
  assert.equal(mythics[0].name, 'A-7000 Wargod');
  assert.equal(mythics[0].season, 'ow2-s1');
  assert.deepEqual(mythics[0].options, [{ name: 'Weapon', count: 2 }, { name: 'Tattoo', count: 3 }, { name: 'Color', count: 3 }]);
  assert.equal(wiki.parseSkinDescriptions(COSMETICS_PAGE).get('citrine'), "Ana's biotic rifle uses a modified technology.");
});

await test('voice lines keep their group, season and price', () => {
  const page = `intro
==Cosmetics==
===Voice Lines===
{| class="wikitable quote-table"
|-
! colspan="2" width="25%" | Availability
! width="65%" | Quote
! width="10%" | Audio
|-
| rowspan="1" colspan="2" | <center><big>'''Default'''</big></center>
|Justice delivered.
|{{Audio|Ana - Justice delivered (2).ogg}}
|-
| rowspan="2" colspan="2" | <center><big>'''25 {{credits}}'''</big></center>
|Children, behave.
|{{Audio|Ana - Children, behave.ogg}}
|-
|{{QuoteTranslation| quote = Al-adalah nazlah.|translation = Justice comes down.|script = Arabic|native = x}}
|{{Audio|Ana - (Arabic) x.ogg}}
|-
| rowspan="2" | <center><big>'''{{Battle Pass}} [[Battle Pass]]'''</big></center>
| rowspan="1" | <center>'''Season 1'''</center>
|High tech, low tech.
|{{Audio|Ana - High tech.ogg}}
|-
| rowspan="1" | <center>'''Season 13'''</center>
|Hush, little baby.
|{{Audio|Ana - Hush.ogg}}
|-
| rowspan="1" colspan="2" | <center><big>'''{{Summer Icon}} [[Summer Games]]<br>50 {{credits}}'''</big></center>
|Do less.
|{{Audio|Ana - Do less.ogg}}
|-
| rowspan="1" colspan="2" | <center><big>'''[[Cosmic Crisis]]<br>"Loyal Agent" Challenge'''</big></center>
|Something else.
|{{Audio|Ana - x.ogg}}
|}

==Interactions==
{| class="wikitable"
|-
|Not a voice line.
|}`;
  const lines = new Map(wiki.parseVoiceLines(page, { hero: 'ana', pageTitle: 'Ana/Quotes' }).map((record) => [record.name, record]));
  assert.deepEqual([...lines.keys()], ['Justice delivered.', 'Children, behave.', 'Al-adalah nazlah.', 'High tech, low tech.', 'Hush, little baby.', 'Do less.', 'Something else.']);
  assert.ok(lines.get('Justice delivered.').tags.includes('base'));
  assert.deepEqual(lines.get('Children, behave.').prices, [{ amount: 25, currency: 'credits' }]);
  assert.equal(lines.get('Al-adalah nazlah.').description, 'Means "Justice comes down."');
  assert.deepEqual(lines.get('Al-adalah nazlah.').prices, [{ amount: 25, currency: 'credits' }]);
  assert.equal(lines.get('High tech, low tech.').season, 'ow2-s1');
  assert.ok(lines.get('High tech, low tech.').tags.includes('battle-pass'));
  assert.equal(lines.get('Hush, little baby.').season, 'ow2-s13');
  assert.equal(lines.get('Do less.').event, 'summer-games');
  assert.deepEqual(lines.get('Do less.').prices, [{ amount: 50, currency: 'credits' }]);
  assert.equal(lines.get('Do less.').season, null, 'a season doesn\'t carry over to the next group');
  assert.equal(lines.get('Something else.').event, 'cosmic-crisis');
  assert.ok(lines.get('Something else.').tags.includes('challenge'));
  assert.ok(!lines.has('Not a voice line.'));
});

await test('inner cells add a season, price or challenge to their group', () => {
  const page = `===Voice Lines===
{|
|-
| rowspan="3" | <center><big>'''{{Battle Pass}} [[Battle Pass]]'''</big></center>
| rowspan="1" | <center>'''Season 1 (2026)'''</center>
|Line one.
|{{Audio|a.ogg}}
|-
| rowspan="1" | <center>'''[[Season#Season 7|Season 7]]'''</center>
|Line two.
|{{Audio|b.ogg}}
|-
| rowspan="1" | <center>'''[[Season#Season 4 (2026)|Season 4 (2026)]]'''</center>
|Line three.
|{{Audio|c.ogg}}
|-
| rowspan="2" | <center><big>'''{{Halloween Icon}} [[Halloween Terror]]'''</big></center>
| rowspan="1" | <center>'''{{credits}} 50'''</center>
|Line four.
|{{Audio|d.ogg}}
|-
| rowspan="1" | <center>'''Wrath of the Bride Challenge'''</center>
|Line five.
|{{Audio|e.ogg}}
|-
| rowspan="1" colspan="2" | <center><big>'''[[Overwatch 2 x Street Fighter 6|Street Fighter 6]]'''</big></center>
|Line six.
|{{Audio|f.ogg}}
|-
| rowspan="1" colspan="2" | <center><big>'''[[Overwatch x Street Fighter 6]]</big><br>''Round Two'' Challenge'''</center>
|Line seven.
|{{Audio|g.ogg}}
|-
| rowspan="1" colspan="2" | <center><big>'''Progression Level 3'''</big></center>
|Line eight.
|{{Audio|h.ogg}}
|-
| rowspan="1" colspan="2" | <center><big>'''{{Shop}} [[Shop]]<br>{{Coins}} 100'''</big></center>
|{{QuoteTranslation|quote=Okashi.|translation=Trick or treat.
|{{Audio|i.ogg}}
|}`;
  const lines = new Map(wiki.parseVoiceLines(page, { hero: 'ana', pageTitle: 'Ana/Quotes' }).map((record) => [record.name, record]));
  assert.equal(lines.get('Line one.').season, '2026-s1');
  assert.equal(lines.get('Line two.').season, 'ow2-s7');
  assert.equal(lines.get('Line three.').season, '2026-s4');
  assert.equal(lines.get('Line three.').event, null, 'a season link isn\'t an event');
  assert.equal(lines.get('Line four.').event, 'halloween-terror');
  assert.deepEqual(lines.get('Line four.').prices, [{ amount: 50, currency: 'credits' }]);
  assert.equal(lines.get('Line four.').season, null);
  assert.deepEqual(lines.get('Line five.').prices, [], 'the price cell above covers only its own rows');
  assert.ok(lines.get('Line five.').tags.includes('challenge'));
  assert.equal(lines.get('Line six.').event, 'street-fighter-6');
  assert.ok(lines.get('Line six.').tags.includes('collab'));
  assert.equal(lines.get('Line seven.').event, 'street-fighter-6', 'one event, however its name is written');
  assert.ok(lines.get('Line eight.').tags.includes('base'));
  assert.deepEqual(lines.get('Okashi.').prices, [{ amount: 100, currency: 'coins' }]);
  assert.ok(lines.get('Okashi.').tags.includes('shop'));
  assert.equal(lines.get('Okashi.').description, 'Means "Trick or treat."', 'a call with no closing braces still reads');
});

await test('a voice line\'s bracket note isn\'t part of its name, and old seasons share one count', () => {
  const page = `===Voice Lines===
{|
|-
| rowspan="2" colspan="2" | <center><big>'''{{Shop}} [[Shop]]'''</big></center>
|Such bottomless stupidity. (Destro Doomfist Bundle)
|{{Audio|a.ogg}}
|-
|Charge, Johanna! (from the Queen D.Va Bundle)
|{{Audio|b.ogg}}
|}`;
  const lines = wiki.parseVoiceLines(page, { hero: 'dva', pageTitle: 'D.Va/Quotes' });
  assert.deepEqual(lines.map((line) => line.name), ['Such bottomless stupidity.', 'Charge, Johanna!']);
  assert.ok(lines[1].acquisition.includes('Sold with the Queen D.Va Bundle'));
  assert.equal(wiki.seasonFromText('2025: Season 16'), 'ow2-s16');
  assert.equal(wiki.seasonFromText('Season 3 (2026)'), '2026-s3');
  assert.equal(wiki.seasonFromText('[[Season#Season 20|Season 20]]'), 'ow2-s20');
  assert.equal(wiki.seasonFromText('Not a season'), null);
});

await test('headings don\'t turn page links into events', () => {
  assert.equal(wiki.readGroupLabel('[[Emotes]]').event, null);
  assert.equal(wiki.readGroupLabel('[[Event]]').event, null);
  assert.ok(wiki.readGroupLabel('[[Twitch Drops]]').tags.includes('twitch'));
  assert.equal(wiki.readGroupLabel('[[Twitch Drops]]').event, null);
  assert.equal(wiki.readGroupLabel('[[Underworld (mission)]]').event, 'underworld');
  assert.equal(wiki.readGroupLabel('[[Overwatch x Gi-Joe]]').event, 'gi-joe');
  assert.equal(wiki.readGroupLabel('[[Overwatch 2 x G.I. Joe]]').event, 'gi-joe');
});

await test('older shop records read the same as new ones', () => {
  const dollars = listing({ id: 'overwatch-sweet-bundle', itemKey: null, type: 'Bundle · 3 items', rarity: { name: 'Bundle', color: '#fff' }, price: { amount: null, label: 'US$9.99', currency: 'Coins', currencyIcon: null, regular: null }, contents: [] });
  const heroOnly = listing({ id: '0000000060B2.0A5', itemKey: null, name: 'Pumpkin', type: 'Bastion', rarity: { name: 'epic', color: '#fff' }, contents: [] });
  const noHero = listing({ id: 'overwatch-shop-2115606', itemKey: null, name: 'Starlight Champion', type: 'Skins', contents: [] });
  const counted = listing({ id: 'overwatch-shop-3', itemKey: null, name: 'A Bundle', type: 'Bundle (10 items)', contents: [] });
  const snapshot = core.normalizeShop(shopAnswer([section('Overwatch Shop · ', [dollars, heroOnly]), section('Overwatch Shop', [noHero, counted])]));
  assert.equal(snapshot.sections.length, 1, 'one section, however its title is written');
  assert.equal(snapshot.sections[0].title, 'Overwatch Shop');
  const [bundle, pumpkin, skin, ten] = snapshot.sections[0].listings;
  assert.equal(bundle.kind, 'bundle');
  assert.equal(bundle.amount, 9.99);
  assert.equal(bundle.currency, 'USD');
  assert.equal(bundle.priceLabel, null);
  assert.equal(bundle.statedCount, 3);
  assert.equal(bundle.rarity, null);
  assert.equal(ten.statedCount, 10);
  assert.equal(pumpkin.kind, 'product', 'a hero alone doesn\'t say what kind of cosmetic it is');
  assert.equal(pumpkin.hero, 'bastion');
  assert.equal(pumpkin.rarity, 'epic');
  assert.equal(skin.kind, 'product', 'a skin with no hero can\'t be linked');
  assert.equal(skin.cosmeticId, null);
});

const rawItem = (over) => ({ name: 'X', kind: 'bundle', typeLabel: null, rarity: null, image: null, statedCount: null, url: null, contents: [], firstSeen: '2026-10-01', lastSeen: '2026-10-01', ...over });
const rawRotation = (at, listings, title = 'Overwatch Shop') => ({ id: at, at, updatedAt: at, shopDate: at.slice(0, 10), sections: [{ title, upcoming: false, endsAt: null, listings }] });

await test('one id used for two different items stays two items', () => {
  const skin = listing({ id: 'overwatch-shop-2126628', itemKey: null, name: 'Eclypse', type: 'Skin - Illari', contents: [] });
  const bundle = listing({ id: 'overwatch-shop-2126628', itemKey: null, name: 'Dokiwatch 2.0 Mega Bundle', type: 'Bundle 22', contents: [content('Eve', 'Skins · Widowmaker', 'Legendary', null)] });
  const items = {};
  mergeItems(items, core.normalizeShop(shopAnswer([section('Overwatch Shop', [skin, bundle])])), '2026-10-20T00:00:00Z');
  const names = Object.values(items).map((item) => item.name).sort();
  assert.deepEqual(names, ['Dokiwatch 2.0 Mega Bundle', 'Eclypse']);
  const result = reconcileShop(core, items, []);
  assert.equal(Object.values(result.items).find((item) => item.name === 'Eclypse').contents.length, 0, 'a skin doesn\'t pick up a bundle\'s contents');
});

await test('one time on sale is one row, however many bundles it was in', () => {
  const stay = (over) => ({ start: '2026-11-04T00:00:00Z', end: '2026-11-10T00:00:00Z', price: null, currency: 'Coins', section: null, bundle: null, bundleId: null, bundlePrice: null, source: 'itemshop-history', ...over });
  const rows = core.groupStays([
    stay({ bundle: 'Mega', bundleId: '1', bundlePrice: 6900 }),
    stay({ bundle: 'Small', bundleId: '2', bundlePrice: 2800 }),
    stay({ bundle: 'Small', bundleId: '2', bundlePrice: 2800 }),
    stay({ start: '2026-10-01T00:00:00Z', end: '2026-10-08T00:00:00Z', price: 1900, section: 'Overwatch Shop' }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].bundles, [{ name: 'Mega', id: '1', price: 6900 }, { name: 'Small', id: '2', price: 2800 }]);
  assert.equal(rows[0].price, null);
  assert.equal(rows[1].price, 1900);
  assert.equal(rows[1].section, 'Overwatch Shop');
  assert.deepEqual(rows[1].bundles, []);
});

await test('one bundle under several ids becomes one item', () => {
  const items = {
    'listing:overwatch-team-mega-bundle': rawItem({ name: 'Team Mega Bundle', typeLabel: 'Bundle · 2 items', firstSeen: '2026-09-24', lastSeen: '2026-09-24', image: 'https://x.test/old.png' }),
    'listing:overwatch-shop-111': rawItem({ name: 'Team Mega Bundle', typeLabel: 'Bundle (2 items)', firstSeen: '2026-09-25', lastSeen: '2026-09-30', contents: [{ key: null, name: 'A', typeLabel: 'Sprays' }] }),
    'listing:overwatch-esports-shop-111': rawItem({ name: 'Team Mega Bundle', typeLabel: 'Bundle (2 items)', firstSeen: '2026-09-25', lastSeen: '2026-09-30' }),
    'ow:bundle:999': rawItem({ name: 'Team Mega Bundle', typeLabel: 'Bundle 2', firstSeen: '2026-11-01', lastSeen: '2026-11-03', image: 'https://x.test/new.png' }),
    // The store reuses numbers, so a shared number alone never joins two things.
    'listing:battle-pass-809988': rawItem({ name: 'Widowmaker Mythic Bundle' }),
    'listing:overwatch-shop-809988': rawItem({ name: 'Sojourn Mythic Bundle' }),
    'listing:overwatch-only-past-bundle': rawItem({ name: 'Only Past Bundle', typeLabel: 'Bundle · 1 items' }),
  };
  const rotations = [
    rawRotation('2026-09-24T00:00:00Z', [['listing:overwatch-team-mega-bundle', 4500, 'Coins'], ['listing:overwatch-only-past-bundle', 700, 'Coins']]),
    rawRotation('2026-09-25T00:00:00Z', [['listing:overwatch-shop-111', 4500, 'Coins'], ['listing:overwatch-esports-shop-111', 4500, 'Coins'], ['listing:overwatch-only-past-bundle', 700, 'Coins']]),
    rawRotation('2026-11-01T00:00:00Z', [['ow:bundle:999', 3000, 'Coins']]),
  ];
  const result = reconcileShop(core, items, rotations);
  const team = result.items['ow:bundle:999'];
  assert.equal(team.image, 'https://x.test/new.png');
  assert.equal(team.firstSeen, '2026-09-24');
  assert.equal(team.lastSeen, '2026-11-03');
  assert.equal(team.contents.length, 1, 'contents known from an older listing are kept');
  assert.equal(Object.values(result.items).filter((item) => item.name === 'Team Mega Bundle').length, 1);
  assert.ok(result.items['listing:only-past-bundle']);
  assert.equal(Object.values(result.items).filter((item) => /Mythic/.test(item.name)).length, 2);
  assert.equal(result.rotations.length, 2, 'the same things on sale is the same shop, whatever the ids');
  assert.equal(result.rotations[0].at, '2026-09-24T00:00:00Z', 'a shop began at its first read');
  assert.equal(result.rotations[0].shopDate, '2026-09-25', 'and its newest read describes it');
  assert.deepEqual(result.rotations[0].sections[0].listings.map((row) => row[0]), ['ow:bundle:999', 'listing:only-past-bundle'], 'and it lists an item once');
});

await test('a price change is a new shop, and the source\'s spelling can be corrected', () => {
  const items = { 'listing:overwatch-shop-1': rawItem({ name: 'Malus Rammatra Bundle', lastSeen: '2026-10-20' }), 'ow:bundle:2': rawItem({ name: 'Malus Ramattra Bundle', lastSeen: '2026-11-01' }) };
  const rotations = [rawRotation('2026-10-20T00:00:00Z', [['listing:overwatch-shop-1', 4500, 'Coins']]), rawRotation('2026-10-21T00:00:00Z', [['ow:bundle:2', 3000, 'Coins']])];
  const plain = reconcileShop(core, items, rotations);
  assert.equal(Object.keys(plain.items).length, 2, 'different names stay apart without a correction');
  const fixed = reconcileShop(core, items, rotations, { listingNames: { 'Malus Rammatra Bundle': 'Malus Ramattra Bundle' } });
  assert.deepEqual(Object.keys(fixed.items), ['ow:bundle:2']);
  assert.equal(fixed.rotations.length, 2);
});

await test('a missing hero is filled only when it can be worked out', () => {
  const intro = (name, image) => ({ key: null, name, typeLabel: 'Highlight Intros', rarity: 'epic', image, quantity: 1 });
  const items = {
    'listing:a': rawItem({ name: 'Night - D.Mon Bundle', contents: [{ key: null, name: 'Night', typeLabel: 'Skins · D.Mon', image: 'https://x.test/skin.png' }, intro('Night', 'https://x.test/dmon-intro.png')] }),
    'listing:b': rawItem({ name: 'Night Mega Bundle', contents: [intro('Night', 'https://x.test/dmon-intro.png'), intro('Night', 'https://x.test/other-intro.png')] }),
    // Named after one hero, but it sells another hero's item too, so it says nothing about whose this is.
    'listing:c': rawItem({ name: 'Mercy And Friends Bundle', contents: [{ key: null, name: 'Y', typeLabel: 'Skins · Ana', image: 'https://x.test/y.png' }, intro('Z', 'https://x.test/z.png')] }),
    'listing:skin': rawItem({ name: 'Starlight', kind: 'cosmetic', typeLabel: 'Skins · Mercy' }),
    'listing:overwatch-shop-12345': rawItem({ name: 'Starlight', kind: 'cosmetic', typeLabel: 'Skins · Kiriko' }),
    'listing:overwatch-esports-shop-12345': rawItem({ name: 'Starlight', kind: 'cosmetic', typeLabel: 'Skins' }),
    'listing:overwatch-shop-777': rawItem({ name: 'Starlight', kind: 'cosmetic', typeLabel: 'Skins' }),
  };
  const result = reconcileShop(core, items, []);
  const byName = (name) => Object.values(result.items).find((item) => item.name === name);
  assert.equal(byName('Night - D.Mon Bundle').contents[1].typeLabel, 'Highlight Intros · D.Mon');
  assert.equal(byName('Night Mega Bundle').contents[0].typeLabel, 'Highlight Intros · D.Mon', 'the same picture is the same cosmetic');
  assert.equal(byName('Night Mega Bundle').contents[1].typeLabel, 'Highlight Intros', 'an unknown picture stays unknown');
  assert.equal(byName('Mercy And Friends Bundle').contents[1].typeLabel, 'Highlight Intros');
  assert.equal(result.items['listing:starlight.kiriko'].typeLabel, 'Skins · Kiriko', 'the same product states its hero on another day');
  assert.equal(result.items['listing:starlight'].kind, 'product', 'a skin with no hero anywhere can\'t be a cosmetic record');
});

await test('a mythic on sale in a bundle gets no store link, and an old product id isn\'t reused', async () => {
  resetData();
  const mythic = content('Treblemaker', 'Weapon Skin · Lúcio', 'Mythic', 'ow:item:500');
  const earlier = listing({ id: 'p1', itemKey: 'ow:bundle:810', name: 'Earlier Bundle', type: 'Bundle 1', contents: [content('Eve', 'Skins · Widowmaker', 'Legendary', 'ow:item:90')] });
  api.shop = shopAnswer([section('Overwatch Shop', [earlier])]);
  await sync();
  api.fingerprint = 'fp-2';
  api.etag = 'W/"after-earlier"';
  api.changedAt = '2026-11-10T19:15:00.000Z';
  const now = listing({ id: 'p2', itemKey: 'ow:bundle:811', name: 'Mythic Bundle', type: 'Bundle 2', contents: [mythic, content('Eve', 'Skins · Widowmaker', 'Legendary', 'ow:item:91')] });
  api.shop = shopAnswer([section('Overwatch Shop', [now])]);
  await sync();
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  const treblemaker = shardFor('weapon-skin.lucio.treblemaker');
  assert.equal(treblemaker.availability, 'in-shop');
  assert.equal(treblemaker.storeUrl, null);
  const bundle = readOut('bundles.json').find((item) => item.id === '811');
  assert.equal(bundle.items.find((item) => item.name === 'Treblemaker').storeUrl, undefined);
  assert.deepEqual(shardFor('skin.widowmaker.eve').productIds, [90, 91], 'the same skin under two product ids');
  assert.equal(shardFor('skin.widowmaker.eve').storeUrl, `${STORE}/91/eve`, 'the id on sale now, since the old one\'s page is gone');
});

await test('prices from inside a bundle stay the bundle\'s, and one stay counts once', async () => {
  resetData();
  const eve = content('Eve', 'Skins · Widowmaker', 'Legendary', 'ow:item:101');
  const mega = listing({ id: 'm', itemKey: 'ow:bundle:800', name: 'Eve Mega Bundle', type: 'Bundle 1', price: { amount: 6900, label: null, currency: 'Coins', currencyIcon: null, regular: null }, contents: [eve] });
  const small = listing({ id: 's', itemKey: 'ow:bundle:801', name: 'Eve Widowmaker Bundle', type: 'Bundle 1', price: { amount: 2800, label: null, currency: 'Coins', currencyIcon: null, regular: null }, contents: [eve] });
  api.shop = shopAnswer([section('Overwatch Shop', [mega, small, single])]);
  await sync();
  write('shop/stays.json', {
    fetchedAt: '2026-11-05T00:00:00Z',
    items: {
      'ow:item:101': [
        ['2026-11-03T00:00:00Z', '2026-11-10T00:00:00Z', 6900, null, 'Eve Mega Bundle', 'now'],
        ['2026-11-03T00:00:00Z', '2026-11-10T00:00:00Z', 2800, null, 'Eve Widowmaker Bundle', 'now'],
        ['2026-12-01T00:00:00Z', '2026-12-08T00:00:00Z', 2800, null, 'Eve Widowmaker Bundle', 'upcoming'],
      ],
      'ow:item:200': [['2026-11-03T00:00:00Z', '2026-11-10T00:00:00Z', 1900, null, 'Eclypse', 'now']],
    },
  });
  await buildCatalog({ now: new Date('2026-11-05T00:00:00Z') });
  const inBundles = shardFor('skin.widowmaker.eve');
  assert.deepEqual(inBundles.prices, [], 'neither bundle\'s price is the skin\'s price');
  assert.equal(inBundles.seen, 1, 'two bundles at once is one appearance');
  assert.equal(inBundles.stays.length, 2, 'and both are listed');
  assert.deepEqual(inBundles.stays.map((stay) => stay.bundlePrice).sort(), [2800, 6900]);
  assert.deepEqual(inBundles.stays.map((stay) => stay.bundleId).sort(), ['800', '801']);
  assert.ok(inBundles.stays.every((stay) => stay.price === null));
  const alone = shardFor('skin.illari.eclypse');
  assert.deepEqual(alone.prices, [{ amount: 1900, currency: 'coins' }], 'its own listing is its own price');
  assert.equal(alone.stays[0].bundle, null);
  assert.equal(alone.stays[0].currency, 'Coins', 'the source only names other currencies');
});

await test('a recording that starts before the source\'s dates adds only the earlier part', async () => {
  resetData();
  api.changedAt = '2026-11-01T00:00:00.000Z';
  api.shop = shopAnswer([section('Overwatch Shop', [listing()])]);
  await sync();
  write('shop/stays.json', { fetchedAt: '2026-11-05T00:00:00Z', items: { 'ow:item:101': [['2026-11-03T00:00:00Z', '2026-11-10T00:00:00Z', 2800, null, 'Test Mega Bundle', 'now']] } });
  await buildCatalog({ now: new Date('2026-11-05T00:00:00Z') });
  const stays = shardFor('skin.widowmaker.eve').stays;
  assert.deepEqual(stays.map((stay) => [stay.start, stay.end, stay.source]), [
    ['2026-11-03T00:00:00Z', '2026-11-10T00:00:00Z', 'itemshop-history'],
    ['2026-11-01T00:00:00.000Z', '2026-11-03T00:00:00Z', 'recorded'],
  ]);
  assert.equal(shardFor('skin.widowmaker.eve').availability, 'in-shop', 'and it still counts as on sale');
});

await test('a listing labelled only with a hero joins the catalogue if exactly one cosmetic fits', async () => {
  resetData();
  const row = (id, name, type, rarity, amount) => listing({ id, itemKey: null, name, type, rarity: { name: rarity, color: '#fff' }, price: { amount, label: null, currency: 'Coins', currencyIcon: null, regular: null }, contents: [], sourceUrl: null, availability: { from: null, until: null, untilLabel: null } });
  api.shop = shopAnswer([section('Seasonal Offers', [row('0000000060B2.0A5', 'Pumpkin', 'Bastion', 'epic', 1000), row('000000004B28.0A5', 'Werewolf', 'Winston', 'common', 50), row('000000001722.0A5', 'Flail', 'Brigitte', 'epic', 250), row('0000000055DC.0A5', 'No Match', 'Mercy', 'epic', 1000)])]);
  await sync();
  const wikiRow = (type, hero, name, rarity) => ({ type, hero, name, rarity, season: null, event: null, tags: ['gallery'], prices: [], acquisition: [], page: null, pageTitle: 'x', file: null, description: null });
  write('wiki/catalog.json', [wikiRow('skin', 'bastion', 'Pumpkin', 'epic'), wikiRow('skin', 'winston', 'Werewolf', 'legendary'), wikiRow('emote', 'brigitte', 'Flail', 'epic'), wikiRow('spray', 'brigitte', 'Flail', 'epic')]);
  await buildCatalog({ now: new Date('2026-11-05T00:00:00Z') });
  const ids = readOut('catalog.json').map((row) => row.id);
  assert.deepEqual(shardFor('skin.bastion.pumpkin').prices, [{ amount: 1000, currency: 'coins' }]);
  assert.deepEqual(shardFor('skin.winston.werewolf').prices, [], 'a common spray at 50 coins isn\'t the legendary skin of that name');
  assert.deepEqual(shardFor('emote.brigitte.flail').prices, [], 'two cosmetics fit, so neither is chosen');
  assert.ok(!ids.some((id) => /no-match/.test(id)), 'it never invents a type');
  const shop = readOut('shop.json');
  const listed = shop.snapshot.sections.flatMap((part) => part.listings);
  assert.equal(listed.find((item) => item.name === 'No Match').kind, 'product', 'but it stays in the record of that shop');
});

// The wiki's real page formats
await test('a heading\'s links are read for what they mean', () => {
  const event = (raw) => wiki.readGroupLabel(raw).event;
  assert.equal(event('[[BCRF Charity Event#BCRF Charity Event 2018]]'), 'bcrf-charity-event');
  assert.equal(event('[[Overwach Anniversary]]'), 'anniversary', 'a misspelled link is still the event');
  assert.equal(event('[[One-Punch_Man_x_Overwatch_2|One-Punch Man]]'), 'one-punch-man');
  assert.equal(event('[[BlizzCon 2018]]'), 'blizzcon');
  assert.equal(event('[[Hero Mastery (event)|Hero Mastery Event]]'), 'hero-mastery');
  assert.equal(event('[[File:Icon-Ana.png|20px]]'), null, 'a picture isn\'t an event');
  for (const page of ['[[Limited-time event]]', '[[Mythic]]', '[[Special]]', '[[Skins#Trivia]]', '[[Overwatch_League#Skins]]', '[[Ana\'s Bastet Challenge]]', '[[Haunted Maquerade Challenage]]', '[[Loot Boxes]]', '[[Origins Edition]]', '[[Reign of Talon (competitive year)|Reign of Talon]]']) {
    assert.equal(event(page), null, page);
  }
  assert.ok(wiki.readGroupLabel('[[Overwatch_League#Skins]]').tags.includes('esports'));
  assert.ok(wiki.readGroupLabel('[[Overwatch Champions Series]]').tags.includes('esports'));
  assert.ok(wiki.readGroupLabel('[[Ana\'s Bastet Challenge]]').tags.includes('challenge'));
  assert.ok(wiki.readGroupLabel('[[Haunted Maquerade Challenage]]').tags.includes('challenge'));
  assert.ok(wiki.readGroupLabel('[[Loot Boxes]]').tags.includes('loot-box'));
  assert.ok(wiki.readGroupLabel('[[List_of_previous_Battle_Passes/2022-2026#Season 1|Battle Pass]]').tags.includes('battle-pass'));
  assert.ok(wiki.readGroupLabel('[[Origins Edition]]').acquisition.includes('From the Origins Edition'));
  assert.equal(wiki.readGroupLabel('Epic (Overwatch 2 [[Overwatch League]]) (150 {{League Tokens}})').rarity, 'epic');
  assert.deepEqual(wiki.readGroupLabel('Epic ([[Overwatch League]]) (150 {{League Tokens}})').prices, [{ amount: 150, currency: 'league-tokens' }]);
});

await test('a plain heading says the same as a linked one', () => {
  assert.ok(wiki.readGroupLabel('Battle Pass').tags.includes('battle-pass'));
  assert.ok(wiki.readGroupLabel('Shop').tags.includes('shop'));
  assert.ok(wiki.readGroupLabel('Hero Gallery').tags.includes('gallery'));
  assert.ok(wiki.readGroupLabel('Competitive Rewards').tags.includes('competitive'));
  assert.equal(wiki.readGroupLabel('Winter Wonderland').event, 'winter-wonderland');
  assert.ok(wiki.readGroupLabel('Events').tags.includes('event'));
  assert.deepEqual(wiki.readGroupLabel('Some Other Thing').tags, [], 'other words mean nothing');
  assert.equal(wiki.readGroupLabel('Some Other Thing').event, null);
});

await test('every way of naming a season gives one id', () => {
  const season = wiki.seasonFromLabel;
  assert.equal(season('[[List of previous Battle Passes/2022-2026#Season 1|Season 1 Battle Pass]]'), 'ow2-s1');
  assert.equal(season('[[List of previous Battle Passes/2026#Season 5: A Grim Doctrine|Season 5]]'), '2026-s5');
  assert.equal(season('[[Battle Pass#Season 4:Heroes of Busan|Reign of Talon Season 4 Battle Pass]]'), '2026-s4');
  assert.equal(season('<big>[[Season#Season 3: Into the Tiger\'s Den|Reign of Talon Season 3: Into the Tiger\'s Den]]</big>'), '2026-s3');
  assert.equal(season('[[Reign of Talon (competitive year)|Reign of Talon]]: [[Season 1: Conquest|Season 1]]'), '2026-s1');
  assert.equal(season('Season 4 (2026)'), '2026-s4');
  assert.equal(season('Season 2', { era: '2026' }), '2026-s2', 'a table can say its era once, at the top');
  assert.equal(season('Season 2'), 'ow2-s2');
  assert.equal(season('2016'), null);
  assert.equal(season('General'), null);
});

await test('a cosmetics table: a price isn\'t a year, and headers stack or sit side by side', () => {
  const table = `{{CTH|h=Ana|i=Skins|collapse=mw-collapsible}}
|-
{{CTS|n=Common (Free)}}
{{CPB|h=Ana Skin|l=Classic|n=Overwatch Classic||c=2|w1=1}}
{{CPB|h=Ana Skin|l=Overwatch 2|n=Overwatch|c=2}}
|-
{{CTS|n={{rl|e}} {{Credits}} 250|linend=|c=2}}
{{CTS|n={{rl|e}} {{Coins}} 1000}}
{{CPB|h=Ana Skin|n=Merciful|c=2}}
{{CPB|h=Ana Skin|n=Shrike|l=Shrike|c=2}}
|-
{{CTS|n=2019}}
{{CTS|n={{rl|l|Halloween Terror}} {{Credits}} 3000}}
{{CPB|h=Ana Skin|n=Corsair|c=4}}
|}`;
  const records = new Map(wiki.parseCosmeticTable(table, { type: 'skin', hero: 'ana', pageTitle: 'Ana/Cosmetics' }).map((record) => [record.name, record]));
  assert.equal(records.get('Merciful').rarity, 'epic');
  assert.deepEqual(records.get('Merciful').prices, [{ amount: 250, currency: 'credits' }]);
  assert.equal(records.get('Shrike').rarity, 'epic');
  assert.deepEqual(records.get('Shrike').prices, [{ amount: 1000, currency: 'coins' }], 'the second header covers the second column');
  assert.equal(records.get('Corsair').event, 'halloween-terror');
  assert.deepEqual(records.get('Corsair').prices, [{ amount: 3000, currency: 'credits' }]);
  assert.equal(records.get('Overwatch Classic').file, 'Ana Skin Classic.png');
});

await test('a spray table: each row names its hero, and a season heading holds', () => {
  const table = `{{CTH|h=Battle Pass|i=Sprays|t=[[Battle Pass]] [[Sprays]] ([[Season/2026|Reign of Talon]])}}
|-
{{CTS|n=[[List of previous Battle Passes/2026#Season 1: Conquest|Season 1]]|w=12%}}
{{CTS|n=General}}
{{CPB|h=Spray|n=Arcade|c=4}}
|-
{{CTS|n=Hero Specific}}
{{CPB|h=Spray Cassidy|n=Rise N' Shine}} '''([[Cassidy]])'''
{{CPB|h=Spray McCree|n=Old Name}} '''([[Cassidy]])'''
{{CPB|h=Genji Skin|n=2018 Pacific All-Stars<br>([[Genji]])}}
{{CPB|h=S76 Skin Away|n=Soldier|l=OWCS}}
|}`;
  const records = wiki.parseCosmeticTable(table, { type: 'spray', pageTitle: 'Sprays', core, defaults: { tags: ['battle-pass'], prices: [], acquisition: ['From a Battle Pass'] } });
  const by = new Map(records.map((record) => [record.name, record]));
  assert.equal(by.get('Arcade').hero, null);
  assert.equal(by.get('Arcade').season, '2026-s1', 'the table said its era at the top');
  assert.equal(by.get("Rise N' Shine").hero, 'cassidy');
  assert.equal(by.get("Rise N' Shine").season, '2026-s1');
  assert.ok(by.get('Arcade').tags.includes('battle-pass'));
  assert.equal(by.get('Old Name').hero, 'cassidy', 'an old hero name in a file still counts');
  assert.equal(by.get('2018 Pacific All-Stars').hero, 'genji', 'the hero note is not part of the name');
  assert.equal(by.get('Soldier').hero, 'soldier-76');
});

await test('galleries: a section\'s heading says what it lists, and other sections are skipped', () => {
  const page = `==Cosmetics==
===Player Icons===
<onlyinclude><gallery widths=100>
File: PI Uprising 2017.png|<center>Uprising 2017
</gallery></onlyinclude>
===Twitch Emotes===
<gallery>
File:Emote One.png|<center>Not a cosmetic
</gallery>
====Skins====
<gallery mode="nolines">
File:Venture Skin Monarch.png|[[File:Icon-Venture.png|20px]] {{rl|r|Monarch}}
File:Unknown Thing.png|{{rl|r|No Hero Here}}
</gallery>`;
  const records = wiki.parseGalleries(page, { pageTitle: 'Overwatch Esports', core, defaults: { tags: ['esports'] } });
  assert.deepEqual(records.map((record) => [record.type, record.hero, record.name, record.rarity]), [
    ['player-icon', null, 'Uprising 2017', null],
    ['skin', 'venture', 'Monarch', 'rare'],
  ]);
  assert.ok(records.every((record) => record.tags.includes('esports')));
  assert.equal(records[0].file, 'PI Uprising 2017.png');
  const rows = wiki.parseGalleries('<gallery>\nFile: PI League.png||Overwatch League\nFile: PI Snow.png|<center>Snowboarder (Baptiste)\nFile: PI Lich.png|<center>Lich King (2018)\n</gallery>', { type: 'player-icon', pageTitle: 'Player Icons', core });
  assert.deepEqual(rows.map((row) => [row.hero, row.name]), [[null, 'Overwatch League'], ['baptiste', 'Snowboarder'], [null, 'Lich King (2018)']]);
});

await test('name cards: groups span rows, seasons hold, and a note can name the hero', () => {
  const table = `; <big>[[Season#Season 1|Season 1]]</big>
{| class="wikitable"
|-
! Name
|-
| rowspan="2" |<center><big>'''[[List_of_previous_Battle_Passes/2022-2026#Season 1|Battle Pass]]'''</big></center>
|<center>[[:File:Genji Skin Cyber Demon.png|Cyber Demon]]<br>'''([[Genji]])'''
|<center>[[File:NameCard_Cyber Demon.png|450x450px]]
|
|-
|<center>Great Waves
|<center>[[File:NameCard_Great Waves.png|450x450px]]
|
|-
|rowspan="1"|<center><big>'''[[One-Punch_Man_x_Overwatch_2|One-Punch Man]]'''</big></center>
|<center>[[:File:Genji Skin Genos.png|Genos]] - [[Genji]]
|<center>[[File:NameCard_ Genos - Genji.png|450x450px]]
|<center>Was available in the [[Shop]].
|}
; <big>[[Season#Season 1: Conquest|Reign of Talon Season 1: Conquest]]</big>
{| class="wikitable"
|-
| rowspan="1" |<center><big>'''[[Shop]]'''</big></center>
|<center>Hearts & Stars</center>
|[[File:NameCard_Hearts_&_Stars.png|450x450px]]
|
|}`;
  const records = new Map(wiki.parseNameCards(table, { pageTitle: 'Name Cards', core }).map((record) => [record.name, record]));
  assert.equal(records.get('Cyber Demon').hero, 'genji');
  assert.equal(records.get('Cyber Demon').season, 'ow2-s1');
  assert.ok(records.get('Cyber Demon').tags.includes('battle-pass'));
  assert.ok(records.get('Great Waves').tags.includes('battle-pass'), 'a group cell covers the rows under it');
  assert.equal(records.get('Great Waves').hero, null);
  assert.equal(records.get('Genos').hero, 'genji');
  assert.equal(records.get('Genos').event, 'one-punch-man');
  assert.ok(records.get('Genos').tags.includes('shop'), 'from the note');
  assert.ok(records.get('Genos').acquisition.includes('Was available in the Shop.'));
  assert.equal(records.get('Hearts & Stars').season, '2026-s1');
  assert.equal(records.get('Hearts & Stars').file, 'NameCard Hearts & Stars.png');

  const progression = `{| class="wikitable"
|-
| rowspan="2" |<center><big>[[Ana]]</center>
|<center>Tier 1
|[[File:NameCard Ana - Tier 1.png|center|450x450px]]
|<center>Reach <b>Level 8</b> as Ana
|-
|<center>Tier 2
|[[File:NameCard Ana - Tier 2.png|center|450x450px]]
|<center>Reach <b>Level 15</b> as Ana
|}`;
  const tiers = wiki.parseNameCards(progression, { pageTitle: 'Name Cards', core });
  assert.deepEqual(tiers.map((record) => [record.hero, record.name, record.event]), [['ana', 'Ana - Tier 1', null], ['ana', 'Ana - Tier 2', null]], 'a hero in the group cell isn\'t an event');
  assert.ok(tiers[0].acquisition.includes('Reach Level 8 as Ana'));
});

await test('mythics: seasons span rows, weapons list their levels, and aspects are read', () => {
  const page = `intro
==List of Mythic Skins==
===Reign of Talon===
{| class="wikitable"
!'''Season'''
!'''Hero'''
!'''Name'''
!'''Image'''
!'''Customization Options'''
|-
| rowspan="2"|[[Season/2026#Season 1:Conquest|1]]
|[[Mercy]]
|{{rl|m|Celestial Guardian}}
|[[File:Mercy Skin Celestial Guardian.png|250x250px]]
|
* Ability VFX - 2
* Wings - 3
|-
|[[Mei]]
|{{rl|m|Hop Online!}}
|[[File:Mei Skin Hop Online!.png|250x250px]]
|
* Color - 3
|}
===Skin Descriptions===
==List of Mythic Aspects==
{| class="wikitable"
!Season
|-
|[[Season/2022-2026#Season_13|Season 13]]
|'''Gilded'''
|[[File:Gilded Icon.png|100px]]
|[[File:Genji Skin Cyber Demon(Gilded).png|200px]]
|
Coats the mythic skin with metallic gold
|}
== List of Mythic Weapons ==
=== Overwatch 2 ===
{| class="mw-collapsible wikitable"
!Season
|-
|[[Season|11]]
|[[File:Icon-Reinhardt.png|100x100px]]<br><center>
[[Reinhardt]]
|<center>[[File:Reinhardt_Weapon_Skin_Bound_Demon.png|200px]]<br>
'''Bound Demon'''
|
* '''Level 1''' ({{Mythic Prisms}} 50): Unlocks the base weapon skin.
* '''Level 2''' ({{Mythic Prisms}} 10): '''Eliminations''' enhances the effects.
|}
=== Reign of Talon ===
{| class="mw-collapsible wikitable"
!Season
|-
|[[Season|1]]
|[[File:Icon-Juno.png|100x100px]]<br><center>
[[Juno]]
|<center>[[File:Juno_Weapon_Skin_Star_Shooter.png|200px]]<br>
'''Star Shooter'''
|
* '''Level 1''' ({{Mythic Prisms}} 50): Unlocks the base weapon skin.
|}`;
  const items = new Map(wiki.parseMythics(page, core, 'Mythic Skins').map((item) => [item.name, item]));
  assert.equal(items.get('Celestial Guardian').season, '2026-s1');
  assert.equal(items.get('Hop Online!').season, '2026-s1', 'a season cell covers the row under it');
  assert.equal(items.get('Hop Online!').hero, 'mei');
  assert.deepEqual(items.get('Celestial Guardian').options, [{ name: 'Ability VFX', count: 2 }, { name: 'Wings', count: 3 }]);
  assert.equal(items.get('Bound Demon').kind, 'weapon');
  assert.equal(items.get('Bound Demon').season, 'ow2-s11');
  assert.equal(items.get('Bound Demon').prisms, 50);
  assert.deepEqual(items.get('Bound Demon').levels[1], { level: 2, prisms: 10, text: 'Eliminations enhances the effects.' });
  assert.equal(items.get('Star Shooter').season, '2026-s1', 'the section says the era');
  assert.deepEqual(wiki.parseMythicAspects(page, 'Mythic Skins').map((aspect) => [aspect.name, aspect.season, aspect.description]), [['Gilded', 'ow2-s13', 'Coats the mythic skin with metallic gold']]);
});

await test('player titles take their source from the section they\'re in', () => {
  const page = `== Overwatch ==
{| class="wikitable"
!Title
!Requirements
|-
|Stalwart Hero
|Win 250 games in any mode.
|}
== Battle Pass ==
{| class="wikitable"
|+ Season One Battle Pass Titles
!Title
!Requirements
|-
|Nomad
|Unlock Tier 85 of Battle Pass Season 1 Prestige Tiers.
|-
|Immortal
|Unlock Tier 100 of Battle Pass Season 5 (2026) Prestige Tiers
|}`;
  const titles = new Map(wiki.parseTitles(page, 'Player Titles').map((title) => [title.name, title]));
  assert.ok(titles.get('Stalwart Hero').tags.includes('challenge'));
  assert.ok(titles.get('Nomad').tags.includes('battle-pass'));
  assert.equal(titles.get('Nomad').season, 'ow2-s1');
  assert.equal(titles.get('Immortal').season, '2026-s5');
  assert.equal(titles.size, 3, 'a caption isn\'t a title');
});

await test('a tier\'s cell can hold several rewards of any kind', () => {
  const cell = `
Unlock [[Kiriko]]

{{rl|l|EDM|skin|D.Va}}

{{rl|e|CyberMari|charm}}

+20% XP All Season
{{Credits}} 100
{{rl|l|Legendary Loot Box}}
{{rl|e|Spell Potion - Weapon Charm}}
{{Mythic Prisms}} 10
{{Raritylink|text=Other Way|rarity=r|type=pi}}`;
  const rewards = wiki.parseRewardCell(cell, core);
  assert.deepEqual(rewards.map((reward) => [reward.name, reward.type, reward.typeLabel, reward.hero, reward.rarity]), [
    ['Unlock Kiriko', null, 'Hero', null, null],
    ['EDM', 'skin', null, 'dva', 'legendary'],
    ['CyberMari', 'weapon-charm', null, null, 'epic'],
    ['+20% XP All Season', null, 'XP boost', null, null],
    ['100 Credits', null, 'Credits', null, null],
    ['Legendary Loot Box', null, 'Loot Box', null, 'legendary'],
    ['Spell Potion', 'weapon-charm', null, null, 'epic'],
    ['10 Mythic Prisms', null, 'Mythic Prisms', null, null],
    ['Other Way', 'player-icon', null, null, 'rare'],
  ]);
  assert.deepEqual(wiki.parseRewardCell('', core), []);
});

await test('Battle Passes: free and premium cells, prestige tiers and numbered tracks', () => {
  const page = `This is a list.

== Season 1 ==
===Free===
* 2 {{rl|E}} [[Skins]]

===Tiers===
{| class="wikitable"
! colspan="3" | Season 1 Battle Pass {{Anchor|Season 1 Battle Pass}}
|-
! Tier
! style="width:45%" | Free
! style="width:45%" | Premium
|-
|1
|
|
{{rl|l|EDM|skin|D.Va}}

{{rl|e|CyberMari|charm}}
|-
|2
|{{rl|r|Cybermari|icon}}
|
|-
|5
|{{Credits}} 250
|{{rl|c|Salute|spray|Winston}}
|-
! colspan="3" | Prestige Tiers
|-
|85
| colspan="2" | {{rl|p|Nomad|title}}
|}

==Season 4: Heroes of Busan==
=== Tiers ===
{| class="wikitable"
! colspan="4" |Season 4: Heroes of Busan Battle Pass (1) {{Anchor|x}}
|-
! Tier
|-
|1
|
|{{rl|l|Cyber Mechanic|skin|D.Va}}
|}

{| class="wikitable"
! colspan="4" |Season 4: Heroes of Busan Battle Pass (2) {{Anchor|x}}
|-
|1
|{{rl|c|Sing For Me!|voice|Shion}}
|
|}

{| class="wikitable"
! colspan="4" |Season 4: Heroes of Busan Battle Pass (Mythic) {{Anchor|x}}
|-
|1
|
|{{Mythic Prisms}} 10
|}

{| class="wikitable"
! colspan="4" |Season 4: Heroes of Busan Battle Pass (8) {{Anchor|x}}
|-
! colspan="3" | Prestige Tiers
|-
|10
| colspan="2" | {{rl|r|Squad Member|title}}
|}

== Not a Season ==
{| class="wikitable"
|-
|1
|{{rl|r|Should Not Appear|icon}}
|
|}`;
  const [first, fourth] = wiki.parseBattlePasses(page, { era: '2026', pageTitle: 'List of previous Battle Passes/2026', core });
  assert.equal(first.id, '2026-s1');
  assert.equal(first.label, '2026: Season 1');
  assert.equal(first.tiers, 3, 'prestige tiers aren\'t counted as tiers');
  assert.deepEqual(first.rewards.map((reward) => [reward.tier, reward.part, reward.track, reward.name]), [
    [1, null, 'premium', 'EDM'],
    [1, null, 'premium', 'CyberMari'],
    [2, null, 'free', 'Cybermari'],
    [5, null, 'free', '250 Credits'],
    [5, null, 'premium', 'Salute'],
    [85, 'Prestige', 'both', 'Nomad'],
  ]);
  assert.equal(first.note, null);
  assert.equal(fourth.title, 'Heroes of Busan');
  assert.deepEqual(fourth.rewards.map((reward) => [reward.part, reward.tier, reward.name]), [
    ['Track 1', 1, 'Cyber Mechanic'],
    ['Track 2', 1, 'Sing For Me!'],
    ['Mythic track', 1, '10 Mythic Prisms'],
    ['Prestige', 10, 'Squad Member'],
  ]);
  assert.equal(fourth.tiers, 3);
  assert.match(fourth.note, /tracks/);
  assert.ok(!JSON.stringify(fourth).includes('Should Not Appear'), 'a section ends at the next heading');
  assert.equal(wiki.parseBattlePasses(page, { era: 'ow2', pageTitle: 'x', core })[0].id, 'ow2-s1');
});

await test('season dates and titles are read, and a season with no name yet is left out', () => {
  assert.equal(wiki.parseDay('4 October 2022'), '2022-10-04');
  assert.equal(wiki.parseDay('December 9, 2025'), '2025-12-09');
  assert.equal(wiki.parseDay('February 2027'), null);
  assert.equal(wiki.parseDay('Soon'), null);
  const page = `==List of Seasons==
===Season 1===
[[File:Season 1.png|300px|thumb|Season 1 Roadmap]]
(4 October 2022 - 6 December 2022)

===Season 6: Invasion <span class="anchor" id="Season 6"></span>===
(10 August 2023 - 10 October 2023)
Seasons will now be named.
===Season 15: Honor and Glory ===
(February 18 - 22 April 2025)
===Season 16: Stadium===
(April 22 - June 24, 2025)
===Season 20: Vendetta===
(December 9, 2025 - February 10, 2026)
=== Season 21: TBA <span class="anchor" id="Season 21"></span>===
(8 December 2026 - February 2027)
`;
  const seasons = wiki.parseSeasonList(page, { era: 'ow2' });
  assert.deepEqual(seasons.map((season) => [season.id, season.title, season.start, season.end]), [
    ['ow2-s1', null, '2022-10-04', '2022-12-06'],
    ['ow2-s6', 'Invasion', '2023-08-10', '2023-10-10'],
    ['ow2-s15', 'Honor and Glory', '2025-02-18', '2025-04-22'],
    ['ow2-s16', 'Stadium', '2025-04-22', '2025-06-24'],
    ['ow2-s20', 'Vendetta', '2025-12-09', '2026-02-10'],
  ]);
  assert.equal(seasons[0].file, 'Season 1.png', 'the picture at the top of a section is its art');
  assert.equal(seasons[1].file, null, 'a picture further down isn\'t');
  assert.equal(wiki.parseSeasonList(page, { era: '2026' })[0].id, '2026-s1');
  assert.equal(wiki.parseSeasonList(page, { era: '2026' })[0].era, 'reign-of-talon');
});

await test('the rules for buying a past pass are read exactly, or not at all', () => {
  const rules = wiki.parseUnvaultRules(`== Unvaulted Battle Passes ==
Unvaulted Battle Pass has been introduced in Reign of Talon Season 5. Each previous battle passes costs 1000 {{Coins}} and permanently available on your Overwatch account. Mythic skin, Mythic Prisms, Overwatch Coins, player titles, and XP boosts does not included.

==References==
Mythic Tiers`, 'Battle Pass');
  assert.equal(rules.coins, 1000);
  assert.equal(rules.since, '2026-s5');
  assert.deepEqual(rules.excludes, ['Mythic skins', 'Mythic Prisms', 'Overwatch Coins', 'Player titles', 'XP boosts']);
  assert.equal(rules.sources[0].title, 'Battle Pass');
  assert.equal(wiki.parseUnvaultRules('== Unvaulted Battle Passes ==\nComing later.', 'Battle Pass'), null);
  assert.equal(wiki.parseUnvaultRules('nothing here', 'Battle Pass'), null);
});

await test('wiki pictures: videos show a frame, shop art comes first, and a season without shop art uses its own', async () => {
  resetData();
  api.shop = shopAnswer([section('Overwatch Shop', [single])]);
  await sync();
  const row = (type, hero, name, file) => ({ type, hero, name, file, tags: ['gallery'], pageTitle: 'x' });
  write('wiki/catalog.json', [
    row('skin', 'illari', 'Eclypse', 'Illari Skin Eclypse.png'),
    row('emote', 'ana', 'Dance', 'Ana Emote Dance.webm'),
    row('spray', 'ana', 'Citrus', "Spray Ana Rise N' Shine.png"),
    { type: 'voice-line', hero: 'ana', name: 'Hush', tags: [], pageTitle: 'x' },
  ]);
  write('wiki/seasons.json', [{ id: 'ow2-s1', label: 'Season 1', era: 'overwatch-2', number: 1, start: '2022-10-04', end: '2022-12-06', title: null, file: 'Season 1.png' }]);
  write('wiki/battle-passes.json', [{ id: 'ow2-s1', seasonId: 'ow2-s1', label: 'Season 1', title: null, start: null, end: null, image: null, tiers: 80, note: null, sources: [], rewards: [{ tier: 1, part: null, track: 'free', name: 'Dance', type: 'emote', typeLabel: null, hero: 'ana', rarity: 'epic', quantity: null }] }]);
  write('wiki/mythic-aspects.json', [{ name: 'Gilded', season: 'ow2-s1', description: 'Gold', file: 'Genji Skin Cyber Demon(Gilded).png', sources: [] }]);
  write('config.json', { wikiImages: true });
  await buildCatalog({ now: new Date('2026-11-05T00:00:00Z') });
  const eclypse = shardFor('skin.illari.eclypse');
  assert.match(eclypse.image, /catalog\.blzstatic\.com/, 'official shop art comes first');
  assert.ok(eclypse.images.includes('https://overwatch.weirdgloop.org/images/Illari_Skin_Eclypse.png'), 'with the wiki\'s picture as a second view');
  assert.equal(shardFor('emote.ana.dance').image, 'https://overwatch.weirdgloop.org/images/thumb/Ana_Emote_Dance.webm/640px--Ana_Emote_Dance.webm.jpg');
  assert.equal(shardFor('spray.ana.citrus').image, "https://overwatch.weirdgloop.org/images/Spray_Ana_Rise_N'_Shine.png");
  assert.equal(shardFor('voice-line.ana.hush').image, null);
  assert.equal(readOut('battle-passes.json')[0].image, 'https://overwatch.weirdgloop.org/images/Season_1.png');
  assert.equal(readOut('battle-passes/ow2-s1.json').rewards[0].image, shardFor('emote.ana.dance').image);
  assert.match(readOut('mythic-aspects.json')[0].image, /Cyber_Demon\(Gilded\)\.png$/);
  rmSync(path.join(dataDir, 'config.json'));
  await buildCatalog({ now: new Date('2026-11-05T00:00:00Z') });
  assert.equal(shardFor('emote.ana.dance').image, null, 'and all of it is one setting');
  assert.equal(readOut('battle-passes.json')[0].image, null);
});

await test('rewards give cosmetics their season and link back to them', async () => {
  resetData();
  const wikiRow = (type, hero, name, over = {}) => ({ type, hero, name, tags: ['gallery'], pageTitle: 'x', ...over });
  write('wiki/catalog.json', [
    wikiRow('skin', 'dva', 'EDM', { rarity: 'legendary', tags: ['battle-pass'], acquisition: ['From a Battle Pass'] }),
    wikiRow('player-title', null, 'Netbreaker'),
    wikiRow('skin', 'soldier-76', 'Gladiator'),
    wikiRow('spray', 'mei', 'Ice Wall', { season: 'ow2-s9' }),
    wikiRow('emote', 'kiriko', 'Fox Dance'),
    wikiRow('voice-line', 'moira', 'Science demands it.'),
    wikiRow('voice-line', 'ana', 'Children, behave.'),
  ]);
  write('wiki/seasons.json', [
    { id: 'ow2-s1', label: 'Season 1', era: 'overwatch-2', number: 1, start: '2022-10-04', end: '2022-12-06', title: null },
    { id: 'ow2-s2', label: 'Season 2', era: 'overwatch-2', number: 2, start: '2022-12-06', end: '2023-02-07', title: 'Second' },
  ]);
  write('wiki/battle-pass-rules.json', { coins: 1000, since: '2026-s5', excludes: ['Player titles', 'XP boosts', 'Mythic Prisms', 'Mythic skins', 'Overwatch Coins'], sources: [] });
  const reward = (tier, name, type, over = {}) => ({ tier, part: null, track: 'premium', name, type, typeLabel: null, hero: null, rarity: null, quantity: null, ...over });
  write('wiki/battle-passes.json', [
    {
      id: 'ow2-s2', seasonId: 'ow2-s2', label: 'Season 2', title: 'Second', start: null, end: null, image: null, tiers: 80, note: null, sources: [{ source: 'Overwatch Wiki', title: 'Pass Page', url: 'https://overwatch.wiki/w/Pass', checkedAt: null }],
      rewards: [
        reward(4, 'EDM', 'skin', { hero: 'dva', rarity: 'legendary' }),
        reward(9, 'Brand New', 'skin', { hero: 'ana', rarity: 'epic' }),
      ],
    },
    {
      id: 'ow2-s1', seasonId: 'ow2-s1', label: 'Season 1', title: null, start: null, end: null, image: null, tiers: 80, note: null, sources: [{ source: 'Overwatch Wiki', title: 'Pass Page', url: 'https://overwatch.wiki/w/Pass', checkedAt: null }],
      rewards: [
        reward(1, 'EDM', 'skin', { hero: 'dva', rarity: 'legendary' }),
        reward(85, 'Netbraker', 'player-title', { part: 'Prestige', track: 'both', rarity: 'rare' }),
        reward(2, 'Gladiator: LXXVI', 'skin', { hero: 'soldier-76' }),
        reward(3, 'Ice Wall', 'spray', { hero: 'mei' }),
        reward(4, 'Fox Dance', 'emote'),
        reward(5, 'Not On Its Page', 'voice-line', { hero: 'moira' }),
        reward(6, '250 Credits', null, { typeLabel: 'Credits' }),
        reward(7, '10 Mythic Prisms', null, { typeLabel: 'Mythic Prisms' }),
        reward(8, 'New Hero Skin', 'skin'),
      ],
    },
  ]);
  await buildCatalog({ now: new Date('2026-11-05T00:00:00Z') });
  const edm = shardFor('skin.dva.edm');
  assert.equal(edm.season, 'ow2-s1', 'a reward that returned keeps its first season');
  assert.deepEqual(edm.acquisition.slice().sort(), ['Season 1 Battle Pass, tier 1 (premium)', 'Season 2 Battle Pass, tier 4 (premium)'], 'specific lines replace the general one');
  assert.ok(edm.tags.includes('battle-pass'));
  assert.equal(shardFor('skin.soldier-76.gladiator').season, 'ow2-s1', 'a longer name in the tier list still finds it');
  assert.equal(shardFor('spray.mei.ice-wall').season, 'ow2-s9', 'a season a table already gave is kept');
  const title = shardFor('player-title.netbreaker');
  assert.equal(title.rarity, 'rare', 'a letter off in the tier list still finds it, and gives it its rarity');
  assert.ok(title.acquisition.includes('Season 1 Battle Pass, Prestige, tier 85 (free and premium)'));
  const made = shardFor('skin.ana.brand-new');
  assert.equal(made.season, 'ow2-s2', 'a cosmetic only the tier list names gets a record');
  assert.equal(made.rarity, 'epic');
  assert.ok(made.sources.some((source) => source.url === 'https://overwatch.wiki/w/Pass'));

  const first = readOut('battle-passes/ow2-s1.json');
  const by = new Map(first.rewards.map((item) => [item.name, item]));
  assert.equal(first.label, 'Season 1');
  assert.equal(first.start, '2022-10-04', 'dates come from the season list');
  assert.equal(by.get('EDM').id, 'skin.dva.edm');
  assert.equal(by.get('Fox Dance').id, 'emote.kiriko.fox-dance', 'one cosmetic of that name, so the missing hero is no problem');
  assert.equal(by.get('Not On Its Page').id, null, 'a voice line title can\'t safely become a new record');
  assert.equal(by.get('New Hero Skin').id, null, 'nor can a skin with no hero');
  assert.equal(by.get('250 Credits').id, null);
  assert.equal(by.get('10 Mythic Prisms').notInUnvault, true);
  assert.equal(by.get('Netbraker').notInUnvault, true);
  assert.equal(by.get('EDM').notInUnvault, false);
  assert.equal(by.get('Netbraker').part, 'Prestige');
  assert.deepEqual(readOut('battle-pass-rules.json').coins, 1000);
  const list = readOut('battle-passes.json');
  assert.equal(list.find((pass) => pass.id === 'ow2-s2').title, 'Second');
  assert.ok(!('rewards' in list[0]), 'the list stays small');
});

await test('tracks each count from 1, so progress keeps their tiers apart', () => {
  const rewards = [
    { tier: 1, part: 'Track 1', track: 'free', name: 'a', id: null },
    { tier: 1, part: 'Track 2', track: 'free', name: 'b', id: null },
    { tier: 1, part: null, track: 'free', name: 'c', id: null },
  ];
  assert.deepEqual(rewards.map(core.rewardTierKey), ['Track 1/1', 'Track 2/1', '1']);
  const entries = { [core.entryKey('tier', core.tierId('p', 'Track 1/1'))]: [1, 1] };
  const result = core.passProgress({ id: 'p', rewards }, entries);
  assert.equal(result.tiers.total, 3);
  assert.equal(result.tiers.done, 1);
});

await test('legendary and collaboration weapon skins are read, and mythic ones are left to their own list', () => {
  const page = `==List of Weapon Skins==
===Legendary===
;<big><big>{{rl|l|Hard Light}}</big></big>
{| class="wikitable"
|-
{{Hero table cell|Reaper|size=100x100px}}
{{CPB|h=Reaper Weapon Skin|n=Hard Light|thumb}}
|Details
|-
{{Hero table cell|Mercy|span=2}}
{{CPB|h=Mercy Weapon Skin|l=Hard Light Staff|n=Hard Light}}
|-
{{CPB|h=Mercy Weapon Skin|l=Hard Light Blaster|n=Hard Light}}
|}
===Collab Skins===
;<big><big>{{rl|l|Nerf}}</big></big>
{| class="wikitable"
|-
{{CPB|h=Baptiste Weapon Skin|n=Nerf Loadout Commander}}
|}
===Mythic===
{| class="wikitable"
|-
{{CPB|h=Ana Weapon Skin|n=Should Not Appear}}
|}`;
  const records = wiki.parseWeaponSkins(page, { core, pageTitle: 'Weapon Skins' });
  assert.deepEqual(records.map((record) => `${record.hero}|${record.name}`), ['reaper|Hard Light', 'mercy|Hard Light', 'baptiste|Nerf Loadout Commander']);
  assert.deepEqual(records[0].prices, [{ amount: 1200, currency: 'coins' }]);
  assert.equal(records[2].event, 'nerf');
  assert.ok(records[2].tags.includes('collab'));
  assert.deepEqual(records[2].prices, []);
});

await test('one export becomes one catalogue: league skins, team skins, merged pages and stated rarities', () => {
  const heroIds = new Set(['ana', 'genji', 'mercy', 'kiriko']);
  const page = (title, text) => ({ title, timestamp: '2026-11-05T00:00:00Z', text });
  const exported = {
    pages: [
      page('Ana/Cosmetics', `==Skins==
;{{rl|e|Shrike}} / {{rl|l|Sniper}}
:Both of these.
==Overwatch League Teams==
{{CTH|h=Ana|i=Overwatch League}}
|-
{{OWLSkinsHero|h=Ana|w1=1}}
|}`),
      page('Template:OWLSkinsHero', `<noinclude>{{doc}}</noinclude><includeonly>
{{CTS|n=Epic ([[Overwatch League]]) (100 {{League Tokens}})}}
{{CPB|h={{{h}}} Skin|n=Atlanta Reign|l=Reign|w1={{{w1|}}}|w2={{{w2|}}}}}
{{CPB|h={{{h}}} Skin|n=Atlanta Reign Away|l=Reign Away|w1={{{w1|}}}}}
</includeonly>`),
      page('Template:OWCS Skins', `{{Template:ESports skins table header|h=Overwatch Champions Series|i=Skins}}
|-
{{CTS|n=Home}}
{{CPB|h=Ana Skin|n=Ana|l=OWCS|w1=1|}}
|-
{{CTS|n=Away}}
{{CPB|h=Ana Skin Away|n=Ana|l=OWCS|w1=1|}}
|}`),
      page('Template:Ana Skins', '{{CTS|n={{rl|e}} {{Coins}} 1000}}\n{{CPB|h=Ana Skin|n=Shrike}}\n{{CPB|h=Ana Skin|n=Citrine}}'),
      page('Template:Ana Sprays', '{{CTS|n=[[Winter Wonderland]]}}\n{{CPB|h=Spray Ana|n=Ornament}}'),
      page('Template:OW1 Winter Wonderland Sprays', '{{CTS|n=Hero Specific}}\n{{CPB|h=Spray Ana|n=Ornament}}\n{{CPB|h=Spray Genji|n=Ornament}}\n{{CPB|h=Spray|n=Snowball}}'),
      page('Template:Battle Pass Sprays 1', '{{CTH|h=Battle Pass|i=Sprays}}\n{{CTS|n=Season 3}}\n{{CPB|h=Spray Ana|n=Pass Spray}}'),
      page('Template:Ana Weapon Skins', '{{CTS|n={{rl|m}} - [[Mythic Shop]] {{Mythic Prisms}} 50}}\n{{CPB|h=Ana Weapon Skin|n=Midnight Sun}}'),
      page('Mythic Skins', `== List of Mythic Weapons ==
=== Overwatch 2 ===
{| class="wikitable"
|-
|[[Season|12]]
|[[File:Icon-Ana.png|100x100px]]
|<center>[[File:Ana_Weapon_Skin_Midnight_Sun.png|250px]]<br>'''Midnight Sun'''
|
* '''Level 1''' ({{Mythic Prisms}} 50): Base.
|-
|[[Season|18]]
|[[File:Icon-Kiriko.png|100x100px]]
|<center>[[File:Kiriko_Weapon_Skin_Fox.png|250px]]<br>'''Fox Blade'''
|
* '''Level 1''' ({{Mythic Prisms}} 50): Base.
|}`),
      page('Template:Shop Player Icons', '<gallery>\nFile: PI Witch.png|<center>Witch\n</gallery>'),
      page('Player Icons', '<gallery>\nFile: PI Logo.png|<center>Logo\n</gallery>'),
      page('Template:Seasons Name Cards', '; [[Season#Season 1|Season 1]]\n{|\n|-\n| rowspan="1" |<big>[[Shop]]</big>\n|Witch Card\n|[[File:NameCard_Witch.png|450px]]\n|\n|}'),
      page('Template:Navbox', 'not a cosmetic'),
    ],
  };
  const result = wiki.normalizeExport(exported, core, { heroIds });
  const by = new Map(result.records.map((record) => [`${record.type}|${record.hero ?? ''}|${record.name}`, record]));
  const league = by.get('skin|ana|Atlanta Reign');
  assert.equal(league.rarity, 'epic');
  assert.ok(league.tags.includes('esports'));
  assert.deepEqual(league.prices, [{ amount: 100, currency: 'league-tokens' }]);
  assert.equal(league.file, 'Ana Skin Reign.png', 'the hero is filled in from the page that uses the template');
  assert.ok(by.has('skin|ana|Atlanta Reign Away'));
  assert.ok(by.has('skin|ana|OWCS'), 'a team skin is named for the team, not the hero');
  assert.ok(by.get('skin|ana|OWCS Away').tags.includes('esports'));
  assert.equal(by.get('skin|ana|OWCS Away').file, 'Ana Skin Away OWCS.png');
  assert.equal(by.get('skin|ana|Shrike').description, 'Both of these.');
  const ornament = by.get('spray|ana|Ornament');
  assert.equal(ornament.event, 'winter-wonderland', 'two pages, one record');
  assert.equal(ornament.rarity, 'common', 'the Sprays page says all sprays are Common');
  assert.equal(result.records.filter((record) => record.type === 'spray' && record.hero === 'ana' && record.name === 'Ornament').length, 1);
  assert.equal(by.get('spray|genji|Ornament').event, 'winter-wonderland');
  assert.equal(by.get('spray||Snowball').hero, null);
  assert.equal(by.get('spray|ana|Pass Spray').season, 'ow2-s3');
  assert.ok(by.get('spray|ana|Pass Spray').tags.includes('battle-pass'));
  assert.equal(by.get('player-icon||Witch').rarity, 'rare');
  assert.ok(by.get('player-icon||Witch').tags.includes('shop'));
  assert.ok(by.has('player-icon||Logo'));
  assert.equal(by.get('name-card||Witch Card').season, 'ow2-s1');
  assert.equal(by.get('weapon-skin|ana|Midnight Sun').season, 'ow2-s12', 'the mythic list gives the hero table its season');
  assert.ok(by.has('weapon-skin|kiriko|Fox Blade'), 'a mythic the hero table leaves out still gets a record');
  assert.equal(result.mythics.filter((item) => item.name === 'Midnight Sun').length, 1, 'listed in two places, one mythic');
  assert.ok(result.unused.includes('Template:Navbox'));
  assert.ok(!wiki.normalizeExport({ pages: [page('Template:Ana Emotes', '{{CTS|n={{rl|e}}}}\n{{CPB|h=Ana Emote|n=TBA}}\n{{CPB|h=Ana Emote|n=Dance}}')] }, core, { heroIds }).records.some((record) => record.name === 'TBA'), 'a placeholder isn\'t a cosmetic');
});

await test('shop and wiki records join on one cosmetic, even when their names and heroes differ', async () => {
  resetData();
  const row = (name, typeLabel, key) => ({ name, type: typeLabel, rarity: { name: 'Rare', color: '#fff' }, image: `https://catalog.blzstatic.com//x/${key}.png`, quantity: 1, itemKey: key, paint: null });
  const bundle = listing({
    id: 'b',
    itemKey: 'ow:bundle:700',
    name: 'Join Bundle',
    type: 'Bundle 9',
    contents: [
      row('Mercy Winged Victory', 'Skins · Mercy', 'ow:item:1'),
      row('Call me Lily', 'Voice Lines · D.Va', 'ow:item:2'),
      row('Advanced Icon', 'Player Icons · Ana', 'ow:item:3'),
      row('Team Spray', 'Sprays', 'ow:item:4'),
      row('Both Heroes', 'Sprays', 'ow:item:5'),
      row('Team Skin', 'Skins · Ana', 'ow:item:6'),
      row('Team Skin', 'Skins · Genji', 'ow:item:7'),
      row('Team Skin', 'Skins', 'ow:item:8'),
      row('Other Skin', 'Skins', 'ow:item:9'),
    ],
  });
  api.shop = shopAnswer([section('Overwatch Shop', [bundle])]);
  await sync();
  const wikiRow = (type, hero, name) => ({ type, hero, name, rarity: 'epic', tags: ['gallery'], pageTitle: 'x' });
  write('wiki/catalog.json', [
    wikiRow('skin', 'mercy', 'Winged Victory'),
    wikiRow('voice-line', 'dva', 'You can just call me Lily. Hehe.'),
    wikiRow('player-icon', null, 'Advanced Icon'),
    wikiRow('spray', 'genji', 'Team Spray'),
    wikiRow('spray', 'ana', 'Both Heroes'),
    wikiRow('spray', 'genji', 'Both Heroes'),
    wikiRow('skin', 'ana', 'Team Skin'),
    wikiRow('skin', 'genji', 'Team Skin'),
    wikiRow('skin', 'mercy', 'Team Skin'),
    wikiRow('skin', 'ana', 'Other Skin'),
    wikiRow('skin', 'genji', 'Other Skin'),
  ]);
  await buildCatalog({ now: new Date('2026-11-05T00:00:00Z') });
  const ids = new Set(readOut('catalog.json').map((row_) => row_.id));
  assert.ok(ids.has('skin.mercy.winged-victory'));
  assert.ok(!ids.has('skin.mercy.mercy-winged-victory'), 'the hero in the shop\'s name doesn\'t make a second skin');
  assert.deepEqual(shardFor('skin.mercy.winged-victory').bundles, ['700']);
  assert.ok(ids.has('voice-line.dva.you-can-just-call-me-lily-hehe'));
  assert.ok(!ids.has('voice-line.dva.call-me-lily'), 'a short title joins the whole line');
  assert.ok(ids.has('player-icon.ana.advanced-icon'), 'the shop\'s hero fills in what the wiki left out');
  assert.ok(!ids.has('player-icon.advanced-icon'));
  assert.ok(ids.has('spray.genji.team-spray') && !ids.has('spray.team-spray'), 'a name only one hero has');
  assert.ok(ids.has('spray.both-heroes'), 'two heroes share this name, so the shop\'s unlabeled one stays apart');
  assert.deepEqual(shardFor('skin.mercy.team-skin').bundles, ['700'], 'the only hero the bundle doesn\'t already name');
  const items = readOut('bundles.json').find((item) => item.id === '700').items;
  assert.equal(items.find((item) => item.name === 'Other Skin').id, null, 'two heroes are left, so it isn\'t guessed');
  assert.deepEqual(shardFor('voice-line.dva.call-me-lily'), { aliasOf: 'voice-line.dva.you-can-just-call-me-lily-hehe' }, 'its old link still leads there');
});

await test('a past shop read after a newer one only fills gaps', () => {
  const listing = (fields) => ({ key: 'ow:item:1', name: 'x', kind: 'item', typeLabel: null, rarity: null, image: null, statedCount: null, url: null, contents: [], ...fields });
  const snapshot = (fields) => ({ sections: [{ listings: [listing(fields)] }] });
  const items = {};
  mergeItems(items, snapshot({ name: 'New name', image: 'new.png', contents: [{ key: 'a', name: 'A' }] }), '2026-11-01T00:00:00Z');
  mergeItems(items, snapshot({ name: 'Old name', image: 'old.png', rarity: 'Rare', url: 'https://example.com', contents: [{ key: 'b', name: 'B' }] }), '2026-10-01T00:00:00Z');
  const item = items['ow:item:1'];
  assert.equal(item.name, 'New name');
  assert.equal(item.image, 'new.png');
  assert.equal(item.rarity, 'Rare', 'a gap is filled');
  assert.equal(item.url, 'https://example.com');
  assert.deepEqual(item.contents.map((content) => content.key), ['a']);
  assert.equal(item.firstSeen, '2026-10-01T00:00:00Z');
  assert.equal(item.lastSeen, '2026-11-01T00:00:00Z');
  mergeItems(items, snapshot({ name: 'Newest name', image: 'newest.png', contents: [] }), '2026-11-02T00:00:00Z');
  assert.equal(items['ow:item:1'].name, 'Newest name');
  assert.equal(items['ow:item:1'].image, 'newest.png');
  assert.equal(items['ow:item:1'].rarity, 'Rare', 'a blank value never replaces a known one');
  assert.deepEqual(items['ow:item:1'].contents.map((content) => content.key), ['a']);
});

await test('export links keep their settings, stay short and include every page', () => {
  const links = wiki.exportLinks(Array.from({ length: 54 }, (_, index) => `Hero Number ${index}`));
  assert.ok(links.length >= 2);
  const pages = [];
  for (const link of links) {
    assert.ok(link.length <= 1700, `link is ${link.length} long`);
    const url = new URL(link);
    assert.equal(url.search.indexOf('curonly=1'), 1, 'settings come first');
    assert.equal(url.searchParams.get('templates'), '1');
    pages.push(...url.searchParams.get('pages').split('\n'));
  }
  assert.ok(pages.includes('Hero Number 0/Cosmetics') && pages.includes('Hero Number 53/Quotes') && pages.includes('Mythic Skins'));
  assert.equal(new Set(pages).size, pages.length, 'no page twice');
});

await test('markup becomes plain text', () => {
  assert.equal(wiki.plainText("'''Bold''' [[Link|label]] [[Page]] {{Coins}} 5 <center>x</center>"), 'Bold label Page 5 x');
  assert.equal(wiki.plainText('{{rl|e|Citrine}}'), 'Citrine');
});

await test('an export becomes one normalized catalogue, with mythics linked and weapons found', () => {
  const heroIds = new Set(['ana']);
  const { records, mythics, events, unused } = wiki.normalizeExport(wiki.readExport(exportXml(PAGES)), core, { heroIds });
  assert.ok(records.some((record) => record.type === 'weapon-charm' && record.name === 'Double Dice'));
  assert.ok(records.some((record) => record.type === 'player-title'));
  assert.equal(records.find((record) => record.name === 'Citrine').description, "Ana's biotic rifle uses a modified technology.");
  const skin = mythics.find((item) => item.kind === 'skin');
  assert.equal(skin.prisms, 80);
  const weapon = mythics.find((item) => item.kind === 'weapon');
  assert.equal(weapon.name, 'Midnight Sun');
  assert.equal(weapon.prisms, 50);
  assert.ok(events.some((event) => event.id === 'lunar-new-year' && event.label === 'Lunar New Year'));
  assert.deepEqual(unused, ['Some Other Page']);
});

await test('a too-small export changes nothing', async () => {
  resetData();
  const file = path.join(work, 'small.xml');
  writeFileSync(file, exportXml([['Weapon Charms', CHARMS]]));
  await assert.rejects(wiki.importWikiExport(file), /nothing was changed/);
  assert.ok(!existsSync(path.join(dataDir, 'wiki/catalog.json')));
});

await test('wiki and shop records join into one cosmetic, with both sources', async () => {
  resetData();
  const file = path.join(work, 'export.xml');
  writeFileSync(file, exportXml(PAGES));
  await wiki.importWikiExport(file, { minRecords: 5 });
  api.shop = shopAnswer([section('Overwatch Shop', [listing({ itemKey: 'ow:bundle:700', type: 'Bundle 1', contents: [content('Citrine', 'Skins · Ana', 'Rare', 'ow:item:701')] })])]);
  await sync();
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  const detail = shardFor('skin.ana.citrine');
  assert.deepEqual(detail.sources.map((source) => source.source).sort(), ['Overwatch Wiki', 'itemshop.gg']);
  assert.deepEqual(detail.productIds, [701]);
  assert.equal(detail.availability, 'in-shop');
  assert.ok(detail.tags.includes('gallery') && detail.tags.includes('shop'));
  assert.equal(detail.description, "Ana's biotic rifle uses a modified technology.");
  assert.equal(detail.image, 'https://catalog.blzstatic.com//x/ow:item:701.png', 'Blizzard\'s image from the shop');
  assert.equal(shardFor('skin.ana.garnet').availability, 'gallery');
  const meta = readOut('meta.json');
  assert.ok(meta.sources.some((source) => source.id === 'wiki' && source.license === 'CC BY-NC-SA 3.0'));
  assert.equal(shardFor('skin.ana.garnet').image, null, 'wiki images stay off unless turned on');
  const mythics = readOut('mythics.json');
  const wargod = mythics.find((item) => item.name === 'A-7000 Wargod');
  assert.equal(wargod.cosmeticId, 'skin.ana.a-7000-wargod');
  assert.equal(shardFor('skin.ana.a-7000-wargod').mythic, wargod.id);
  write('config.json', { wikiImages: true });
  await buildCatalog({ now: new Date('2026-11-11T00:00:00Z') });
  assert.equal(shardFor('skin.ana.garnet').image, 'https://overwatch.weirdgloop.org/images/Ana_Skin_Garnet.png');
  assert.ok(readOut('meta.json').sources.find((source) => source.id === 'wiki').pictures, 'the credit knows pictures are on');
  rmSync(path.join(dataDir, 'config.json'));
});

// The real stored data
await test('the real stored data builds with no errors', async () => {
  const realDir = path.join(work, 'real');
  cpSync('data/cosmetics', realDir, { recursive: true });
  process.env.COSMETICS_DATA_DIR = realDir;
  const code = (await import('node:child_process')).spawnSync(process.execPath, ['scripts/cosmetics/cli.mjs', 'check'], { env: { ...process.env, COSMETICS_DATA_DIR: realDir }, encoding: 'utf8' });
  process.env.COSMETICS_DATA_DIR = dataDir;
  assert.equal(code.status, 0, code.stderr || code.stdout);
});

await test('real Twitch campaigns have sources, consistent dates and rising watch times', () => {
  const campaigns = JSON.parse(readFileSync('data/cosmetics/curated/twitch-drops.json', 'utf8'));
  assert.ok(campaigns.length > 0);
  const ids = new Set();
  for (const campaign of campaigns) {
    assert.ok(!ids.has(campaign.id), `duplicate ${campaign.id}`);
    ids.add(campaign.id);
    assert.ok(Date.parse(campaign.start) < Date.parse(campaign.end), campaign.id);
    if (campaign.claimUntil) assert.ok(Date.parse(campaign.claimUntil) >= Date.parse(campaign.end), campaign.id);
    assert.ok(campaign.sources.length > 0 && campaign.sources.every((source) => source.url.startsWith('https://')), campaign.id);
    const minutes = campaign.rewards.map((reward) => reward.minutes);
    assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b), `${campaign.id} watch times should rise`);
    assert.ok(minutes.every((value) => value > 0), campaign.id);
    const rewardIds = campaign.rewards.map((reward) => reward.id);
    assert.equal(new Set(rewardIds).size, rewardIds.length, campaign.id);
  }
});

await test('real in-game events each cite a Blizzard announcement', () => {
  const file = JSON.parse(readFileSync('data/cosmetics/curated/game-events.json', 'utf8'));
  assert.ok(file.events.length > 0);
  for (const event of file.events) {
    assert.ok(event.sources.length > 0 && event.sources.every((source) => source.url.startsWith('https://overwatch.blizzard.com/')), `${event.id} cites Blizzard`);
    assert.ok(event.sources.every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt ?? '')), `${event.id} says when it was checked`);
  }
  // Checked articles that hold no event to add are listed too, so the alert job doesn't raise them again.
  for (const article of file.reviewed ?? []) assert.ok(/^https:\/\/overwatch\.blizzard\.com\/en-us\/news\/\d+\//.test(article.url) && article.note, article.url);
});

await test('real loot pools make no claim without a source', () => {
  const pools = JSON.parse(readFileSync('data/cosmetics/curated/loot-pools.json', 'utf8'));
  assert.deepEqual(pools.map((pool) => pool.slug).sort(), ['anniversary', 'esports', 'just-for-you', 'standard']);
  for (const pool of pools) assert.ok(pool.sources.length > 0, pool.slug);
  for (const pool of pools) assert.ok(!/\d+(\.\d+)?\s*%/.test(`${pool.description} ${pool.basis}`), `${pool.slug} should state no drop rates`);
});

await test('real recorded shops have what a page needs', () => {
  const dir = 'data/cosmetics/shop/rotations';
  const items = JSON.parse(readFileSync('data/cosmetics/shop/items.json', 'utf8'));
  for (const file of readdirSync(dir)) {
    for (const line of readFileSync(path.join(dir, file), 'utf8').trim().split('\n')) {
      const rotation = JSON.parse(line);
      assert.ok(Number.isFinite(Date.parse(rotation.at)));
      assert.ok(file.startsWith(rotation.at.slice(0, 7)), `${rotation.id} is filed under the right month`);
      for (const section of rotation.sections) for (const [key] of section.listings) assert.ok(items[key], `${key} has details`);
    }
  }
  assert.ok(!JSON.stringify(items).includes('isg_'), 'no key in stored data');
});

server.close();
rmSync(work, { recursive: true, force: true });

console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`FAIL ${failure}`);
if (failures.length > 0) process.exitCode = 1;
