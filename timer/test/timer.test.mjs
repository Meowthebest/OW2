import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import worker, { JOBS, startJob } from '../src/index.js';

const TOKEN = 'github_pat_not_a_real_token';
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const config = read('../wrangler.toml');

/** Answers each request with the next status or error in the list. */
function fakeGitHub(...answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body), signal: init.signal });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'object') return new Response(JSON.stringify(next.body), { status: next.status });
    return new Response(next === 204 ? null : '', { status: next });
  };
  return { calls, fetchImpl };
}

const noWait = () => {
  const waits = [];
  return { waits, wait: async (ms) => waits.push(ms) };
};

test('every schedule in wrangler.toml has a job, and every job has a schedule', () => {
  const crons = JSON.parse(/crons\s*=\s*(\[[^\]]*\])/.exec(config)[1]);
  assert.deepEqual([...crons].sort(), Object.keys(JOBS).sort());
});

test('the Worker has no web address', () => {
  assert.match(config, /^workers_dev = false$/m);
  assert.match(config, /^preview_urls = false$/m);
});

test('no secret is written into the configuration', () => {
  assert.doesNotMatch(config, /github_pat_|ghp_|GITHUB_TOKEN/);
});

test('each job names a workflow that exists and can be started from outside', () => {
  for (const job of Object.values(JOBS)) {
    const workflow = read(`../../.github/workflows/${job.workflow}`);
    assert.match(workflow, /^ {2}workflow_dispatch:/m, job.workflow);
    for (const input of Object.keys(job.inputs ?? {})) {
      assert.match(workflow, new RegExp(`^ {6}${input}:`, 'm'), `${job.workflow} needs the input ${input}`);
    }
  }
});

test('weekday names are used, because Cloudflare and GitHub number weekdays differently', () => {
  for (const cron of Object.keys(JOBS)) {
    const weekday = cron.split(' ')[4];
    assert.ok(weekday === '*' || /^[A-Z]{3}$/.test(weekday), cron);
  }
});

test('the recording job is started every five minutes with a well-formed request', async () => {
  const github = fakeGitHub(204);
  assert.deepEqual(await startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl }), { attempts: 1 });
  assert.equal(github.calls.length, 1);
  const [call] = github.calls;
  assert.equal(call.url, 'https://api.github.com/repos/Meowthebest/OW2/actions/workflows/record-players.yml/dispatches');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.headers.Accept, 'application/vnd.github+json');
  assert.ok(call.headers['User-Agent'], 'GitHub refuses requests with no User-Agent');
  assert.ok(call.signal, 'a stuck request must time out');
  assert.deepEqual(call.body, { ref: 'main' });
});

test('the six-hourly patch sync uses the default scope, and the weekly one reads every month', async () => {
  const github = fakeGitHub(204, 204);
  await startJob(JOBS['17 */6 * * *'], TOKEN, { fetchImpl: github.fetchImpl });
  await startJob(JOBS['41 6 * * MON'], TOKEN, { fetchImpl: github.fetchImpl });
  assert.match(github.calls[0].url, /\/sync-patches\.yml\/dispatches$/);
  assert.deepEqual(github.calls[0].body, { ref: 'main' });
  assert.match(github.calls[1].url, /\/sync-patches\.yml\/dispatches$/);
  assert.deepEqual(github.calls[1].body, { ref: 'main', inputs: { scope: 'all' } });
});

test('a 200 also counts as started, since GitHub can answer that way', async () => {
  const github = fakeGitHub(200);
  assert.deepEqual(await startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl }), { attempts: 1 });
});

for (const [status, message] of [[401, 'Bad credentials'], [403, 'Resource not accessible by personal access token'], [404, 'Not Found'], [422, 'No ref found for: main']]) {
  test(`a ${status} refusal fails straight away and says why, without revealing the token`, async () => {
    const github = fakeGitHub({ status, body: { message } });
    const timing = noWait();
    await assert.rejects(
      startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl, wait: timing.wait }),
      (error) => {
        assert.match(error.message, new RegExp(`record-players\\.yml.*${status}.*${message}`));
        assert.ok(!error.message.includes(TOKEN));
        return true;
      },
    );
    assert.equal(github.calls.length, 1, 'retrying a refusal can not help');
    assert.deepEqual(timing.waits, []);
  });
}

test('an outage is retried, and a later success counts', async () => {
  const github = fakeGitHub(503, 204);
  const timing = noWait();
  assert.deepEqual(await startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl, wait: timing.wait }), { attempts: 2 });
  assert.deepEqual(timing.waits, [2000]);
});

test('a rate limit is retried', async () => {
  const github = fakeGitHub(429, 204);
  const timing = noWait();
  assert.deepEqual(await startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl, wait: timing.wait }), { attempts: 2 });
});

test('it gives up after three attempts, without waiting after the last one', async () => {
  const github = fakeGitHub(500, 502, 503);
  const timing = noWait();
  await assert.rejects(startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl, wait: timing.wait }), /Could not start record-players\.yml\. GitHub answered 503/);
  assert.equal(github.calls.length, 3);
  assert.deepEqual(timing.waits, [2000, 4000]);
});

test('network failures and timeouts are retried and described plainly', async () => {
  const timeout = new Error('slow');
  timeout.name = 'TimeoutError';
  for (const [failure, expected] of [[new TypeError('fetch failed'), /Could not reach GitHub/], [timeout, /did not answer in time/]]) {
    const github = fakeGitHub(failure, failure, failure);
    await assert.rejects(startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl, wait: async () => {} }), expected);
    assert.equal(github.calls.length, 3);
  }
});

test('an error page that is not JSON does not hide the status', async () => {
  const github = fakeGitHub(500, 500, 500);
  await assert.rejects(startJob(JOBS['*/5 * * * *'], TOKEN, { fetchImpl: github.fetchImpl, wait: async () => {} }), /GitHub answered 500$/);
});

async function withGlobals(github, run) {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const logged = [];
  globalThis.fetch = github.fetchImpl;
  console.log = (...parts) => logged.push(parts.join(' '));
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
  return logged;
}

test('a scheduled run starts the job for its schedule, and its log leaves out the token', async () => {
  const github = fakeGitHub(204);
  const logged = await withGlobals(github, () => worker.scheduled({ cron: '*/5 * * * *' }, { GITHUB_TOKEN: TOKEN }));
  assert.match(github.calls[0].url, /record-players\.yml/);
  assert.deepEqual(logged, ['Started record-players.yml']);
});

test('a schedule with no job fails clearly and asks nothing of GitHub', async () => {
  const github = fakeGitHub();
  await withGlobals(github, () => assert.rejects(worker.scheduled({ cron: '1 2 3 4 5' }, { GITHUB_TOKEN: TOKEN }), /No job is set for the schedule "1 2 3 4 5"/));
  assert.equal(github.calls.length, 0);
});

test('a missing token fails clearly and asks nothing of GitHub', async () => {
  const github = fakeGitHub();
  await withGlobals(github, () => assert.rejects(worker.scheduled({ cron: '*/5 * * * *' }, {}), /GITHUB_TOKEN secret is not set/));
  assert.equal(github.calls.length, 0);
});
