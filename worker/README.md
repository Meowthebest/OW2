# Career cache worker

An optional Cloudflare Worker that adds a shared, persistent cache in front of OverFast API.

```
GitHub Pages -> this Worker -> Workers KV -> OverFast API -> public Blizzard career pages
```

The site works without it. Add it to reduce repeat requests, keep serving copies during OverFast outages, and get more accurate "Last updated" times. It uses no secrets.

## Deploy

You need a free Cloudflare account. Run these from this folder:

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create CAREER_CACHE
```

Paste the id it prints into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`. Then deploy:

```bash
npx wrangler deploy
```

Wrangler prints the Worker's URL. To connect the site:

1. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**.
2. Add a variable named `CAREER_API_URL` with the Worker's URL as its value.
3. Re-run the **Deploy Vite site to Pages** workflow.

The profile page should then show "Source: OverFast API via cache worker".

If your site moves to another domain, update `ALLOWED_ORIGINS` in `wrangler.toml`.

## Response headers

| Header | Meaning |
| --- | --- |
| `X-Career-Cache` | `origin`, `kv-fresh`, `kv-stale`, `kv-stale-if-error`, `refreshed`, `refresh-throttled`, `edge` or `bypass` |
| `X-Career-Fetched-At` | When the Worker fetched this copy, in epoch milliseconds |
| `X-Upstream-Age` | Age of OverFast's copy at that moment, in seconds |
| `X-Upstream-Cache` | OverFast's own cache status |
| `Retry-After` | Seconds to wait, on a throttled refresh or upstream rate limit |

Add `?refresh=1` to re-fetch an entry. It is limited to once per minute per entry.

## Test

```bash
npm run test:worker
```

Run this one from the repository root. To try it locally against the real API with simulated KV, run this from this folder:

```bash
npx wrangler dev
```

On Windows, if that fails with `SQLITE_CANTOPEN`, the project path is too long. Add `--persist-to` with a short path.

## Limits

The free plan allows 1,000 KV writes per day, and an uncached profile uses 4 or 5. Past the limit, responses keep working but are not cached until the quota resets at 00:00 UTC. See [Workers KV limits](https://developers.cloudflare.com/kv/platform/limits/).
