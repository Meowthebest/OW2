// Tests the checks behind the alert issues, and how they turn into issues. Run with: npm run test:alerts
// Nothing here contacts another site.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { checkHeroes, checkItemshopKey, checkJobs, checkPosts, checkReminders, checkSources, checkWiki, plain, REMINDERS, WATCHED_JOBS } from './alerts/checks.mjs';
import { ALERT_LABEL, applyPlan, createGitHub, issueBody, keyOf, planIssues } from './alerts/github.mjs';

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

const NOW = Date.parse('2026-12-20T12:00:00Z');
const HOUR = 3600000;
const DAY = 24 * HOUR;
const keys = (result) => result.alerts.map((alert) => alert.key);

// Heroes
const roster = [
  { id: 'ana', name: 'Ana', role: 'support' },
  { id: 'dva', name: 'D.Va', role: 'tank' },
];
const api = (over = []) => [{ key: 'ana', name: 'Ana', role: 'support' }, { key: 'dva', name: 'D.Va', role: 'tank' }, ...over];

await test('a matching roster raises nothing', () => {
  assert.deepEqual(keys(checkHeroes({ roster, apiHeroes: api() })), []);
});

await test('a new hero, a role change and a missing hero each raise their own alert', () => {
  const result = checkHeroes({ roster, apiHeroes: [{ key: 'ana', name: 'Ana', role: 'damage' }, { key: 'newbie', name: 'Newbie', role: 'tank' }] });
  assert.deepEqual(keys(result).sort(), ['hero:gone:dva', 'hero:new:newbie', 'hero:role:ana:damage']);
  const fresh = result.alerts.find((alert) => alert.key === 'hero:new:newbie');
  assert.equal(fresh.title, 'New hero to add: Newbie');
  assert.match(fresh.body, /README\.md#add-a-new-hero/);
});

await test('a hero the shop names and the site doesn\'t know is flagged once, wherever it was seen', () => {
  const both = checkHeroes({ roster, apiHeroes: api([{ key: 'newbie', name: 'Newbie', role: 'tank' }]), unknownInShop: [{ id: 'newbie', name: 'Newbie' }, { id: 'other', name: 'Other' }] });
  assert.deepEqual(keys(both), ['hero:new:newbie', 'hero:new:other']);
  assert.match(both.alerts[1].body, /The shop is selling something labelled for \*\*Other\*\*/);
  assert.deepEqual(keys(checkHeroes({ roster, apiHeroes: api(), unknownInShop: [{ id: 'ana', name: 'Ana' }] })), [], 'not if the site does know it');
});

await test('without OverFast, the shop can still flag a hero, and nothing already open gets closed', () => {
  const result = checkHeroes({ roster, apiHeroes: null, unknownInShop: [{ id: 'other', name: 'Other' }] });
  assert.deepEqual(keys(result), ['hero:new:other']);
  assert.equal(result.keepOpen('hero:role:ana:damage'), true);
  assert.equal(checkHeroes({ roster, apiHeroes: api() }).keepOpen, undefined);
});

// Posts
const topic = (id, title, created_at = '2026-12-10T00:00:00Z', slug = 'a-post') => ({ id, title, created_at, slug });
const POST = 'https://us.forums.blizzard.com/en/overwatch/t/some-post';

await test('Twitch Drops and loot box posts are flagged, and nothing else', () => {
  const result = checkPosts({
    topics: [topic(1, 'Reign of Talon - Season 6 Launch Twitch Drops'), topic(2, 'Season 20 Launch Drops'), topic(3, 'Lootbox Update for Premium Battle Pass'), topic(4, 'Earn Loot Boxes'), topic(5, 'Community Update: Team Drives and Push'), topic(6, 'Overwatch Retail Patch Notes')],
    knownUrls: [],
    now: NOW,
  });
  assert.deepEqual(keys(result), ['post:1', 'post:2', 'post:3', 'post:4']);
  assert.match(result.alerts[0].body, /https:\/\/us\.forums\.blizzard\.com\/en\/overwatch\/t\/a-post\/1\)/);
});

await test('a post a record already links isn\'t flagged, however the address is written', () => {
  const topics = [topic(1046030, 'Twitch Drops')];
  for (const url of [`${POST}/1046030`, `${POST}/1046030/2`, 'https://us.forums.blizzard.com/en/overwatch/t/1046030']) {
    assert.deepEqual(keys(checkPosts({ topics, knownUrls: [url], now: NOW })), [], url);
  }
});

await test('old posts don\'t raise alerts, so the first run isn\'t a flood', () => {
  assert.deepEqual(keys(checkPosts({ topics: [topic(1, 'Twitch Drops', '2026-10-01T00:00:00Z'), topic(2, 'Twitch Drops', 'not a date')], knownUrls: [], now: NOW })), []);
});

await test('a post stays open until it\'s linked, even once it\'s too old to raise a new alert', () => {
  const result = checkPosts({ topics: [], knownUrls: [`${POST}/2`], now: NOW });
  assert.equal(result.keepOpen('post:1'), true);
  assert.equal(result.keepOpen('post:2'), false);
});

await test('text from another site can\'t ping anyone or add markup', () => {
  assert.equal(plain('Hello <b>@everyone</b> [link](x) `code`'), 'Hello b@​everyone/b link(x) code');
  const result = checkPosts({ topics: [{ id: 7, title: 'Drops for @someone', created_at: '2026-12-10T00:00:00Z', slug: 'bad)slug' }], knownUrls: [], now: NOW });
  assert.ok(!/@someone/.test(result.alerts[0].title));
  assert.ok(result.alerts[0].body.includes('/t/-/7)'), 'an odd slug can\'t break out of the link');
});

// Wiki
const seasons = [
  { id: '2026-s5', label: '2026: Season 5', start: '2026-10-06', end: '2026-12-08' },
  { id: 'ow2-s20', label: 'Season 20', start: '2025-12-09', end: '2026-02-10' },
];

await test('a wiki export is due a few days after the last stored season ends', () => {
  const at = (date) => checkWiki({ seasons, exportedAt: '2026-11-05T00:00:00Z', now: Date.parse(date) });
  assert.deepEqual(keys(at('2026-12-08T00:00:00Z')), [], 'not on the day, since the wiki needs time');
  assert.deepEqual(keys(at('2026-12-10T23:00:00Z')), []);
  const due = at('2026-12-11T00:00:00Z');
  assert.deepEqual(keys(due), ['wiki:season:2026-s5'], 'goes by date, not by order in the file');
  assert.match(due.alerts[0].title, /2026: Season 5 has ended/);
  assert.match(due.alerts[0].body, /docs\/COSMETICS_DATA\.md#importing-the-wiki/);
});

await test('a new season in the data clears the alert', () => {
  assert.deepEqual(keys(checkWiki({ seasons: [...seasons, { id: '2026-s6', label: '2026: Season 6', start: '2026-12-08', end: '2027-02-09' }], exportedAt: '2026-12-15T00:00:00Z', now: NOW })), []);
});

await test('an old export is flagged even if the season has no end date, and only one alert shows', () => {
  const open = [{ id: '2026-s6', label: '2026: Season 6', start: '2026-12-08', end: null }];
  assert.deepEqual(keys(checkWiki({ seasons: open, exportedAt: '2026-11-05T00:00:00Z', now: NOW })), [], '45 days is fine');
  const old = checkWiki({ seasons: open, exportedAt: '2026-09-01T10:00:00Z', now: NOW });
  assert.deepEqual(keys(old), ['wiki:age:2026-09-01']);
  assert.match(old.alerts[0].title, /110 days old/);
  assert.deepEqual(keys(checkWiki({ seasons, exportedAt: '2026-09-01T10:00:00Z', now: NOW })), ['wiki:season:2026-s5'], 'the season says more');
  assert.deepEqual(keys(checkWiki({ seasons: [], exportedAt: null, now: NOW })), [], 'no data, no claim');
});

// Jobs
const run = (id, conclusion, age = HOUR, status = 'completed') => ({ id, status, conclusion, created_at: new Date(NOW - age).toISOString(), html_url: `https://github.test/run/${id}` });
const healthy = () => Object.fromEntries(WATCHED_JOBS.map((job) => [job.file, { runs: [run(10, 'success', 10 * 60000)], lastSuccessId: 10 }]));

await test('healthy jobs raise nothing', () => {
  assert.deepEqual(keys(checkJobs({ runsByFile: healthy(), now: NOW })), []);
});

await test('a job is only flagged after enough failures in a row', () => {
  const runsByFile = healthy();
  runsByFile['sync-shop.yml'] = { runs: [run(3, 'failure', 1000), run(2, 'failure', 2000), run(1, 'success', 3000)], lastSuccessId: 1 };
  assert.deepEqual(keys(checkJobs({ runsByFile, now: NOW })), [], 'two isn\'t enough for a job this frequent');
  runsByFile['sync-shop.yml'].runs.unshift(run(4, 'timed_out', 500));
  const result = checkJobs({ runsByFile, now: NOW });
  assert.deepEqual(keys(result), ['job:failing:sync-shop.yml:1']);
  assert.match(result.alerts[0].title, /Shop recording keeps failing/);
  assert.match(result.alerts[0].body, /The last 3 runs/);
  assert.match(result.alerts[0].body, /github\.test\/run\/4/, 'links the newest failure');
});

await test('one failed deploy is worth a message, and a good run clears it', () => {
  const runsByFile = healthy();
  runsByFile['deploy.yml'] = { runs: [run(2, 'failure'), run(1, 'success', 2 * HOUR)], lastSuccessId: 1 };
  const failed = checkJobs({ runsByFile, now: NOW });
  assert.deepEqual(keys(failed), ['job:failing:deploy.yml:1']);
  assert.equal(failed.alerts[0].title, 'Site deploy failed');
  runsByFile['deploy.yml'] = { runs: [run(3, 'success'), ...runsByFile['deploy.yml'].runs], lastSuccessId: 3 };
  assert.deepEqual(keys(checkJobs({ runsByFile, now: NOW })), []);
});

await test('a failing job keeps one issue, and a later outage gets a new one', () => {
  const runsByFile = healthy();
  const failing = (ids, lastSuccessId) => ({ runs: ids.map((id) => run(id, 'failure')), lastSuccessId });
  runsByFile['sync-patches.yml'] = failing([4, 3, 2], 1);
  const first = keys(checkJobs({ runsByFile, now: NOW }));
  runsByFile['sync-patches.yml'] = failing([9, 8, 7, 6, 5, 4, 3, 2], 1);
  assert.deepEqual(keys(checkJobs({ runsByFile, now: NOW })), first);
  runsByFile['sync-patches.yml'] = failing([22, 21], 20);
  assert.notDeepEqual(keys(checkJobs({ runsByFile, now: NOW })), first);
});

await test('cancelled and running jobs say nothing either way', () => {
  const runsByFile = healthy();
  runsByFile['deploy.yml'] = { runs: [run(5, null, 1000, 'in_progress'), run(4, 'cancelled'), run(3, 'skipped'), run(2, 'success')], lastSuccessId: 2 };
  assert.deepEqual(keys(checkJobs({ runsByFile, now: NOW })), []);
  runsByFile['deploy.yml'] = { runs: [run(5, null, 1000, 'in_progress'), run(4, 'cancelled'), run(3, 'failure'), run(2, 'success')], lastSuccessId: 2 };
  assert.deepEqual(keys(checkJobs({ runsByFile, now: NOW })), ['job:failing:deploy.yml:2']);
});

await test('jobs that stop running raise one alert, which stays one as more of them stop', () => {
  const runsByFile = healthy();
  runsByFile['record-players.yml'] = { runs: [run(1, 'success', 3 * HOUR)], lastSuccessId: 1 };
  const first = checkJobs({ runsByFile, now: NOW });
  assert.equal(first.alerts.length, 1);
  assert.equal(first.alerts[0].title, 'Automatic updates have stopped running');
  assert.match(first.alerts[0].body, /Steam player count\*\* last ran on Dec 20, 2026, at 09:00 UTC/);
  assert.match(first.alerts[0].body, /timer\/README\.md#renew-the-token/);
  runsByFile['sync-shop.yml'] = { runs: [run(1, 'success', 4 * HOUR)], lastSuccessId: 1 };
  runsByFile['sync-patches.yml'] = { runs: [run(1, 'success', 31 * HOUR)], lastSuccessId: 1 };
  const later = checkJobs({ runsByFile, now: NOW });
  assert.deepEqual(keys(later), keys(first));
  assert.match(later.alerts[0].body, /Shop recording/);
});

await test('a job that only runs on a change isn\'t flagged for being quiet', () => {
  const runsByFile = healthy();
  runsByFile['deploy.yml'] = { runs: [run(1, 'success', 40 * DAY)], lastSuccessId: 1 };
  assert.deepEqual(keys(checkJobs({ runsByFile, now: NOW })), []);
});

// Key and reminders
await test('the itemshop.gg key is flagged only when it\'s missing, and the message says not to paste it', () => {
  assert.deepEqual(keys(checkItemshopKey({ hasKey: true })), []);
  const missing = checkItemshopKey({ hasKey: false });
  assert.deepEqual(keys(missing), ['key:itemshop']);
  assert.match(missing.alerts[0].body, /Never paste the key/);
});

await test('reminders wait for their date', () => {
  const reminders = [{ id: 'x', on: '2027-10-01', title: 'T', body: 'B' }];
  assert.deepEqual(keys(checkReminders({ now: Date.parse('2027-09-30T23:00:00Z'), reminders })), []);
  assert.deepEqual(keys(checkReminders({ now: Date.parse('2027-10-01T00:00:00Z'), reminders })), ['reminder:x']);
  assert.ok(REMINDERS.every((reminder) => !Number.isNaN(Date.parse(reminder.on))));
});

// Sources
await test('a source that goes down only raises an alert after a few days, and coming back clears it', () => {
  const firstFail = checkSources({ state: {}, outcomes: { forum: { ok: false, error: 'it answered 503' } }, now: NOW });
  assert.deepEqual(keys(firstFail), [], 'with no record, the clock starts now');
  assert.equal(firstFail.state.sources.forum.lastOk, new Date(NOW).toISOString());

  const good = checkSources({ state: {}, outcomes: { forum: { ok: true } }, now: NOW });
  const soon = checkSources({ state: good.state, outcomes: { forum: { ok: false, error: 'x' } }, now: NOW + 2 * DAY });
  assert.deepEqual(keys(soon), []);
  assert.equal(soon.state.sources.forum.lastOk, new Date(NOW).toISOString(), 'a failure doesn\'t move the clock');

  const late = checkSources({ state: soon.state, outcomes: { forum: { ok: false, error: 'it answered 403' } }, now: NOW + 3 * DAY });
  assert.deepEqual(keys(late), ['source:forum:2026-12-20']);
  assert.match(late.alerts[0].body, /could miss new Twitch Drops/);
  assert.match(late.alerts[0].body, /it answered 403/);

  const back = checkSources({ state: late.state, outcomes: { forum: { ok: true } }, now: NOW + 4 * DAY });
  assert.deepEqual(keys(back), []);
  assert.equal(back.state.sources.forum.lastOk, new Date(NOW + 4 * DAY).toISOString());
});

// Issues
const alert = (key) => ({ key, title: `Title ${key}`, body: `Body ${key}` });
const issue = (number, key, state = 'open') => ({ number, state, body: key ? issueBody(alert(key), null) : 'Written by a person' });

await test('each alert opens one issue, and one already open isn\'t repeated', () => {
  const plan = planIssues({ hero: { alerts: [alert('hero:new:a'), alert('hero:new:b')] } }, [issue(1, 'hero:new:a')]);
  assert.deepEqual(plan.create.map((item) => item.key), ['hero:new:b']);
  assert.deepEqual(plan.close, []);
});

await test('closing an issue dismisses that alert for good', () => {
  const plan = planIssues({ post: { alerts: [alert('post:1')], keepOpen: () => true } }, [issue(1, 'post:1', 'closed')]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.close, []);
});

await test('an issue closes when its problem clears', () => {
  const plan = planIssues({ hero: { alerts: [] }, job: { alerts: [alert('job:failing:x:1')] } }, [issue(1, 'hero:new:a'), issue(2, 'job:failing:x:1'), issue(3, 'hero:new:b', 'closed')]);
  assert.deepEqual(plan.close.map((item) => item.number), [1]);
});

await test('nothing closes if its check couldn\'t run, or if the check says to keep it', () => {
  assert.deepEqual(planIssues({ hero: { alerts: [] } }, [issue(1, 'post:1'), issue(2, 'job:quiet:2026-12-01')]).close, []);
  const kept = planIssues({ post: { alerts: [], keepOpen: (key) => key === 'post:1' } }, [issue(1, 'post:1'), issue(2, 'post:2')]);
  assert.deepEqual(kept.close.map((item) => item.number), [2]);
});

await test('other issues with the label are left alone', () => {
  assert.deepEqual(planIssues({ hero: { alerts: [] } }, [issue(1, null)]).close, []);
});

await test('a run opens a limited number of issues, and the rest wait', () => {
  const many = Array.from({ length: 8 }, (_, index) => alert(`post:${index}`));
  const plan = planIssues({ post: { alerts: many } }, []);
  assert.equal(plan.create.length, 5);
  assert.equal(plan.held, 3);
  const next = planIssues({ post: { alerts: many } }, plan.create.map((item, index) => issue(index, item.key)));
  assert.deepEqual(next.create.map((item) => item.key), ['post:5', 'post:6', 'post:7']);
});

await test('an issue carries its key, says how it closes, and tells the owner', () => {
  const body = issueBody(alert('post:1'), 'someone');
  assert.equal(keyOf({ body }), 'post:1');
  assert.match(body, /closes by itself/);
  assert.match(body, /cc @someone/);
  assert.ok(!/cc @/.test(issueBody(alert('post:1'), null)));
  assert.equal(keyOf({ body: null }), null);
});

function fakeGitHub(answer = () => null) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const call = { method: init.method, path: url.replace('https://api.github.com', ''), body: init.body ? JSON.parse(init.body) : null, headers: init.headers };
    calls.push(call);
    const reply = answer(call) ?? { status: 200, json: {} };
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.json };
  };
  return { calls, github: createGitHub({ repo: 'me/site', token: 'test-token', fetchImpl, api: 'https://api.github.com' }) };
}

await test('applying a plan labels, opens and closes through GitHub', async () => {
  const { calls, github } = fakeGitHub((call) => (call.path.endsWith('/labels') ? { status: 422, json: {} } : null));
  await applyPlan({ create: [alert('post:1')], close: [{ number: 9 }], held: 0 }, github, { owner: 'someone' });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ['POST /repos/me/site/labels', 'POST /repos/me/site/issues', 'POST /repos/me/site/issues/9/comments', 'PATCH /repos/me/site/issues/9']);
  assert.deepEqual(calls[1].body.labels, [ALERT_LABEL]);
  assert.equal(calls[1].body.title, 'Title post:1');
  assert.equal(keyOf(calls[1].body), 'post:1');
  assert.equal(calls[3].body.state, 'closed');
  assert.equal(calls[1].headers.authorization, 'Bearer test-token');
});

await test('a plan with nothing to open doesn\'t touch labels', async () => {
  const { calls, github } = fakeGitHub();
  await applyPlan({ create: [], close: [], held: 0 }, github);
  assert.deepEqual(calls, []);
});

await test('every page of issues is read, and pull requests are skipped', async () => {
  const full = Array.from({ length: 100 }, (_, index) => ({ number: index }));
  const { calls, github } = fakeGitHub((call) => ({ status: 200, json: call.path.endsWith('&page=1') ? full :[{ number: 500 }, { number: 501, pull_request: {} }] }));
  const issues = await github.alertIssues();
  assert.equal(issues.length, 101);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].path.includes(`labels=${ALERT_LABEL}&state=all`), 'closed ones count too');
});

await test('GitHub errors stop the run with a clear message', async () => {
  const off = fakeGitHub(() => ({ status: 410, json: {} }));
  await assert.rejects(off.github.alertIssues(), /Issues are turned off/);
  const refused = fakeGitHub(() => ({ status: 500, json: {} }));
  await assert.rejects(refused.github.ensureLabel(), /GitHub answered 500/);
});

await test('a job\'s runs come with its last good run, however old', async () => {
  const { calls, github } = fakeGitHub((call) => ({ status: 200, json: { workflow_runs: call.path.includes('status=success') ? [{ id: 7 }] : [{ id: 9 }, { id: 8 }] } }));
  assert.deepEqual(await github.jobRuns('deploy.yml'), { runs: [{ id: 9 }, { id: 8 }], lastSuccessId: 7 });
  assert.ok(calls.every((call) => call.path.includes('/actions/workflows/deploy.yml/runs?branch=main')));
});

// How it fits together
const read = (file) => readFileSync(file, 'utf8');

await test('the job follows the patch sync, and watches jobs that exist', () => {
  const workflow = read('.github/workflows/alerts.yml');
  const followed = /workflows: \[(.+?)\]/.exec(workflow)?.[1];
  assert.equal(followed, /^name: (.+)$/m.exec(read('.github/workflows/sync-patches.yml'))?.[1].trim(), 'it must name the patch job exactly');
  assert.match(workflow, /types: \[completed\]/, 'it runs after a failed sync too');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /issues: write/);
  assert.ok(!/contents: write/.test(workflow), 'it has no reason to change the code');
  for (const job of WATCHED_JOBS) assert.ok(existsSync(`.github/workflows/${job.file}`), job.file);
});

await test('the job only asks whether the key is set', () => {
  const uses = read('.github/workflows/alerts.yml').split('\n').filter((line) => line.includes('secrets.'));
  assert.deepEqual(uses.map((line) => line.trim()), ["HAS_ITEMSHOP_KEY: ${{ secrets.ITEMSHOP_API_KEY != '' }}"]);
});

await test('every link in the alerts goes to a real file and heading', () => {
  const headingSlug = (line) => line.replace(/^#+\s*/, '').trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
  const source = `${read('scripts/alerts/checks.mjs')}\n${read('scripts/alerts/github.mjs')}`;
  const links = [...source.matchAll(/\$\{REPO_FILES\}\/([^)#\s`]+)(?:#([a-z0-9-]+))?/g), ...source.matchAll(/github\.com\/Meowthebest\/OW2\/blob\/main\/([^)#\s`]+)(?:#([a-z0-9-]+))?/g)];
  assert.ok(links.length >= 10, `found ${links.length}`);
  for (const [, file, anchor] of links) {
    assert.ok(existsSync(file), file);
    if (anchor) {
      const headings = read(file).split(/\r?\n/).filter((line) => /^#{1,6} /.test(line)).map(headingSlug);
      assert.ok(headings.includes(anchor), `${file}#${anchor}`);
    }
  }
});

console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
