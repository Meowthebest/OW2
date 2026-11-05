# Cosmetics data

Where the cosmetics, shop, bundles, loot pools, mythics, Battle Passes, Twitch Drops and hero rates come from, how they're stored, and what they can't tell you.

Nothing on these pages is made up. If no source gives a value, the page says so or leaves it out.

## Sources

| Source | Used for | How it's read | Conditions |
| --- | --- | --- | --- |
| [itemshop.gg API](https://itemshop.gg/developers) | The live shop, bundles and their contents, prices, product IDs, shop history | Automatically, every 15 minutes. Free key needed for past shops | Show "Data from itemshop.gg" with a link wherever the data appears. Don't sell the data or present it as your own. Game art is shown only to identify items |
| [Overwatch Wiki](https://overwatch.wiki/) | The wider catalogue: hero cosmetics, charms, souvenirs, icons, name cards, titles, mythics | By hand. A person exports it and `import-wiki` reads the file, offline | Text is [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/): credit it, no commercial use, share derived data alike. Its [terms](https://weirdgloop.org/terms/) don't allow automated access without consent, so no script here ever contacts it |
| [Blizzard's forum announcements](https://us.forums.blizzard.com/en/overwatch/c/announcements/5) | Twitch Drops campaigns, loot box rules | By hand, into `data/cosmetics/curated/` | Each record links to its post |
| [OverFast API](https://overfast-api.tekrop.fr/) | Pick, win and ban rates, which it reads from [Blizzard's hero statistics](https://overwatch.blizzard.com/en-us/rates/) | Directly from the visitor's browser, with the same filters as Blizzard's page | Community run. Copies are kept for up to an hour |

[OverHub](https://overhub.gg/) was a design reference only. No code, data, private endpoints or images come from it.

### Images

No cosmetic art is stored in this project.

- **Blizzard's art.** Images from the shop data load from Blizzard's own servers. Originals can be 800 KB each, so pages ask [wsrv.nl](https://wsrv.nl/), a free resizing service, for a smaller copy. If that fails, the original loads, and if that fails, a placeholder shows. That service keeps resized copies in its cache and sees visitors' IP addresses, as any image host does. To stop using it, set `RESIZER` handling in `src/features/cosmetics/components/media.tsx` to return the original.
- **The wiki's images are off.** A cosmetic known only from the wiki shows a placeholder with its type icon. To load them from the wiki, add `{ "wikiImages": true }` to `data/cosmetics/config.json`. Nothing is copied, but visitors' browsers would then fetch images from the wiki, so it's worth asking the wiki's staff first. Blizzard's art on the wiki isn't the wiki's to license.

## How it's stored

There's no database server. Sources are plain files in git, so every change has a history and can be undone.

```
data/cosmetics/
  shop/
    rotations/YYYY-MM.jsonl   One line per shop: what was listed and at what price
    items.json                Each item once: name, type, rarity, image, contents
    stays.json                Each item's time in the shop, from itemshop.gg (needs a key)
    state.json                Last fingerprint and ETag
  wiki/                       Normalized wiki import (CC BY-NC-SA 3.0, see LICENSE.md there)
  curated/                    Records entered by hand, each with its source
    twitch-drops.json
    loot-pools.json
    seasons.json              Optional additions to the season list
  corrections.json            Admin fixes, applied last, so they survive the next import
  config.json                 Optional settings
  log.jsonl                   Import log
```

`node scripts/cosmetics/cli.mjs build` joins all of this into the files the site reads, in `public/data/cosmetics/`. That folder is built, not stored in git. The build runs as part of `npm run dev` and `npm run build`. It uses no network and gives the same result for the same input.

| Built file | Holds | Loaded |
| --- | --- | --- |
| `meta.json` | Counts, filter values, source status | On any page in this section |
| `catalog.json` | One row per cosmetic: what search, filters and cards need | Only on pages that list cosmetics |
| `items/NN.json` | Full records, split into 64 files by id | One file for each cosmetic opened |
| `bundles.json`, `shop.json`, `rotations/*`, `battle-passes/*`, `mythics.json`, `twitch-drops.json`, `loot-pools.json`, `stats.json` | One page's data each | Only on that page |

The site is static, so there's no server-side paging. The equivalent here is that nothing in this section loads until someone opens it, a detail page loads 1/64 of the full records, filtering runs on a compact index, and only 48 cards render at a time. If the catalogue grows far past 20,000 rows, split `catalog.json` by type.

### The model

- **Cosmetics** have one permanent id built from type, hero and name, such as `skin.widowmaker.eve` or `weapon-charm.double-dice`. Sources join on it, so a skin from the wiki and the same skin from the shop are one record, with both sources listed. Links and saved collections depend on these ids. If a name changes, add it to `rename` in `corrections.json`.
- **Bundles**, **loot pools**, **shop rotations**, **Battle Pass rewards** and **Twitch rewards** refer to cosmetics by id. One cosmetic can be in any number of each, and is never copied.
- **Stays** are a cosmetic's periods in the shop, with price, section and bundle. Stays from itemshop.gg are used where they exist. Otherwise they come from the recorded shops.
- **Sources** are on every record, with the date they were last checked.

## Shop recording

`.github/workflows/sync-shop.yml` runs every 15 minutes, started by the timer in `timer/`.

1. It reads `/rotations`, the cheap check. If the Overwatch fingerprint hasn't moved, it stops there and nothing is committed.
2. Otherwise it reads the shop with its ETag, checks the answer, and stores a new line if what's on sale changed.
3. It commits under `data/cosmetics/shop`, and starts a deploy.

A failed, damaged or stale answer changes nothing, so the site keeps its last good copy. `429` waits for `Retry-After`. Blank values never replace known ones, and an item that leaves the shop stays in `items.json`.

The Shop page also asks itemshop.gg directly, which its documentation allows from a web page, so it can be newer than the last recording. If that fails it shows the recorded shop and says so. Countdowns only use end times from the source, because sections and items end at different times.

### Past shops need a key

Past shops and item history need a free key.

1. Sign in with Discord at [itemshop.gg/account#api](https://itemshop.gg/account#api) and make a key. Describe the project truthfully.
2. Add it as a repository secret named `ITEMSHOP_API_KEY`, under **Settings → Secrets and variables → Actions**.
3. Run **Actions → Record the shop → Run workflow** with `backfill`. It only adds days it doesn't have, so it's safe to repeat.

Without a key, history starts from the first recording, and pages say so.

## Importing the wiki

The wiki's terms don't allow automated access without consent, so this is done by a person in their own browser. It takes about two minutes.

1. Build the export link from the current roster, and open it in your browser:

   ```bash
   node scripts/cosmetics/cli.mjs wiki-link
   ```

   The link opens the wiki's own [Special:Export](https://overwatch.wiki/w/Special:Export) page with the right pages filled in, and downloads one XML file.
2. Import that file, then rebuild:

   ```bash
   node scripts/cosmetics/cli.mjs import-wiki path/to/file.xml
   ```

   ```bash
   node scripts/cosmetics/cli.mjs build
   ```

3. Commit `data/cosmetics/wiki`.

An export with fewer than 500 cosmetics is refused and changes nothing, so a partial file can't shrink the catalogue. Repeat this after a new season or event. The catalogue is only as current as the last export, and the page credits show the date.

If the wiki's staff give consent, an automated run could replace step 1. Until then, nothing here contacts the wiki.

## Admin tools

There's no admin web page. Admin access is write access to the repository.

| Task | How |
| --- | --- |
| Sync the shop now | **Actions → Record the shop → Run workflow** |
| Re-read every item's history | The same workflow, with `stays` |
| Add or fix a Twitch campaign or a loot pool | Edit `data/cosmetics/curated/*.json`. Each record needs a source, or the build stops |
| Rename a cosmetic | `corrections.json`: `"rename": { "old.id": "new.id" }` |
| Fix a field | `corrections.json`: `"set": { "skin.ana.citrine": { "rarity": "rare" } }` |
| Hide a bad record | `corrections.json`: `"hide": ["skin.ana.wrong"]` |
| Check everything, offline | `npm run check:cosmetics` |
| See the import log | `node scripts/cosmetics/cli.mjs log` |
| Roll back | `git revert` the commit. Everything built comes from these files |

## Accounts

The site had no accounts, so tracking starts in the browser, with export and import. The optional Worker in [`accounts/`](../accounts/README.md) adds Discord sign-in and keeps tracking on an account. It stores no passwords and no email.

Comments and reactions aren't built. The brief made them depend on existing accounts, and they'd also need moderation, reporting and spam tools before going live.

## What this can't tell you

- **Ownership.** All marks are made by hand. Nothing reads a game account, because Blizzard offers no way to.
- **Twitch progress.** "Claimed" marks are reminders. Twitch offers no way to read another site's visitors' watch time without their sign-in and a registered Drops integration.
- **Your Just For You offers.** Only the game shows these.
- **Loot box odds and contents.** Blizzard describes the boxes but publishes no full list. The E-Sports and Anniversary pools show related cosmetics and say so. Standard and Just For You show no list. No drop rates appear anywhere.
- **Mythic Shop stock.** No source says what's in it right now, so mythics show no current availability.
- **Mythic choices.** The wiki gives how many choices each customization group has, not what each looks like, so choices are numbered.
- **Prices.** A price is what a source last listed. Check the game before buying. Bundle savings are the store's own tag, such as "37% off", and aren't calculated here, because the feed's "regular" price isn't reliable for bundles.
- **Availability.** "Not in shop" only means it wasn't in the latest shop data. It may be available another way.
- **Newest and oldest.** Order comes from the season or first shop sighting, then the product id, so it's rough within a season. Items with neither go last in both directions.
- **Battle Pass tiers.** Rewards appear only where the wiki export lists them, and old rewards aren't always obtainable now.
- **OWCS Twitch campaigns.** Blizzard's forum doesn't announce these, so the one listed is reported by esports.gg and labeled that way. Others may be missing.
