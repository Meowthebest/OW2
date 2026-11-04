# Job timer

A small Cloudflare Worker that starts this site's GitHub Actions jobs on time.

GitHub's own schedule has been unreliable since late August 2026: people report scheduled runs that are [hours late, dropped or never created](https://github.com/orgs/community/discussions/206019), while jobs started through GitHub's API begin within seconds. So this Worker asks GitHub to start them. The jobs still do all the work, and each workflow keeps its own schedule as a backstop.

| Schedule (UTC) | Job |
| --- | --- |
| Every 5 minutes | Record Steam players |
| Every 6 hours, at 17 minutes past | Sync patch notes, for the current and previous month |
| Mondays at 06:41 | Sync patch notes, for every stored month |

It has no web address, so nothing outside can reach it. It only runs on this schedule, and it fits within Cloudflare's free plan.

## Set it up

You need a free Cloudflare account with a verified email address.

1. Create a GitHub token with [this link](https://github.com/settings/personal-access-tokens/new?name=OW2+job+timer&description=Starts+the+OW2+recording+and+patch+sync+jobs&expires_in=366&actions=write). Under **Repository access**, choose **Only select repositories** and pick `OW2`. Leave everything else as filled in, generate the token and copy it. It can manage this repository's Actions jobs, but it can't change code.
2. Run these from this folder:

   ```bash
   npx wrangler login
   ```

   ```bash
   npx wrangler deploy
   ```

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

   The last command asks for the token, so paste it there. Cloudflare stores it encrypted, and it can't be read back.

Within five minutes, **Record Steam players** should show a new run in the repository's Actions tab.

## Renew the token

The token lasts up to a year. When it expires, GitHub refuses the timer's requests, readings stop and the site marks the player count Stale Data.

To renew it, create a new token with the link above, then run this from this folder:

```bash
npx wrangler secret put GITHUB_TOKEN
```

If a token is ever exposed, delete it under GitHub's **Settings → Developer settings → Personal access tokens → Fine-grained tokens**, then create a new one.

## When something is wrong

Each run's outcome is in the Cloudflare dashboard, under **Workers & Pages → ow2-job-timer → Logs**.

| Message | Meaning |
| --- | --- |
| `GitHub answered 401` | The token is wrong or has expired. Renew it. |
| `GitHub answered 403` | The token doesn't include `OW2`, or lacks write access to Actions. Create it again with the link above. |
| `GitHub answered 404` | The workflow file was renamed or removed. Update `JOBS` in `src/index.js`. |
| `GitHub answered 422` | The branch is missing, or the workflow no longer has a `workflow_dispatch` trigger. |
| `The GITHUB_TOKEN secret is not set` | Run the `secret put` command above. |
| `You need a workers.dev subdomain` | Cloudflare requires one before it accepts schedules, and opening the Workers page didn't always create it. See below. |

GitHub can also pause a workflow after a long quiet spell. If the Actions tab says a job is disabled, turn it back on there.

### Creating the workers.dev subdomain

Deploying any Worker with `workers_dev = true` makes Wrangler offer to register a subdomain. In an empty folder, create a one-line Worker and a `wrangler.toml` with that setting, run `npx wrangler deploy` and answer its questions. Then run `npx wrangler delete` there and deploy this Worker again.

The subdomain doesn't give this Worker a web address, because its configuration sets `workers_dev = false`.

## Change the schedule

Edit `crons` in `wrangler.toml` and the matching key of `JOBS` in `src/index.js`, then deploy again. The two must match exactly, and a test checks that they do. The free plan allows five schedules per account.

Steam only publishes a new count about every 15 minutes, so changing the recording job to `*/15 * * * *` would cut its runs by two thirds, at the cost of slightly older counts.

## Test

From the repository root:

```bash
npm run test:timer
```

To try it in Cloudflare's local runtime, run this from this folder, then open `http://localhost:8787/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*`:

```bash
npx wrangler dev --test-scheduled --var GITHUB_TOKEN:not-a-real-token
```

GitHub refuses the made-up token with a 401, which shows the request reached it. Nothing gets started.

## Turn it off

Run this from this folder, then delete the token on GitHub:

```bash
npx wrangler delete
```

Recording then depends on GitHub's own schedule again.
