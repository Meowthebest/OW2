# Career data: sources, caching and limits

Everything here was checked against the live services on 2026-11-04, using OverFast API v4.15.0.

## Where the data comes from

```
GitHub Pages site -> (optional) Cloudflare Worker + KV -> OverFast API -> public Blizzard career pages
```

- **Blizzard:** I found no official Overwatch career API on Blizzard's developer portal. Community projects all read the public career pages instead.
- **OverFast API:** an unofficial, community-run, MIT-licensed API that reads those pages. It needs no key, so there are no secrets to protect.

The site labels data as cached and names its source. It never calls the data live.

## What each feature uses

| Feature | Endpoint |
| --- | --- |
| Player search | `GET /players?name=` |
| Banner, avatar, title, endorsement, ranks | `GET /players/{id}/summary` |
| Summary, roles, hero comparison, charts, hero table | `GET /players/{id}/stats/summary`, once each for all modes, Quick Play and Competitive |
| Detailed career tables | `GET /players/{id}/stats/career?gamemode=` (loaded only on the Statistics tab) |

An uncached profile takes 4 requests, plus 1 for the Statistics tab. The site runs at most 3 at a time.

## Verified API behavior

| Topic | What was found |
| --- | --- |
| CORS | `Access-Control-Allow-Origin: *`, including on errors, so GitHub Pages can call it directly |
| Rate limits | 30 requests/second per IP (burst 5), 10 simultaneous. `429` when exceeded, `503` when Blizzard is throttling OverFast |
| Upstream cache | `max-age=600` on most responses. The API's own docs give both 10 minutes and 1 hour for careers |
| Stale responses | OverFast can serve old data while it refreshes. One response carried `Age: 18453`, about 5 hours old, with `x-cache-status: stale` |
| Unreadable headers | `Age`, `X-Cache-Status` and `Retry-After` are not exposed across origins, so a browser calling OverFast directly cannot read them |
| Search | Exact, case-sensitive name match, public profiles only. `#` is not accepted, so `Name#1234` is sent as `Name-1234` |
| Player ids | A BattleTag or a hex id such as `abc%7Cdef`. Ids are stored decoded and encoded once per request |
| No stats | `/stats/summary` and `/stats/career` return `{}` |
| Unknown player | `404`, with `retry_after` either beside the error text or nested under `error`. Both shapes are handled |

## Caching

### Browser cache (always on)

`src/features/career/api/store.ts`, stored in `localStorage`.

- **Key:** endpoint, player id, game mode and platform.
- **Lifetime:** 1 hour for career data and 10 minutes for search. A longer upstream `max-age` is respected, and `no-store` responses are never written to disk.
- **Stale-while-revalidate:** an expired copy appears immediately, marked as checking for newer data, and is replaced once the new response arrives.
- **Failures:** a failed update keeps the old copy and its old timestamp, and says the update failed.
- **Privacy:** a `404` deletes the copy, and an empty response replaces it, so a profile that was removed or made private stops being shown after its next update.
- **Limits:** about 3.5 MB, oldest entries evicted first, 14 days maximum.
- **Requests:** identical requests are merged. Short rate-limit waits retry once, and longer ones pause all requests until the wait is over.
- **Manual refresh:** once per player per minute, and longer if the source asked the site to wait.

### Cloudflare Worker with KV (optional)

`worker/`. See [worker/README.md](../worker/README.md) for setup.

It adds a cache shared between all visitors, keeps working copies when OverFast is down, and can read the headers a browser cannot. That makes "Last updated" more accurate, because it accounts for OverFast's own cache age. If the Worker is unreachable, the site falls back to calling OverFast directly.

- Requests are allowlisted by path, game mode and platform. Everything else gets a `400`.
- Only origins in `ALLOWED_ORIGINS` get CORS access.
- Career data is fresh for 1 hour (or the upstream `max-age` if longer) and kept for up to 7 days for stale serving. Empty responses are re-checked after 10 minutes.
- A `404` deletes the entry, and an empty response replaces it, so privacy changes are honored.
- Search uses the edge cache rather than KV, to save the write quota. If the edge cache is unavailable, search passes through to OverFast.

**Free plan limit:** KV allows 1,000 writes per day, and an uncached profile uses 4 or 5. Past the limit, responses still work but stop being cached until the quota resets at 00:00 UTC. KV can also take up to about a minute to show new values in other regions, so the refresh cooldown is approximate across regions.

### Scheduled GitHub Actions sync (not built)

This would suit a site showing a single fixed player, by committing static JSON on a schedule. It does not fit a site where anyone can search for any player, so it was left out. The provider interface in `src/features/career/api/provider.ts` is where such a source would plug in.

## What "Last updated" means

- **Direct mode (default):** when this browser last fetched the data. OverFast's own cache can make the data older than that, because the browser cannot read its age. The page says so next to the source.
- **Worker mode:** the Worker's fetch time minus OverFast's reported cache age, so it is closer to the true age of the data.
- The page always shows the oldest timestamp among the data on screen.
- "Blizzard profile changed" is a separate date reported by the source.

## Limitations

- **Refresh cannot force a new Blizzard read.** It asks for a new copy, but OverFast may answer from its own cache. The site then reports that there is no newer data yet.
- **Private profiles were not tested against a real example.** Search hides them, so none could be found to test with. The handling follows OverFast's schema and source code (`{}` for stats, `null` for ranks), and the tests use simulated responses. The API does not separate "private" from "no stats", so the page says it could be either.
- **No player level.** The source only provides the endorsement level and its badge, so that is what the banner shows.
- **No match history or trends.** Blizzard's pages only publish current totals, so there are no charts over time.
- **Competitive stats cover the last season played**, not all time.
- **Season names are mapped by hand.** Profiles report a running number, and 21 to 25 are shown as "2026: Season 1" to "2026: Season 5". Other numbers show as reported, such as "Season 26", until their official name is added to `seasonLabel` in `src/features/career/stats.ts`.
- **Mixed platforms:** `/stats/career` with no platform uses a single platform, preferring PC, while `/stats/summary` merges them. Choose a platform in the filter to see each one separately.
- **Third-party dependency:** avatars, namecards and rank icons load from Blizzard's image hosts. Failures fall back to initials or text. If OverFast is down, previously viewed profiles still show from cache, and new lookups show an error.
- **Service terms:** OverFast is a free community service with no uptime guarantee. If traffic grows, self-host it and point the Worker at your instance. Behind a proxy, all visitors share one rate-limit bucket, which is another reason to keep the Worker's cache in front of it.
