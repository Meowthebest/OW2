// Keeps the Hub's daily data: Blizzard's news list and a copy of the hero rates.
//   node scripts/hub/cli.mjs news [--pages 2]   read the news list and its next pages, and keep what's new
//   node scripts/hub/cli.mjs rates [--force]    record today's hero rates, once a day unless forced
//   node scripts/hub/cli.mjs check              check the stored files
// Writes only when something changed, so a run with nothing new leaves no commit behind.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkNewsFile, mergeNews, NEWS_URL, nextArticlesUrl, parseArticleSummary, parseNewsArticles } from './news.mjs';
import { checkRatesDay, compactRates, dayOf, RATE_VIEWS, updateIndex, viewUrl } from './rates.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NEWS_FILE = path.join(ROOT, 'public/data/news.json');
const RATES_DIR = path.join(ROOT, 'public/data/rates');
const USER_AGENT = process.env.GITHUB_REPOSITORY ? `ow2-site-hub (+https://github.com/${process.env.GITHUB_REPOSITORY})` : 'ow2-site-hub';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function read(url, as) {
  let problem = 'no answer';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: as === 'json' ? 'application/json' : 'text/html', ...(url.includes('next-articles') ? { 'x-requested-with': 'XMLHttpRequest' } : {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return as === 'json' ? await response.json() : await response.text();
      problem = `it answered ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      problem = error.message;
    }
    await wait(2000 * attempt);
  }
  throw new Error(`Couldn't read ${url}: ${problem}`);
}

const readJsonFile = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const writeJsonFile = (file, value, pretty = true) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${pretty ? JSON.stringify(value, null, 1) : JSON.stringify(value)}\n`);
};

async function syncNews(pages) {
  const fresh = parseNewsArticles(await read(NEWS_URL, 'text'));
  if (fresh.length < 4) throw new Error(`Blizzard's news page listed only ${fresh.length} articles, so its layout may have changed`);
  for (let page = 1; page <= pages; page += 1) {
    await wait(1500);
    fresh.push(...parseNewsArticles(await read(nextArticlesUrl(page), 'text')).filter((article) => !fresh.some((known) => known.id === article.id)));
  }
  const stored = readJsonFile(NEWS_FILE, { schema: 1, articles: [] });
  // The picture cards at the top of the list carry no summary, so a new one gets it from its own page. A few a run at most.
  const kept = new Map(stored.articles.map((article) => [article.id, article]));
  const lacking = fresh.filter((article) => !article.description && !kept.get(article.id)?.description).slice(0, 6);
  for (const article of lacking) {
    await wait(1500);
    try {
      article.description = parseArticleSummary(await read(article.url, 'text'));
    } catch (error) {
      console.warn(`No summary for ${article.id}: ${error.message}`);
    }
  }
  const articles = mergeNews(stored.articles, fresh);
  if (JSON.stringify(articles) === JSON.stringify(stored.articles)) {
    console.log(`News: no change, ${articles.length} articles kept.`);
    return;
  }
  const file = { schema: 1, source: NEWS_URL, updatedAt: new Date().toISOString(), articles };
  const problems = checkNewsFile(file);
  if (problems.length) throw new Error(`The news list didn't pass its checks:\n${problems.join('\n')}`);
  writeJsonFile(NEWS_FILE, file);
  const added = articles.filter((article) => !kept.has(article.id)).length;
  console.log(`News: ${articles.length} articles kept, ${added} new.`);
}

async function recordRates(force) {
  const now = Date.now();
  const day = dayOf(now);
  const dayFile = path.join(RATES_DIR, `${day}.json`);
  if (existsSync(dayFile) && !force) {
    console.log(`Rates: ${day} is already recorded.`);
    return;
  }
  const views = {};
  for (const view of RATE_VIEWS) {
    try {
      views[view.key] = compactRates(await read(viewUrl(view), 'json'));
    } catch (error) {
      console.warn(`Rates: skipped ${view.key}: ${error.message}`);
    }
    await wait(1000);
  }
  if (Object.keys(views).length < RATE_VIEWS.length / 2) throw new Error(`Rates: only ${Object.keys(views).length} of ${RATE_VIEWS.length} views came back, so nothing was recorded`);
  const file = { day, recordedAt: new Date(now).toISOString(), source: 'OverFast API, from Blizzard\'s hero statistics', views };
  const problems = checkRatesDay(file, day);
  if (problems.length) throw new Error(`Today's rates didn't pass their checks:\n${problems.join('\n')}`);
  writeJsonFile(dayFile, file, false);
  const { index, dropped } = updateIndex(readJsonFile(path.join(RATES_DIR, 'index.json'), { days: [] }), day);
  for (const old of dropped) rmSync(path.join(RATES_DIR, `${old}.json`), { force: true });
  writeJsonFile(path.join(RATES_DIR, 'index.json'), index);
  console.log(`Rates: recorded ${Object.keys(views).length} views for ${day}, ${index.days.length} days kept.`);
}

function check() {
  const problems = [];
  if (existsSync(NEWS_FILE)) problems.push(...checkNewsFile(readJsonFile(NEWS_FILE, null)).map((problem) => `news: ${problem}`));
  const index = readJsonFile(path.join(RATES_DIR, 'index.json'), { days: [] });
  for (const day of index.days) {
    const file = path.join(RATES_DIR, `${day}.json`);
    if (!existsSync(file)) problems.push(`rates: ${day} is listed but has no file`);
    else problems.push(...checkRatesDay(readJsonFile(file, null), day).map((problem) => `rates: ${problem}`));
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`Hub data looks right: ${existsSync(NEWS_FILE) ? readJsonFile(NEWS_FILE, { articles: [] }).articles.length : 0} articles, ${index.days.length} days of rates.`);
}

const [command, ...rest] = process.argv.slice(2);
const pagesArg = rest.indexOf('--pages');
const pages = pagesArg === -1 ? 2 : Math.max(0, Math.min(10, Number(rest[pagesArg + 1]) || 0));
if (command === 'news') await syncNews(pages);
else if (command === 'rates') await recordRates(rest.includes('--force'));
else if (command === 'check') check();
else {
  console.error('Usage: node scripts/hub/cli.mjs news [--pages 2] | rates [--force] | check');
  process.exit(2);
}
