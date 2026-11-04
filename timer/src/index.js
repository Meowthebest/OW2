// Cloudflare Worker: starts this site's GitHub Actions jobs on time.
// GitHub's own schedule has been unreliable since late August 2026, while jobs started through its API begin
// within seconds. This only asks GitHub to start a job. The jobs still do all the work and store the results.

const WORKFLOWS = 'https://api.github.com/repos/Meowthebest/OW2/actions/workflows';
const BRANCH = 'main';
const USER_AGENT = 'OW2-Job-Timer (+https://github.com/Meowthebest/OW2)';

const ATTEMPTS = 3;
const TIMEOUT_MS = 15000;

// Each key must match a cron in wrangler.toml exactly. A test checks this.
export const JOBS = {
  '*/5 * * * *': { workflow: 'record-players.yml' },
  '17 */6 * * *': { workflow: 'sync-patches.yml' },
  '41 6 * * MON': { workflow: 'sync-patches.yml', inputs: { scope: 'all' } },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GitHub's own short explanation of a refusal, when it gives one. */
async function reason(response) {
  try {
    const { message } = await response.json();
    return typeof message === 'string' ? `: ${message.slice(0, 200)}` : '';
  } catch {
    return '';
  }
}

/** Asks GitHub to start a job. Outages and rate limits get short retries. A refusal won't change, so it fails straight away. */
export async function startJob(job, token, { fetchImpl = fetch, wait = sleep } = {}) {
  const body = JSON.stringify({ ref: BRANCH, ...(job.inputs ? { inputs: job.inputs } : {}) });
  let problem = 'GitHub did not answer';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(`${WORKFLOWS}/${job.workflow}/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return { attempts: attempt };
      problem = `GitHub answered ${response.status}${await reason(response)}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      problem = error?.name === 'TimeoutError' ? 'GitHub did not answer in time' : 'Could not reach GitHub';
    }
    if (attempt < ATTEMPTS) await wait(2000 * attempt);
  }

  throw new Error(`Could not start ${job.workflow}. ${problem}`);
}

export default {
  // A thrown error marks this run as failed in Cloudflare's logs.
  async scheduled(controller, env) {
    const job = JOBS[controller.cron];
    if (!job) throw new Error(`No job is set for the schedule "${controller.cron}"`);
    if (!env.GITHUB_TOKEN) throw new Error('The GITHUB_TOKEN secret is not set');
    const { attempts } = await startJob(job, env.GITHUB_TOKEN);
    console.log(`Started ${job.workflow}${attempts > 1 ? ` on attempt ${attempts}` : ''}`);
  },
};
