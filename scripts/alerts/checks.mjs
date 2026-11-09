// Works out what on the site needs a person. Each check is a plain function of what it's given, so it can be tested offline.
//
// An alert's key names exactly one thing, such as one hero or one forum post. There's one issue per key, and closing an issue
// dismisses that key for good, so anything that can happen again gets a new key each time.
//
// A check returns { alerts, keepOpen }. An open issue the check no longer reports gets closed, unless keepOpen says otherwise.

const HOUR = 3600000;
const DAY = 24 * HOUR;
const REPO_FILES = 'https://github.com/Meowthebest/OW2/blob/main';
const FORUM = 'https://us.forums.blizzard.com/en/overwatch';

/** Text from another site goes into a public issue, so it can't ping anyone or add markup. */
export const plain = (text) =>
  String(text)
    .replace(/[<>[\]`]/g, '')
    .replace(/@/g, '@​')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

const dayText = (time) => new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const paragraphs = (...parts) => parts.filter(Boolean).join('\n\n');

export function checkHeroes({ roster, apiHeroes, unknownInShop = [] }) {
  const alerts = [];
  const local = new Map(roster.map((hero) => [hero.id, hero]));
  const addNew = (id, body) => {
    const name = body.name;
    if (!alerts.some((alert) => alert.key === `hero:new:${id}`)) {
      alerts.push({
        key: `hero:new:${id}`,
        title: `New hero to add: ${name}`,
        body: paragraphs(
          body.why,
          'Until the hero is added, they won\'t be in the randomizer or on the hero pages, and their cosmetics can\'t get catalogue pages.',
          `**To fix:** follow [Add a new hero](${REPO_FILES}/README.md#add-a-new-hero).`,
        ),
      });
    }
  };

  if (apiHeroes) {
    const remote = new Map(apiHeroes.map((hero) => [hero.key, hero]));
    for (const [id, hero] of remote) {
      const name = plain(hero.name ?? id);
      const known = local.get(id);
      if (!known) {
        addNew(plain(id), { name, why: `**${name}** (${plain(hero.role)}) is in OverFast's hero list, but not on this site.` });
      } else if (known.role !== hero.role) {
        alerts.push({
          key: `hero:role:${id}:${plain(hero.role)}`,
          title: `Hero role changed: ${known.name}`,
          body: paragraphs(`OverFast lists **${known.name}** as **${plain(hero.role)}**, and this site has **${known.role}**.`, `**To fix:** change \`role\` for this hero in [src/data/heroes.ts](${REPO_FILES}/src/data/heroes.ts).`),
        });
      }
    }
    for (const [id, hero] of local) {
      if (!remote.has(id)) {
        alerts.push({
          key: `hero:gone:${id}`,
          title: `Hero missing from OverFast: ${hero.name}`,
          body: paragraphs(`**${hero.name}** (\`${id}\`) is on this site, but not in OverFast's hero list. The hero may have been renamed. Career stats are matched on this id, so they won't load until it's right.`, `**To fix:** compare with [OverFast's list](https://overfast-api.tekrop.fr/heroes) and update [src/data/heroes.ts](${REPO_FILES}/src/data/heroes.ts).`),
        });
      }
    }
  }
  for (const { id, name } of unknownInShop) {
    if (local.has(id)) continue;
    addNew(plain(id), { name: plain(name), why: `The shop is selling something labelled for **${plain(name)}**, and this site has no hero by that name. It may be a new hero, or a new spelling of one.` });
  }
  // Without OverFast's list, a role change or a new hero can't be ruled out, so nothing it reported gets closed.
  return { alerts, keepOpen: apiHeroes ? undefined : () => true };
}

const POST_WORDS = /\bdrops?\b|\bloot\s?box(?:es)?\b/i;
const postId = (url) => /\/t\/(?:[^/]+\/)?(\d+)/.exec(String(url))?.[1] ?? null;

/** Forum posts that look like Twitch Drops or loot box news, and that no stored record links to yet. */
export function checkPosts({ topics, knownUrls, now, maxAgeDays = 45 }) {
  const known = new Set(knownUrls.map(postId).filter(Boolean));
  const alerts = [];
  for (const topic of topics) {
    const id = String(topic.id);
    const at = Date.parse(topic.created_at);
    if (!POST_WORDS.test(topic.title) || known.has(id) || !(now - at <= maxAgeDays * DAY)) continue;
    const title = plain(topic.title);
    const slug = /^[\w%-]+$/.test(topic.slug ?? '') ? topic.slug : '-';
    alerts.push({
      key: `post:${id}`,
      title: `Blizzard post to check: ${title}`,
      body: paragraphs(
        `Blizzard posted [${title}](${FORUM}/t/${slug}/${id}) on ${dayText(at)}. It looks like Twitch Drops or loot box news, and nothing on the site links to it yet.`,
        `**To fix:** add the campaign to [twitch-drops.json](${REPO_FILES}/data/cosmetics/curated/twitch-drops.json), or the rule to [loot-pools.json](${REPO_FILES}/data/cosmetics/curated/loot-pools.json), with this post as its source. See [Admin tools](${REPO_FILES}/docs/COSMETICS_DATA.md#admin-tools). This issue closes once the post is linked.`,
        'If the post doesn\'t change anything, just close this issue.',
      ),
    });
  }
  // An old post stays on the list until it's linked or dismissed, even after it's too old to raise a new alert.
  return { alerts, keepOpen: (key) => !known.has(key.split(':')[1]) };
}

const NEWS = 'https://overwatch.blizzard.com/en-us/news';

/** The article number in a Blizzard news link, which stays the same if the title in the link changes. */
export const newsArticleId = (url) => /\/news\/(\d+)(?:\/|$)/.exec(url ?? '')?.[1] ?? null;

const decodeHtml = (text) =>
  String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&reg;/g, '®')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The articles listed on Blizzard's news page: number, link, title, and the short description or date when the page gives one. */
export function parseNewsList(html) {
  const articles = new Map();
  const anchor = /<a\b[^>]*\bhref="(?:https:\/\/overwatch\.blizzard\.com)?\/(?:en-us\/)?news\/(\d+)\/([^"/?#\s]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, id, slug, inner] of String(html).matchAll(anchor)) {
    if (articles.has(id)) continue;
    const title = decodeHtml(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(inner)?.[1] ?? /\bheadingtext="([^"]*)"/i.exec(inner)?.[1] ?? '');
    if (!title) continue;
    const description = decodeHtml(/\bdescriptiontext="([^"]*)"/i.exec(inner)?.[1] ?? '') || null;
    const stamp = /<blz-timestamp\b[^>]*\btimestamp="([^"]+)"/i.exec(inner)?.[1] ?? null;
    articles.set(id, { id, url: `${NEWS}/${id}/${slug}/`, title, description, publishedAt: stamp && Number.isFinite(Date.parse(stamp)) ? stamp : null });
  }
  return [...articles.values()];
}

/** Words in a title that suggest an article announces an event. A wrong guess costs one issue, closed by hand. */
const EVENT_WORDS = /\b(events?|seasons?|midcycle|mid-?season|returns?|limited[- ]time|arcade|collab(?:oration)?|crossover|challenges?|drives?|loot hunt|excavation|halloween|winter wonderland|lunar new year|summer games|anniversary|celebrat\w*|cheer rally|world finals|double xp|twitch drops|in-game)\b|\s[x×]\s/i;

/**
 * Blizzard articles that look like event news but that the Events page doesn't cite yet. `known` holds the article numbers already
 * used as a source, or checked and listed under `reviewed`. An issue stays open until its article is known, or someone closes it.
 */
export function checkNews({ articles, known, now, maxAgeDays = 60 }) {
  const alerts = [];
  for (const article of articles) {
    if (known.has(article.id) || !EVENT_WORDS.test(`${article.title} ${article.description ?? ''}`)) continue;
    const at = article.publishedAt ? Date.parse(article.publishedAt) : null;
    if (at !== null && now - at > maxAgeDays * DAY) continue;
    const title = plain(article.title);
    alerts.push({
      key: `news:${article.id}`,
      title: `Check Blizzard's article for events: ${title}`,
      body: paragraphs(
        `Blizzard posted [${title}](${NEWS}/${article.id}/)${at !== null ? ` on ${dayText(at)}` : ''}. Its title suggests it announces in-game events, and the Events page doesn't cite it yet.`,
        `**To fix:** add each event it announces to [game-events.json](${REPO_FILES}/data/cosmetics/curated/game-events.json), with this article as the source. See [Adding in-game events](${REPO_FILES}/docs/COSMETICS_DATA.md#adding-in-game-events). This issue closes once the article is cited there.`,
        'If it announces no events, list it under `reviewed` in the same file, or just close this issue.',
      ),
    });
  }
  return { alerts, keepOpen: (key) => !known.has(key.split(':')[1]) };
}

/** The wiki can't be read by a script, so this goes by what the last export said about the season, and by how old it is. */
export function checkWiki({ seasons, exportedAt, now, graceDays = 3, maxAgeDays = 75 }) {
  const latest = [...seasons].sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? ''))).at(-1);
  const how = `**To fix:** follow [Importing the wiki](${REPO_FILES}/docs/COSMETICS_DATA.md#importing-the-wiki). It takes about two minutes.`;
  const missing = 'Until then, new Battle Pass rewards, event cosmetics, mythics and wiki pictures are missing. The shop keeps updating by itself.';
  const ended = latest?.end ? Date.parse(latest.end) : NaN;
  if (now >= ended + graceDays * DAY) {
    return {
      alerts: [
        {
          key: `wiki:season:${latest.id}`,
          title: `Time for a wiki export: ${latest.label} has ended`,
          body: paragraphs(
            `The last wiki export runs up to **${latest.label}**, which ended on ${dayText(ended)}.`,
            missing,
            how,
            `Also change \`ROSTER_SEASON\` in [src/data/heroes.ts](${REPO_FILES}/src/data/heroes.ts), which the site's header shows.`,
          ),
        },
      ],
    };
  }
  const exported = Date.parse(exportedAt);
  if (now - exported > maxAgeDays * DAY) {
    return {
      alerts: [
        {
          key: `wiki:age:${String(exportedAt).slice(0, 10)}`,
          title: `Time for a wiki export: the last one is ${Math.floor((now - exported) / DAY)} days old`,
          body: paragraphs(`The last wiki export is from ${dayText(exported)}.`, missing, how),
        },
      ],
    };
  }
  return { alerts: [] };
}

// quietHours: how long since its last run before a job counts as stopped. failures: how many failed runs in a row are worth a message.
export const WATCHED_JOBS = [
  { file: 'record-players.yml', name: 'Steam player count', quietHours: 2, failures: 6 },
  { file: 'sync-shop.yml', name: 'Shop recording', quietHours: 3, failures: 3 },
  { file: 'sync-patches.yml', name: 'Patch notes sync', quietHours: 30, failures: 2, help: `Blizzard's page layout may have changed. See [Manual import](${REPO_FILES}/docs/PATCH_DATA.md#manual-import).` },
  { file: 'deploy.yml', name: 'Site deploy', quietHours: null, failures: 1 },
];

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

/** Runs that failed since the last success, newest first. A cancelled or skipped run says nothing either way. */
function failureStreak(runs) {
  const streak = [];
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    if (run.conclusion === 'success') break;
    if (FAILED.has(run.conclusion)) streak.push(run);
  }
  return streak;
}

/** runsByFile holds each job's recent runs on main, newest first, and the id of its last successful run. */
export function checkJobs({ runsByFile, now, jobs = WATCHED_JOBS }) {
  const alerts = [];
  const quiet = [];
  for (const job of jobs) {
    const { runs, lastSuccessId } = runsByFile[job.file];
    const streak = failureStreak(runs);
    if (streak.length >= job.failures) {
      const count = streak.length === 1 ? 'The last run' : `The last ${streak.length} runs`;
      alerts.push({
        key: `job:failing:${job.file}:${lastSuccessId ?? 'never'}`,
        title: job.failures === 1 ? `${job.name} failed` : `${job.name} keeps failing`,
        body: paragraphs(
          `${count} of **${job.name}** failed. [See the latest one](${streak[0].html_url}).`,
          'Nothing broken gets published, so the site keeps its last good data until this is fixed.',
          `**To fix:** open the run to see the error, then run the job again from the Actions tab.${job.help ? ` ${job.help}` : ''} This issue closes after the next good run.`,
        ),
      });
    }
    const lastRun = runs[0] ? Date.parse(runs[0].created_at) : NaN;
    if (job.quietHours !== null && now - lastRun > job.quietHours * HOUR) quiet.push({ job, lastRun });
  }
  if (quiet.length > 0) {
    // The newest of these stays the same as more jobs go quiet, so one outage is one issue.
    const newest = Math.max(...quiet.map((item) => item.lastRun));
    alerts.push({
      key: `job:quiet:${new Date(newest).toISOString().slice(0, 10)}`,
      title: 'Automatic updates have stopped running',
      body: paragraphs(
        quiet.map(({ job, lastRun }) => `- **${job.name}** last ran on ${dayText(lastRun)}, at ${new Date(lastRun).toISOString().slice(11, 16)} UTC`).join('\n'),
        'The usual cause is that the timer\'s GitHub token has expired. The site keeps showing its last good data, but it won\'t update.',
        `**To fix:** see [Renew the token](${REPO_FILES}/timer/README.md#renew-the-token). If the Actions tab says a job is disabled, turn it back on there. This issue closes once the jobs are running again.`,
      ),
    });
  }
  return { alerts };
}

export function checkItemshopKey({ hasKey }) {
  if (hasKey) return { alerts: [] };
  return {
    alerts: [
      {
        key: 'key:itemshop',
        title: 'Add the itemshop.gg key to the repository',
        body: paragraphs(
          '`ITEMSHOP_API_KEY` isn\'t set in this repository\'s secrets. New shops still get recorded, but each item\'s history from itemshop.gg doesn\'t refresh.',
          `**To fix:** add your key under **Settings > Secrets and variables > Actions > New repository secret**. See [Past shops need a key](${REPO_FILES}/docs/COSMETICS_DATA.md#past-shops-need-a-key). This issue closes once it's set.`,
          'Never paste the key into this issue. Issues here are public.',
        ),
      },
    ],
  };
}

// Dated to-dos with nothing to check them against. Change the date when you renew the token.
export const REMINDERS = [
  {
    id: 'timer-token-2027',
    on: '2027-10-01',
    title: 'Renew the timer\'s GitHub token',
    body: paragraphs(
      'The token that lets the timer start the scheduled jobs lasts up to a year, and it was made in November 2026. When it expires, automatic updates stop.',
      `**To fix:** see [Renew the token](${REPO_FILES}/timer/README.md#renew-the-token), then close this issue. Next time, change this reminder's date in \`scripts/alerts/checks.mjs\`.`,
    ),
  },
];

export function checkReminders({ now, reminders = REMINDERS }) {
  return { alerts: reminders.filter((reminder) => now >= Date.parse(reminder.on)).map(({ id, title, body }) => ({ key: `reminder:${id}`, title, body })) };
}

const SOURCE_NOTES = {
  overfast: { name: 'OverFast', misses: 'new heroes and role changes' },
  forum: { name: 'Blizzard\'s forum', misses: 'new Twitch Drops and loot box posts' },
  news: { name: 'Blizzard\'s news page', misses: 'new in-game event announcements' },
};

/**
 * A source can be down for a while without it mattering, so this only speaks up after a few days.
 * outcomes says how each read went this time. state remembers each source's last good read between runs.
 */
export function checkSources({ state, outcomes, now, maxDownDays = 3 }) {
  const alerts = [];
  const sources = { ...state.sources };
  for (const [id, outcome] of Object.entries(outcomes)) {
    // With no record of a good read, the clock starts now.
    if (outcome.ok || !sources[id]?.lastOk) sources[id] = { lastOk: new Date(now).toISOString() };
    if (outcome.ok) continue;
    const lastOk = Date.parse(sources[id].lastOk);
    if (now - lastOk < maxDownDays * DAY) continue;
    const note = SOURCE_NOTES[id] ?? { name: id, misses: 'anything from it' };
    alerts.push({
      key: `source:${id}:${sources[id].lastOk.slice(0, 10)}`,
      title: `Alerts can't read ${note.name}`,
      body: paragraphs(
        `The alert job hasn't been able to read **${note.name}** since ${dayText(lastOk)}, so it could miss ${note.misses}. The latest problem: ${plain(outcome.error ?? 'unknown')}`,
        'This often passes by itself, and this issue closes when it does. If it stays open, the source may have changed. See `scripts/alerts/cli.mjs`.',
      ),
    });
  }
  return { alerts, state: { ...state, sources } };
}
