# OW2 Hero Selector

A fan-made Overwatch companion with three features:

- **Random hero selector:** roll for 1 to 5 players with no duplicates on a team. Filter by role, lock each player's role, exclude heroes, run no-repeat cycles, and watch the reels land on your picks.
- **Career dashboard:** search public player profiles and browse heroes, roles, ranks and win rates.
- **Patch notes and balance tracker:** see who was buffed or nerfed, filter every change, open a hero's history, and compare patches. Every value links back to Blizzard's published notes.

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
| `npm test` | Run the logic, patch, worker and UI tests, plus a build |
| `npm run check:roster` | Compare the hero list with the live API and check image files |
| `npm run sync:patches` | Read Blizzard's latest patch notes into `public/data/patches` |
| `npm run verify:patches` | Compare every stored value against Blizzard's pages again |
| `npm run check:patches` | Check the stored patch data, offline |

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
  styles/               Design tokens and page styles
public/heroes/          Self-hosted hero images
public/data/patches/    Imported patch data, one JSON file per patch
scripts/patches/        Patch import command, season list, ability names, reviews
worker/                 Optional Cloudflare Worker cache
docs/CAREER_DATA.md     Career data source facts and known limitations
docs/PATCH_DATA.md      Patch data sources, method and known limitations
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

## Career data

Read [docs/CAREER_DATA.md](docs/CAREER_DATA.md) for what the source supports, how caching works, and what is not possible.

## Patch data

Read [docs/PATCH_DATA.md](docs/PATCH_DATA.md) for the sources, how lines are classified, how to review a patch, and what is not stored.

## Legal

Unofficial fan project, not affiliated with or endorsed by Blizzard Entertainment. Overwatch, hero names and artwork are © Blizzard Entertainment. Fonts are Sofia Sans under the SIL Open Font License (`public/fonts/OFL.txt`).
