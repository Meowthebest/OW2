# OW2 Hero Selector

A fan-made Overwatch companion with two features:

- **Random hero selector:** roll for 1 to 5 players with no duplicates on a team. Filter by role, lock each player's role, exclude heroes, run no-repeat cycles, and watch the reels land on your picks.
- **Career dashboard:** search public player profiles and browse heroes, roles, ranks and win rates.

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
| `npm test` | Run the logic, worker and UI tests, plus a build |
| `npm run check:roster` | Compare the hero list with the live API and check image files |

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
  styles/               Design tokens and page styles
public/heroes/          Self-hosted hero images
worker/                 Optional Cloudflare Worker cache
docs/CAREER_DATA.md     Data source facts and known limitations
```

## Add a new hero

1. Add an entry to `src/data/heroes.ts`. The `id` must match the hero's key in the OverFast API, because career stats are matched on it.
2. Add three images: `public/heroes/portrait/<id>.webp` (256×256), `public/heroes/art/<id>.webp` (1600×760) and `public/heroes/art/<id>-900.webp` (900 wide).
3. Run `npm run check:roster`, which reports new heroes, role changes and missing images.

A missing image will not break the page. Portraits fall back to initials on a role-colored tile.

## Deployment

Pushing to `main` runs the tests, builds the site and publishes it to GitHub Pages using `.github/workflows/deploy.yml`.

Career data works immediately with no setup, because the site can call OverFast API directly. To add the persistent cache, follow [worker/README.md](worker/README.md).

## Career data

Read [docs/CAREER_DATA.md](docs/CAREER_DATA.md) for what the source supports, how caching works, and what is not possible.

## Legal

Unofficial fan project, not affiliated with or endorsed by Blizzard Entertainment. Overwatch, hero names and artwork are © Blizzard Entertainment. Fonts are Sofia Sans under the SIL Open Font License (`public/fonts/OFL.txt`).
