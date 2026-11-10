// Tests for the Hub's daily data: Blizzard's news list and the recorded hero rates. node scripts/test-hub.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { checkNewsFile, mergeNews, parseArticleSummary, parseNewsArticles, safeImage } from './hub/news.mjs';
import { checkRatesDay, compactRates, dayOf, RATE_VIEWS, updateIndex, viewUrl } from './hub/rates.mjs';

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

// Shaped like Blizzard's list: picture cards first, then list rows with a summary.
const CARD = (id, slug, title, image, stamp) => `<a slot="gallery-items" href="/news/${id}/${slug}" target="_blank"><blz-card orientation="vertical"><blz-image slot="media" src="${image}" width="880" height="440"></blz-image><blz-content-block size="small"><h3 slot="heading">${title}</h3></blz-content-block><blz-timestamp slot="footer" timestamp="${stamp}" lang="en-US"></blz-timestamp></blz-card></a>`;
const ROW = (id, slug, title, summary, image, stamp) => `<a href="/news/${id}/${slug}"><blz-list-item class="news" variant="feature" imagesrc="${image}" headingtext="${title}" descriptiontext="${summary}"><h1 slot="heading">${title}</h1><div slot="description"><p class="article-summary">${summary}</p><blz-timestamp class="date" timestamp="${stamp}" lang="en-US"></blz-timestamp></div><blz-image slot="image" src="${image}"></blz-image></blz-list-item></a>`;
const IMG = (name) => `https://bnetcmsus-a.akamaihd.net/cms/blog_thumbnail/ab/${name}.png`;
const PAGE = [
  CARD('24303010', 'reign-of-talon-s5-midcycle', 'Reign of Talon &ndash; S5 Midcycle', IMG('ONE'), '2026-11-03T19:00:00.000Z'),
  CARD('24304078', 'weekly-recall', 'Weekly(ish) Recall: Double The Doki', 'https://evil.test/x.png', '2026-10-20T16:00:00.000Z'),
  ROW('24295392', 'season-4-midcycle', 'Season 4 Midcycle Takes You To The BlizzCon Stage!', 'We come together in Team Drives &amp; at BlizzCon.', IMG('TWO'), '2026-09-04T17:00:00.000Z'),
  ROW('24295392', 'season-4-midcycle', 'Repeated', 'Repeated', IMG('TWO'), '2026-09-04T17:00:00.000Z'),
  '<a href="/news/patch-notes/">Patch notes</a>',
].join('');

await test('both kinds of entry on Blizzard\'s list are read, with Blizzard pictures only', () => {
  const articles = parseNewsArticles(PAGE);
  assert.deepEqual(articles.map((article) => article.id), ['24303010', '24304078', '24295392']);
  assert.deepEqual(articles[0], { id: '24303010', url: 'https://overwatch.blizzard.com/en-us/news/24303010/reign-of-talon-s5-midcycle/', title: 'Reign of Talon – S5 Midcycle', description: null, image: IMG('ONE'), publishedAt: '2026-11-03T19:00:00.000Z' });
  assert.equal(articles[1].image, null, 'a picture from anywhere else is dropped');
  assert.equal(articles[2].description, 'We come together in Team Drives & at BlizzCon.');
  assert.equal(safeImage('http://bnetcmsus-a.akamaihd.net/x.png'), null, 'https only');
});

await test('an article page gives its own summary when the list card has none', () => {
  assert.equal(parseArticleSummary('<head><meta name="description" content="Settle the score &amp; more."></head>'), 'Settle the score & more.');
  assert.equal(parseArticleSummary('<meta content="From the other side." property="og:description">'), 'From the other side.');
  assert.equal(parseArticleSummary('<head></head>'), null);
});

await test('kept articles keep what they had, the newest come first, and the list has a limit', () => {
  const kept = [{ id: '1', url: 'u1', title: 'Old', description: 'Kept summary', image: IMG('OLD'), publishedAt: '2026-01-01T00:00:00.000Z' }];
  const fresh = [
    { id: '1', url: 'u1', title: 'Old, renamed', description: null, image: null, publishedAt: '2026-01-01T00:00:00.000Z' },
    { id: '2', url: 'u2', title: 'New', description: 'Hi', image: IMG('NEW'), publishedAt: '2026-02-01T00:00:00.000Z' },
  ];
  const merged = mergeNews(kept, fresh);
  assert.deepEqual(merged.map((article) => article.id), ['2', '1']);
  assert.equal(merged[1].title, 'Old, renamed', 'a new title replaces the old');
  assert.equal(merged[1].description, 'Kept summary', 'a summary the list stopped showing is kept');
  assert.equal(merged[1].image, IMG('OLD'));
  assert.equal(mergeNews(kept, fresh, { keep: 1 }).length, 1);
});

await test('a stored news list with a foreign link or picture fails its check', () => {
  const good = { schema: 1, articles: parseNewsArticles(PAGE) };
  assert.deepEqual(checkNewsFile(good), []);
  const bad = { schema: 1, articles: [{ ...good.articles[0], url: 'https://evil.test/', image: 'https://evil.test/x.png' }, good.articles[0]] };
  const problems = checkNewsFile(bad);
  assert.ok(problems.some((problem) => /isn't Blizzard's article/.test(problem)));
  assert.ok(problems.some((problem) => /picture isn't from Blizzard/.test(problem)));
  assert.ok(problems.some((problem) => /listed twice/.test(problem)));
  assert.deepEqual(checkNewsFile({ articles: [] }), ['the file should have schema 1 and an articles list']);
});

await test('hero rates are recorded for every input, mode and region, compactly', () => {
  assert.equal(RATE_VIEWS.length, 12);
  assert.equal(new Set(RATE_VIEWS.map((view) => view.key)).size, 12);
  assert.equal(viewUrl(RATE_VIEWS[0]), 'https://overfast-api.tekrop.fr/heroes/stats?platform=pc&gamemode=quickplay&region=americas');
  const answer = Array.from({ length: 12 }, (_, index) => ({ hero: `hero-${String.fromCharCode(108 - index)}`, pickrate: index, winrate: 50 + index / 10, banrate: index === 3 ? 'n/a' : 1 }));
  answer.push({ hero: 'Bad Name', pickrate: 1, winrate: 1, banrate: 1 }, null);
  const rows = compactRates(answer);
  assert.equal(rows.length, 12, 'malformed rows are left out');
  assert.deepEqual(rows[0], ['hero-a', 11, 51.1, 1], 'sorted by hero');
  assert.equal(rows.find((row) => row[0] === 'hero-i')[3], null, 'a missing number stays missing');
  assert.throws(() => compactRates([{ hero: 'ana', pickrate: 1 }]), /only 1 heroes/);
  assert.throws(() => compactRates({}), /list of heroes/);
});

await test('the day list keeps 90 days, newest first, and says which fell off', () => {
  assert.equal(dayOf(Date.UTC(2026, 10, 10, 23, 59)), '2026-11-10');
  const days = Array.from({ length: 90 }, (_, index) => dayOf(Date.UTC(2026, 7, 1) + index * 86400000));
  const { index, dropped } = updateIndex({ days }, '2026-11-10');
  assert.equal(index.days.length, 90);
  assert.equal(index.days[0], '2026-11-10');
  assert.deepEqual(dropped, ['2026-08-01']);
  assert.deepEqual(updateIndex({ days: ['2026-11-10'] }, '2026-11-10').index.days, ['2026-11-10'], 'the same day twice is one day');
});

await test('a recorded day with a broken row or the wrong date fails its check', () => {
  const rows = Array.from({ length: 10 }, (_, index) => [`hero-${index}`, 1, 50, null]);
  const day = { day: '2026-11-10', recordedAt: '2026-11-10T05:00:00.000Z', views: { 'pc/competitive/europe': rows } };
  assert.deepEqual(checkRatesDay(day, '2026-11-10'), []);
  assert.deepEqual(checkRatesDay(day, '2026-11-11'), ['2026-11-11: the file is for another day']);
  const broken = { ...day, views: { 'pc/competitive/europe': [...rows.slice(1), ['ana', 1, 101, 0]] } };
  assert.match(checkRatesDay(broken, '2026-11-10')[0], /isn't \[hero, pick, win, ban\]/);
});

await test('the stored hub files pass their checks', () => {
  if (existsSync('public/data/news.json')) assert.deepEqual(checkNewsFile(JSON.parse(readFileSync('public/data/news.json', 'utf8'))), []);
  if (existsSync('public/data/rates/index.json')) {
    for (const day of JSON.parse(readFileSync('public/data/rates/index.json', 'utf8')).days) assert.deepEqual(checkRatesDay(JSON.parse(readFileSync(`public/data/rates/${day}.json`, 'utf8')), day), []);
  }
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((failure) => console.error('FAIL ' + failure));
  process.exit(1);
}
