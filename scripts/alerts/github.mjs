// Turns alerts into GitHub issues: one per key, opened once, and closed when the problem clears.

export const ALERT_LABEL = 'site-alert';
const MARKER = /<!-- ow2-alert: (.+?) -->/;

export const keyOf = (issue) => MARKER.exec(issue.body ?? '')?.[1] ?? null;
const familyOf = (key) => key.split(':')[0];

export function issueBody(alert, owner) {
  return [
    alert.body,
    '---',
    `This issue closes by itself once the problem has cleared. Close it yourself to dismiss the alert. It won't come back for the same thing. See [how alerts work](https://github.com/Meowthebest/OW2/blob/main/docs/ALERTS.md).${owner ? ` cc @${owner}` : ''}`,
    `<!-- ow2-alert: ${alert.key} -->`,
  ].join('\n\n');
}

/**
 * Compares this run's results with the existing issues. results maps a family, the first part of a key, to what its check
 * reported. A family that's missing couldn't be checked this time, so its issues are left alone.
 */
export function planIssues(results, existing, { maxNew = 5 } = {}) {
  const current = new Map();
  for (const result of Object.values(results)) {
    for (const alert of result.alerts) current.set(alert.key, alert);
  }
  const known = new Set(existing.map(keyOf));
  const fresh = [...current.values()].filter((alert) => !known.has(alert.key));
  const close = existing.filter((issue) => {
    const key = keyOf(issue);
    if (!key || issue.state !== 'open' || current.has(key)) return false;
    const result = results[familyOf(key)];
    return Boolean(result) && !result.keepOpen?.(key);
  });
  // A limit on each run, so a bug can't fill the repository with issues. The rest open on later runs.
  return { create: fresh.slice(0, maxNew), held: Math.max(0, fresh.length - maxNew), close };
}

export async function applyPlan(plan, github, { owner = null } = {}) {
  if (plan.create.length > 0) await github.ensureLabel();
  for (const alert of plan.create) await github.createIssue(alert.title, issueBody(alert, owner));
  for (const issue of plan.close) await github.closeIssue(issue.number, 'This has cleared, so the alert job closed it.');
}

class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createGitHub({ repo, token = null, fetchImpl = globalThis.fetch, api = process.env.GITHUB_API_URL ?? 'https://api.github.com' }) {
  async function request(method, pathname, body) {
    const response = await fetchImpl(`${api}${pathname}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'ow2-site-alerts',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const detail = response.status === 410 ? 'Issues are turned off for this repository. Turn them on under Settings > General.' : `GitHub answered ${response.status}.`;
      throw new GitHubError(`${method} ${pathname}: ${detail}`, response.status);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    /** Every alert issue, open or closed, since a closed one means that alert was dealt with. */
    async alertIssues() {
      const issues = [];
      for (let page = 1; ; page += 1) {
        const list = await request('GET', `/repos/${repo}/issues?labels=${ALERT_LABEL}&state=all&per_page=100&page=${page}`);
        issues.push(...list.filter((issue) => !issue.pull_request));
        if (list.length < 100) return issues;
      }
    },
    async ensureLabel() {
      try {
        await request('POST', `/repos/${repo}/labels`, { name: ALERT_LABEL, color: 'f5a623', description: 'Something on the site needs a person' });
      } catch (error) {
        // 422 means the label already exists.
        if (error.status !== 422) throw error;
      }
    },
    createIssue: (title, body) => request('POST', `/repos/${repo}/issues`, { title, body, labels: [ALERT_LABEL] }),
    async closeIssue(number, comment) {
      await request('POST', `/repos/${repo}/issues/${number}/comments`, { body: comment });
      await request('PATCH', `/repos/${repo}/issues/${number}`, { state: 'closed', state_reason: 'completed' });
    },
    /** A job's recent runs on main, newest first, and the id of its last good one, however long ago that was. */
    async jobRuns(file) {
      const recent = await request('GET', `/repos/${repo}/actions/workflows/${file}/runs?branch=main&per_page=30`);
      const good = await request('GET', `/repos/${repo}/actions/workflows/${file}/runs?branch=main&status=success&per_page=1`);
      return { runs: recent.workflow_runs, lastSuccessId: good.workflow_runs[0]?.id ?? null };
    },
  };
}
