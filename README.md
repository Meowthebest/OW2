# OW2 Hero Selector

A fan-made Overwatch companion:

- **Random hero selector:** roll for 1 to 5 players with no duplicates on a team. Filter by role, lock each player's role, exclude heroes, run no-repeat cycles, and watch the reels land on your picks.
- **Career dashboard:** search public player profiles and browse heroes, roles, ranks and win rates.
- **Patch notes and balance tracker:** see who was buffed or nerfed, filter every change, open a hero's history, and compare patches. Every value links back to Blizzard's published notes.
- **Player statistics:** Steam's concurrent player count for Overwatch, recorded over time, with a history chart and patch markers. Steam players only.
- **Cosmetics hub:** a searchable catalogue of over 15,000 cosmetics, bundles, the live shop with its history, loot pools, mythics, Battle Passes, Twitch Drops, statistics and hero rates, plus your own collection tracking. Every record shows its source.

Live site: https://meowthebest.github.io/OW2/

## Run it

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the logic, patch, player, cosmetics, alert, worker, timer, accounts and UI tests, plus a build |
| `npm run check:roster` | Compare the hero list with the live API and check image files |
| `npm run check:alerts` | Report what needs a person, without changing anything |
| `npm run sync:patches` | Read Blizzard's latest patch notes into `public/data/patches` |
| `npm run verify:patches` | Compare every stored value against Blizzard's pages again |
| `npm run check:patches` | Check the stored patch data, offline |
| `npm run sync:shop` | Record the Overwatch shop if it changed |
| `npm run backfill:shop` | Read past shops and item history. Needs `ITEMSHOP_API_KEY` |
| `npm run import:wiki -- FILE...` | Import hand-made wiki export files, offline |
| `npm run check:cosmetics` | Check the stored cosmetics data, offline |

## Project layout

```
src/
  data/heroes.ts        The roster: one entry per hero
  lib/                  Pure helpers: randomizer, router, formatting, storage
  components/           Shared UI: controls, portraits, toasts, header and footer
  features/randomizer/  Stage, reel, settings, recent results, roster
  features/career/
    api/                Data layer: provider, cache, errors. No UI code.
    components/         Dashboard panels, charts, tables
    useCareer.ts        Hooks connecting the data layer to the UI
  features/patches/
    core/               Parsing, classification and checks, shared with the import script
    components/         Header, filters, hero cards, hero panel, history
    filters.ts          Filter state, URL parameters, cards and sorting
    history.ts          Stat timelines, patch comparison, repeated changes
  features/players/
    core.ts             Statistics, chart data and comparisons
    data.ts             Reads stored readings, with one shared refresh
    components/         Homepage widget, chart, patch activity
  features/cosmetics/
    core/               Data model, shop reader, filters, tracking, shared with the import scripts
    components/         Gallery, cards, images, shared parts
    pages/              One file per page, with its detail view
    account.ts          Optional sign-in and sync
    useCollection.ts    Personal tracking
  styles/               Design tokens and page styles
public/heroes/          Self-hosted hero images
public/data/patches/    Imported patch data, one JSON file per patch
scripts/patches/        Patch import command, season list, ability names, reviews
scripts/players/        Steam reading collector
scripts/cosmetics/      Shop recorder, wiki import, catalogue build
data/cosmetics/         Stored shop records, wiki import, hand-entered records and corrections
worker/                 Optional Cloudflare Worker cache
timer/                  Cloudflare Worker that starts the scheduled jobs
accounts/               Optional Cloudflare Worker for sign-in and synced tracking
docs/CAREER_DATA.md     Career data source facts and known limitations
docs/PATCH_DATA.md      Patch data sources, method and known limitations
docs/PLAYER_DATA.md     Player data source, storage and known limitations
docs/COSMETICS_DATA.md  Cosmetics sources, storage, admin tools and known limitations
docs/ALERTS.md          What the alert issues flag and how they behave
```

## Add a new hero

1. Add an entry to `src/data/heroes.ts`. The `id` must match the hero's key in the OverFast API, because career stats are matched on it.
2. Add three images: `public/heroes/portrait/<id>.webp` (256×256), `public/heroes/art/<id>.webp` (1600×760) and `public/heroes/art/<id>-900.webp` (900 wide).
3. Add the hero's weapons, ultimates and passives to `scripts/patches/hero-abilities.json`, so patch lines are sorted correctly, then run `node scripts/patches/cli.mjs abilities` to fill in perk names.
4. Run `npm run check:roster`, which reports new heroes, role changes and missing images.

A missing image will not break the page. Portraits fall back to initials on a role-colored tile.

## Deployment

Pushing to `main` runs the tests, builds the site and publishes it to GitHub Pages using `.github/workflows/deploy.yml`.

Career data works immediately with no setup, because the site can call OverFast API directly. To add the persistent cache, follow [worker/README.md](worker/README.md).

`.github/workflows/sync-patches.yml` reads Blizzard's patch notes every six hours, commits any changes and redeploys. To refresh by hand, open **Actions → Sync patch notes → Run workflow** on GitHub, which only people with write access can do.

`.github/workflows/record-players.yml` checks Steam's player count every five minutes and stores new readings on the `player-data` branch. It can also be run by hand from the Actions tab.

`.github/workflows/sync-shop.yml` checks itemshop.gg for a new shop every 15 minutes. When there is one, it stores it under `data/cosmetics/shop` and redeploys. It can also be run by hand, which is the admin refresh.

GitHub's own schedule has been unreliable, so a small Cloudflare Worker starts these jobs on time. See [timer/README.md](timer/README.md).

`.github/workflows/alerts.yml` opens a GitHub issue when something needs a person, such as a new hero, a wiki export that's due or a job that keeps failing. See [docs/ALERTS.md](docs/ALERTS.md).

| Setting | Where | What it's for |
| --- | --- | --- |
| `ITEMSHOP_API_KEY` | Repository secret | Optional. Past shops and item history. Free from [itemshop.gg](https://itemshop.gg/account#api) |
| `ACCOUNT_API_URL` | Repository variable | Optional. Turns on sign-in. See [accounts/README.md](accounts/README.md) |
| `CAREER_API_URL` | Repository variable | Optional. The career cache Worker |

## Career data

Read [docs/CAREER_DATA.md](docs/CAREER_DATA.md) for what the source supports, how caching works, and what is not possible.

## Patch data

Read [docs/PATCH_DATA.md](docs/PATCH_DATA.md) for the sources, how lines are classified, how to review a patch, and what is not stored.

## Player data

Read [docs/PLAYER_DATA.md](docs/PLAYER_DATA.md) for the source, how readings are stored, what each statistic needs, and what the numbers don't mean.

## Cosmetics data

Read [docs/COSMETICS_DATA.md](docs/COSMETICS_DATA.md) for the sources and their conditions, how data is stored, how to import and correct it, and what it can't tell you.

## Legal

Unofficial fan project, not affiliated with or endorsed by Blizzard Entertainment. Overwatch, hero names and artwork are © Blizzard Entertainment. Player counts come from the Steam Web API and are provided as is, and this project is not affiliated with or endorsed by Valve or Steam. Shop data is from [itemshop.gg](https://itemshop.gg/overwatch). Cosmetics data derived from the [Overwatch Wiki](https://overwatch.wiki/) is under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), so it can't be used commercially. Fonts are Sofia Sans under the SIL Open Font License (`public/fonts/OFL.txt`).
