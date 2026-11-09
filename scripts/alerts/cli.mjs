// Checks for anything on the site that needs a person, and keeps one GitHub issue open for each. See docs/ALERTS.md.
// Run with: npm run check:alerts          reports only, and changes nothing
// The job in .github/workflows/alerts.yml runs it for real, with GITHUB_TOKEN set.
import path from 'node:path';
import { DATA_DIR, loadCore, readJson, ROOT, writeJson } from '../cosmetics/common.mjs';
import { loadHeroes } from '../cosmetics/heroes-list.mjs';
import { checkHeroes, checkItemshopKey, checkJobs, checkNews, checkPosts, checkReminders, checkSources, checkWiki, newsArticleId, parseNewsList, WATCHED_JOBS } from './checks.mjs';
import { applyPlan, createGitHub, planIssues } from './github.mjs';

const REPO = process.env.GITHUB_REPOSITORY ?? 'Meowthebest/OW2';
const STATE_FILE = path.join(ROOT, '.alerts-state.json');
const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const token = process.env.GITHUB_TOKEN || null;

if (!dryRun && !token) {
  console.error('This needs GITHUB_TOKEN to open issues. To only see what it would do, use --dry-run.');
  process.exit(2);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks a few times, since these sources can fail for a moment. Anything else stops at once, and shows up as that source being down. */
async function readSource(url, as = 'json') {
  let problem = 'no answer';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: as === 'json' ? 'application/json' : 'text/html', 'user-agent': `ow2-site-alerts (+https://github.com/${REPO})` }, signal: AbortSignal.timeout(20000) });
      if (response.ok) return as === 'json' ? await response.json() : await response.text();
      problem = `it answered ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      problem = error.message;
    }
    if (attempt < 3) await wait(5000 * attempt);
  }
  throw new Error(problem);
}

async function readHeroList() {
  const list = await readSource('https://overfast-api.tekrop.fr/heroes');
  // A short list would look like a mass of missing heroes, so it can't count as an answer.
  if (!Array.isArray(list) || list.length < 30 || !list.every((hero) => hero.key && hero.role)) throw new Error('its hero list looks wrong');
  return list;
}

/** One topic list, a few times a day. The forum's robots.txt allows this address, and rules out its RSS feeds. */
async function readAnnouncements() {
  const topics = (await readSource('https://us.forums.blizzard.com/en/overwatch/c/announcements/5.json'))?.topic_list?.topics;
  if (!Array.isArray(topics) || topics.length === 0 || !topics.every((topic) => topic.id && topic.title && topic.created_at)) throw new Error('its topic list looks wrong');
  return topics;
}

/** Blizzard's news page, once per run. Its robots.txt allows it, and only the list of articles is read, never the articles. */
async function readNews() {
  const articles = parseNewsList(await readSource('https://overwatch.blizzard.com/en-us/news/', 'text'));
  if (articles.length < 3) throw new Error('its article list looks wrong');
  return articles;
}

const outcomes = {};
async function attempt(id, read) {
  try {
    const value = await read();
    outcomes[id] = { ok: true };
    return value;
  } catch (error) {
    outcomes[id] = { ok: false, error: error.message };
    console.warn(`Couldn't read ${id}: ${error.message}`);
    return null;
  }
}

const now = Date.now();
const github = createGitHub({ repo: REPO, token });
const core = await loadCore();
const { HEROES } = await loadHeroes();

// The same reading of a shop label as the catalogue build, so this flags exactly what the catalogue can't place.
const unknownInShop = new Map();
for (const item of Object.values(readJson(path.join(DATA_DIR, 'shop/items.json'), {}))) {
  for (const label of [item.typeLabel, ...(item.contents ?? []).map((content) => content.typeLabel)]) {
    const { heroName } = core.parseTypeLabel(label ?? null);
    if (heroName && !core.heroIdFromName(heroName)) unknownInShop.set(core.slugify(heroName), heroName);
  }
}

const [apiHeroes, topics, articles] = await Promise.all([attempt('overfast', readHeroList), attempt('forum', readAnnouncements), attempt('news', readNews)]);
const state = readJson(STATE_FILE, {}) ?? {};
const sourceCheck = checkSources({ state, outcomes, now });

const results = {
  hero: checkHeroes({ roster: HEROES, apiHeroes, unknownInShop: [...unknownInShop].map(([id, name]) => ({ id, name })) }),
  wiki: checkWiki({ seasons: readJson(path.join(DATA_DIR, 'wiki/seasons.json'), []), exportedAt: readJson(path.join(DATA_DIR, 'wiki/import.json'), {})?.exportedAt, now }),
  reminder: checkReminders({ now }),
  source: sourceCheck,
};

if (topics) {
  const curated = (name) => readJson(path.join(DATA_DIR, 'curated', `${name}.json`), []);
  const knownUrls = [...curated('twitch-drops'), ...curated('loot-pools')].flatMap((record) => record.sources ?? []).map((source) => source.url ?? source);
  results.post = checkPosts({ topics, knownUrls, now });
}

if (articles) {
  // An article is known once an event cites it, or once it's been checked and listed under "reviewed".
  const events = readJson(path.join(DATA_DIR, 'curated/game-events.json'), {}) ?? {};
  const cited = [...(events.events ?? []).flatMap((event) => event.sources ?? []), ...(events.reviewed ?? [])];
  results.news = checkNews({ articles, known: new Set(cited.map((entry) => newsArticleId(entry.url)).filter(Boolean)), now });
}

// Only the job can see whether the secret is set, and a local run can't tell.
if (process.env.HAS_ITEMSHOP_KEY !== undefined) results.key = checkItemshopKey({ hasKey: process.env.HAS_ITEMSHOP_KEY === 'true' });

try {
  const runsByFile = {};
  for (const job of WATCHED_JOBS) runsByFile[job.file] = await github.jobRuns(job.file);
  results.job = checkJobs({ runsByFile, now });
} catch (error) {
  console.warn(`Couldn't read the job history: ${error.message}`);
}

const existing = await github.alertIssues();
const plan = planIssues(results, existing);

const open = Object.values(results).flatMap((result) => result.alerts);
console.log(`Checked: ${Object.keys(results).sort().join(', ')}.`);
console.log(open.length === 0 ? 'Nothing needs a person right now.' : `Needs a person:\n${open.map((alert) => `  ${alert.key}: ${alert.title}`).join('\n')}`);
console.log(`${dryRun ? 'Would open' : 'Opening'}: ${plan.create.length ? plan.create.map((alert) => alert.key).join(', ') : 'none'}. ${dryRun ? 'Would close' : 'Closing'}: ${plan.close.length ? plan.close.map((issue) => `#${issue.number}`).join(', ') : 'none'}.${plan.held ? ` ${plan.held} more wait for the next run.` : ''}`);

if (!dryRun) {
  await applyPlan(plan, github, { owner: process.env.GITHUB_REPOSITORY_OWNER ?? null });
  writeJson(STATE_FILE, sourceCheck.state);
}
