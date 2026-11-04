# Player data

How the player statistics get their data, and what they do and do not promise.

## Source

| Source | Used for |
| --- | --- |
| [Steam's `GetNumberOfCurrentPlayers` API](https://partner.steamgames.com/doc/webapi/ISteamUserStats) for app 2357570 | Every stored number. It needs no API key. |

**Steam players only.** The count leaves out Battle.net and console players, so it isn't Overwatch's total population. The page says this wherever a number appears.

Steam's API reports the current count and nothing else: no history, no peaks, no averages. So every other statistic is worked out from readings this site has stored itself, and history starts when recording starts.

SteamDB and Steam Charts hold longer histories. SteamDB doesn't allow scraping, and neither offers an API or permission to reuse its data here, so neither is an input. The page links to both for reference.

### Steam's terms

The [Steam Web API terms](https://steamcommunity.com/dev/apiterms) allow up to 100,000 calls a day, and this uses at most 288. They also require the data to be offered as is, and no implied endorsement, so the page and footer say both.

### How often a new count appears

The job reads the count every five minutes and stores a reading each time, which comes to about 288 readings a day.

Those readings aren't all new information. Steam's response allows caching for 15 minutes (`Cache-Control: public, max-age=900`), so a count can be up to about that far behind. The job doesn't try to get around this, because that wouldn't be fair use of Steam's service.

How this looks depends on where the request comes from:

- **From one home computer,** polling once a minute for 17 minutes, the count only changed when the cache expired.
- **From GitHub's machines,** the first 34 readings, over 2 hours 45 minutes on November 4, 2026, gave 20 different counts. 8 readings matched the one before. 6 went back to the count from two readings earlier while the player count was climbing, and the largest of those moves was 0.56% of the count. That suggests Steam's servers hold copies of different ages, though Steam doesn't document this.

So small zigzags in the line aren't necessarily real changes.

Each reading's time comes from the response's cache headers (`Expires` minus `max-age`), or from the clock if those look wrong. From GitHub's machines, those headers have matched the time of the read, so the time shows when this site read the count. Steam's copy of the count can be older than that.

## How it runs

`.github/workflows/record-players.yml` runs on GitHub Actions, and `scripts/players/collect.mjs` does the work. It has no dependencies, so each run stays short.

Visitors never contact Steam, which also blocks direct browser requests. Everyone reads the same stored files, so traffic adds no calls to Steam.

### What starts the job

A small Cloudflare Worker in [`timer/`](../timer/README.md) starts the job every five minutes through GitHub's API.

GitHub's own schedule can't be relied on for this. Since late August 2026, people have reported scheduled runs that are [hours late or never created](https://github.com/orgs/community/discussions/206019), or [mostly dropped](https://github.com/Stvad/knowledge-medium/issues/1458), with no confirmed cause or fix. When this job was added on November 4, 2026, it had no runs in its first 2 hours 45 minutes, even though it was scheduled every five minutes.

The workflow keeps its own schedule as a backstop. If both start it, nothing is stored twice.

### Where data lives

This site has no database, so readings are stored as files on a separate branch, `player-data`. They aren't on `main` because new readings would clutter its history and keep rejecting other pushes. The site reads the files from `raw.githubusercontent.com`, which caches them for about five minutes, so a new reading doesn't need a deploy.

| File | Contents |
| --- | --- |
| `samples/YYYY-MM.jsonl` | Every reading, as `[unixSeconds, players]`. The source of truth, and it is only ever added to. |
| `recent.json` | The last 8 days of readings, for the 24-hour and 7-day charts. |
| `hourly.json` | `[hourStart, low, average, high, readings]` per hour, for longer charts and comparisons. |
| `latest.json` | The current count, statistics, last attempt and a sparkline. |

The history in git keeps every earlier version of these files. If a derived file is ever lost or damaged, the next run rebuilds it from the samples, or you can run:

```bash
node scripts/players/collect.mjs <data-folder> --rebuild
```

### When things fail

- **Steam fails, times out or rate limits:** the job retries briefly, honoring `Retry-After`, then notes the failure in `latest.json` and keeps all stored data. The run still counts as successful, so a Steam outage doesn't send a failure email every five minutes. Warnings show on the run's page.
- **Steam sends something unbelievable:** a missing, non-numeric, zero or impossibly large count is rejected and never stored.
- **A browser can't load the files:** it keeps showing what it has, marked Stale Data, and waits longer between retries.
- **A reading gets old:** past 45 minutes, the count is marked Stale Data with the time of the reading.

Identical observations aren't stored twice. At most one reading is kept per five-minute window, and a response no newer than the last reading is skipped. The same count read at a later time is stored, because Steam's response doesn't show whether the count stayed the same or the copy was old.

## What each statistic needs

Nothing is estimated. Until a statistic has enough data, it shows Collecting and how far along it is.

| Statistic | Available when |
| --- | --- |
| Playing Now | After the first reading |
| 24-Hour Peak | At least 20 of the last 24 hours have a reading |
| 24-Hour Change | A reading exists within 30 minutes of exactly 24 hours ago |
| 30-Day Average | 30 days of recording, with at least 80% of hours covered. It averages hourly averages, so a stretch of frequent readings can't outweigh the rest. |
| Recorded Peak | After the first reading |
| Daily and weekly comparison | Both periods have at least 80% of their hours |
| Patch comparison | Both sides have at least 60% of their hours, and the "after" window has finished |

**Recorded Peak isn't Overwatch's all-time peak.** Steam's API has no such figure, so this is only the highest count recorded since this site began. The true all-time Steam peak may well be higher.

## The chart

- The 24-hour and 7-day ranges show every reading. 30 days shows hourly averages.
- 90 days and longer show daily averages, with each day's low and high shaded, once at least 60 days exist. Days with fewer than 12 recorded hours are left out, because they would skew toward whatever time of day was recorded.
- The line breaks across gaps in recording, and the chart starts at the first reading. Nothing is drawn or implied before then.
- A moving average only starts after one full window. After a gap, it restarts once it has enough readings: half a window for hourly and daily averages, and about a sixth of a window on the 24-hour and 7-day ranges.

## Patches

Patch markers come from the patch notes data, and link to those notes. Only gameplay patches and season starts are marked.

Comparisons leave out the release day, because only the date of a patch is stored and not the hour. Windows of 1, 3 and 7 days are shown. The 7-day window is the least affected by the weekly cycle.

**These figures don't show that a patch caused a change.** Counts also move with events, seasons, weekends and time of day, and the page says so beside each comparison.

## Known limitations

- **History starts when recording starts.** The longer ranges fill in over time, and patches from before that have no readings around them.
- **Readings are about five minutes apart, but a count can lag by up to about 15.** Steam's servers can hold copies of different ages, so the line can repeat a number or zigzag slightly.
- **Recording depends on the timer.** If the Worker stops or its GitHub token expires, no readings are taken until that is fixed. The gap appears as a break in the chart, and the page marks the count Stale Data. [`timer/README.md`](../timer/README.md) covers renewing the token, which lasts up to a year. GitHub's own schedule is only a backstop, and its runs can be hours late or missing.
- **GitHub can pause a workflow.** It pauses scheduled workflows after 60 days with no repository activity. If that happens, turn the job back on from the Actions tab.
- **Five-minute runs are a heavy use of Actions.** It is free for public repositories and uses very little compute, but GitHub's terms are aimed at building and shipping software, so GitHub could limit it. Starting the job every 15 minutes instead would cut its runs by two thirds, at the cost of fewer readings and older counts. If GitHub does limit it, the collector can move elsewhere, such as into a Cloudflare Worker, by writing the same files there and setting `VITE_PLAYER_DATA_URL`.
- **"Live" means the most recent reading.** With Steam's cache, the job's timing and the file caching, the count shown can be up to about 30 minutes old. The page shows when the reading was taken, and Steam's copy of the count can be older than that.
