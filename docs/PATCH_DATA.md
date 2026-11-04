# Patch data

How the patch notes and balance tracker gets its data, and what it does and does not promise.

## Sources

| Source | Used for |
| --- | --- |
| [Blizzard's published patch notes](https://overwatch.blizzard.com/en-us/news/patch-notes/) | Every stored value. This source always takes precedence. |
| Blizzard's forum post for a patch, when a review links one | A cross-check of stored numbers during `verify`. |
| Blizzard's hero pages | Perk names, so a perk can be recognized by name. |

There is no official Blizzard API for patch notes. The notes are public, server-rendered pages that `robots.txt` allows, so the import reads them directly, one month at a time, with an identifying user agent. It runs ahead of time and never in a visitor's browser. No secrets are involved.

Third-party summaries are not an input. When the November 3, 2026 import was built, [NerfRadar](https://nerfradar.com/patch/ow-2026-11-03) was compared by hand as a sanity check. Its totals differ because it sorts lines into its own categories.

## What is stored

Each patch is one file in `public/data/patches/<date>.json`, plus `index.json` (patch list and last check time) and `heroes.json` (per-hero results, so history views know which patches to load).

Every hero line becomes a record with:

- A stable ID: `patch/format/hero/ability/index`
- Hero, role as published in that patch, format (5v5, 6v6, Stadium, limited-time mode) and queue
- Ability or perk, kind (weapon, ability, ultimate, passive, Minor Perk, Major Perk, Stadium Power, Stadium Item, base stat) and stat name
- Previous value, new value, unit and percent difference
- Classification, who classified it (`rule`, `review` or `none`) and whether it is situational
- A fingerprint of the original line

The patch file carries the official source URL, first import time, last verified time and an edit log.

### Blizzard's wording is deliberately not stored

Original patch text and developer comments are Blizzard's writing, and republishing them in full is not this site's call. So the import keeps facts only, and leaves the wording on Blizzard's page:

- Each line stores a fingerprint of its text, which shows when a line was edited, plus a link to the source.
- A line with no numbers shows as "Wording on Blizzard's page" until someone reviews it.
- For reviewed patches, short summaries are written by hand in different words, and developer intent is labeled as a summary.
- `validatePatch` rejects unusually long text, so a passage can't end up stored by accident.

## What a line can say

| Published as | Stored as |
| --- | --- |
| `Damage increased from 22 to 24.` | Previous 22, new 24, +9.1% |
| `Lifesteal reduced to 3% (Down from 4%).` | Previous 4%, new 3%, -1 point (-25%) |
| `Healing reduced by 65%.` | A stated change of -65%, with no previous or new value |
| `Cooldown reduced to 7.5 seconds.` | New 7.5s, with the previous value marked as not published |
| `Removed.` | A short label, "Removed" |
| Anything else | Nothing except that the line exists and where to read it |

Missing values are never filled in. A percent only appears when two published values exist and the previous one is not zero. A review can also clear a percent where it would mislead, such as a penalty going from 60% to 50%.

## Classification

Rules in `src/features/patches/core/classify.ts` classify each line by what its stat means, so a shorter cooldown is a buff and a longer one is a nerf. A line is marked **Needs Review** rather than guessed when:

- The stat is ambiguous, such as knockback, hit volumes or currency
- The wording and the numbers disagree
- The line has no numbers
- The stat isn't recognized

A hero's overall result in a patch and format is then:

- **Buffed** or **Nerfed** if every classified line agrees
- **Mixed** if it has both, with a lean worked out from the counts, where a situational change counts for half
- **Neutral** if it only has neutral or quality-of-life lines
- **Needs Review** if nothing else could be classified

Bug fixes never change a result. Headline hero counts are unique heroes in standard play, and Stadium and limited-time modes are counted separately. 6v6 lines sit on the standard card, tagged and counted apart.

Buff and nerf describe the direction of a change. They are not a claim about how strong a hero is, and anything interpretive on the page is labeled Analysis.

### Reviews

A review is a file at `scripts/patches/reviews/<date>.json`. It can settle classifications and add own-words summaries. Each entry names the fingerprint of the line it was written against, so if Blizzard edits that line, the review stops applying, the line falls back to the rules, and the sync reports it.

To review a patch:

```bash
node scripts/patches/cli.mjs review-template 2026-11-03
```

That prints each line's ID, fingerprint and current result. Copy `reviews/2026-11-03.json` as a model, then run a sync.

## Keeping it current

`.github/workflows/sync-patches.yml` runs on GitHub Actions:

- Every six hours it reads the current and previous month.
- Once a week it reads every stored month, to catch late edits.
- People with write access can run it by hand from the Actions tab. That is the admin refresh, and it needs no login system or secret on the site.

It commits only when something changed, or once a day to update the last-checked time, then starts the deploy workflow. It has to start the deploy itself, because commits made by a workflow do not trigger push events.

On a failed read, the job stops before writing anything. It also refuses to replace stored data if a patch's line count drops sharply, or if a month with stored patches suddenly parses to nothing, because both usually mean the page's markup changed. In those cases the site keeps serving the last verified data, and shows a warning if the last check is more than three days old. A patch that disappears from the page stays stored.

When Blizzard edits published notes, the new values replace the old ones and the edit is logged in the patch's `revisions`.

### Manual import

If automatic reading stops working, save each month's page as `month-YYYY-MM.html` in a folder, then:

```bash
node scripts/patches/cli.mjs sync --all --from-dir path/to/folder
```

After confirming by hand that a large drop is genuine, add `--accept-shrink`.

### Checks

```bash
npm run check:patches
```

Checks the stored data offline: official source links, unique IDs, fingerprints, percents that match their values, and counts that match their lines.

```bash
npm run verify:patches
```

Reads Blizzard's pages again and compares every stored line and value, then cross-checks numbers against the forum post where one is linked.

## Known limitations

- **History starts at Season 1 of 2026** (February 9, 2026). Earlier months exist on Blizzard's site, and `--since YYYY-MM` with `--all` imports them, but they have not been checked.
- **Only November 3, 2026 is fully reviewed.** Older patches are classified by rules alone, which can make mistakes, and many of their lines are left as Needs Review. This is most common in Stadium and limited-time modes, whose notes describe mechanics in sentences rather than numbers. Their hero cards say so.
- **Unconnected values show as gaps.** A timeline only links two patches if the first's new value equals the second's previous value. Different wording for the same stat can also start a separate series.
- **Competitive and Quick Play:** none of the stored hero lines names a single queue, so both filter choices show the same changes and the page says why. If a future line does name one, it will be filtered properly.
- **Dates follow Blizzard's date field.** A few patch titles name the following day, such as the patch dated February 9, 2026, which is titled February 10.
- **Ability types are partly curated.** Weapons, ultimates and passives are listed by hand in `scripts/patches/hero-abilities.json`, because hero pages do not mark them. A new hero needs an entry there as well as in the roster. Until then its lines still import, but as plain abilities.
- **Severity is not scored.** There is no editorial impact rating, so there is no sort by severity.
