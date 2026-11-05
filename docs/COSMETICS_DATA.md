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
- **Pictures from the wiki load directly from it.** The wiki's staff agreed to this on November 5, 2026. Nothing is copied: visitors' browsers load the wiki's own thumbnails in a few set sizes, and Emotes and Highlight Intros show the frame the wiki makes for each video. A cosmetic whose picture can't be found shows a placeholder with its type icon. To turn this off, remove `"wikiImages": true` from `data/cosmetics/config.json`. Blizzard's art on the wiki isn't the wiki's to license, so its permission covers loading the pictures from its servers.

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

The site is static, so there's no server-side paging. The equivalent here is that nothing in this section loads until someone opens it, a detail page loads 1/64 of the full records, filtering runs on a compact index, and only 48 cards render at a time. `catalog.json` is written newest first, each sort order is worked out once in the browser, and search text is prepared while the page is idle, so a keystroke only has to filter. With about 15,600 cosmetics, the file is about 300 KB when compressed. If the catalogue grows far past 20,000 rows, split `catalog.json` by type.

### The model

- **Cosmetics** have one permanent id built from type, hero and name, such as `skin.widowmaker.eve` or `weapon-charm.double-dice`. Sources join on it, so a skin from the wiki and the same skin from the shop are one record, with both sources listed. Links and saved collections depend on these ids. If a name changes, add it to `rename` in `corrections.json`.
- **When the shop and the wiki disagree**, the build still joins them where it can be sure: a hero added to a name ("Mercy Winged Victory" is Winged Victory), a short title for a voice line ("Call me Lily" is part of the whole line), or a hero named on one side for something not tied to a hero. A bundle item with no hero takes the only hero the catalogue lists for that name that the bundle doesn't already name. An id that joined another record still leads to it. Anything less certain stays separate.
- **Bundles**, **loot pools**, **shop rotations**, **Battle Pass rewards** and **Twitch rewards** refer to cosmetics by id. One cosmetic can be in any number of each, and is never copied.
- **Stays** are a cosmetic's periods in the shop, with price, section and bundle. Stays from itemshop.gg are used where they exist. Otherwise they come from the recorded shops. A price from inside a bundle stays with the bundle, because it isn't what the one item costs.
- **Shop listings** are filed under one key by `scripts/cosmetics/reconcile.mjs`. Past shops carry no item keys, and their ids change between days and sections, so one name and hero is one item. Product numbers alone can't join them, because the store reuses them. The raw records stay in `items.json`, so a better rule can be applied later.
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

itemshop.gg's record starts on September 24, 2026, so nothing earlier is available from it, and pages say when the records begin. The first day comes from a different feed, which lists many single items that later days don't. Some of those name only a hero, not what kind of cosmetic it is. They join the catalogue only when exactly one cosmetic fits their hero, name and rarity.

## Importing the wiki

The wiki's terms don't allow automated access without consent, so this is done by a person in their own browser. It takes about two minutes.

1. Build the export links from the current roster, and open each one in your browser:

   ```bash
   node scripts/cosmetics/cli.mjs wiki-link
   ```

   Each link uses the wiki's own [Special:Export](https://overwatch.wiki/w/Special:Export) page and downloads one XML file. There's more than one because very long links get cut off on the way to a browser, which silently loses pages.
2. Import the files together, then rebuild:

   ```bash
   node scripts/cosmetics/cli.mjs import-wiki path/to/first.xml path/to/second.xml path/to/third.xml
   ```

   ```bash
   node scripts/cosmetics/cli.mjs build
   ```

3. Commit `data/cosmetics/wiki`.

An export with fewer than 500 cosmetics is refused and changes nothing, so a partial file can't shrink the catalogue. Repeat this after a new season or event. The catalogue is only as current as the last export, and the page credits show the date. `wiki/import.json` lists every page read and how many records each gave, and the pages that weren't used.

| What the import reads | Where it comes from |
| --- | --- |
| Skins, weapon skins, emotes, victory poses, highlight intros, sprays | Each hero's cosmetics tables |
| General sprays, Battle Pass and Shop sprays by season, event sprays | The tables behind the Sprays page |
| League team skins | The shared table each hero's page fills in with that hero |
| Contenders and OWCS team skins | The esports tables, named for the team, since their rows are named for the hero |
| Weapon charms, souvenirs, player icons | Picture galleries, under headings that give the season and source |
| Name cards | Tables with a group, name, picture and notes |
| Player titles | Tables by section, with the season read from the requirement |
| Mythic skins, weapons and aspects | The Mythic Skins page, with customization groups and weapon levels |
| Voice lines | The table on each hero's Quotes page |
| Battle Pass rewards | The tier tables for each season, on the Battle Pass page and the lists of previous passes |
| Season dates and titles | The season lists for each era |
| The rules for buying a past pass | The Unvaulted section of the Battle Pass page |

A Battle Pass reward gives its cosmetic a season and a line saying which tier it came from, and fills in a rarity the tables left out. Most rewards match a cosmetic by name, allowing for a letter or two, or a name shortened in the tier list. A cosmetic only a tier list names gets its own record, except for voice lines, because tier lists give them a title where the Quotes pages give the whole line. Those stay on the pass without a link.

One cosmetic listed on several pages becomes one record, with what each page knows.

The wiki's staff agreed to the site showing the wiki's pictures. That doesn't cover scripted exports, so step 1 stays by hand and the import never contacts the wiki. Ask them before automating any of this.

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
| Join two spellings of one shop listing | `corrections.json`: `"listingNames": { "Wrong Name": "Right Name" }` |
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
- **Mythic choices.** The wiki gives how many choices each customization group has, not what each looks like, so choices are numbered. Weapons list their levels, with costs and what each unlocks.
- **Pictures.** Official shop art is shown first where it exists, and the wiki's picture otherwise. Voice lines and player titles have no picture. Emotes and Highlight Intros show one frame of their video rather than the video.
- **Rarity.** It's shown only where a source states it. The wiki states one rarity for sprays, player icons, weapon charms, souvenirs and highlight intros, and gives the rest by section. It doesn't give one for name cards, player titles or voice lines, so those only have one if the shop listed them.
- **Seasons.** A season shows where a source ties a cosmetic to one, which is mostly Battle Passes and shops. Older cosmetics often have none.
- **Prices.** A price is what a source last listed. Check the game before buying. Bundle savings are the store's own tag, such as "37% off", and aren't calculated here, because the feed's "regular" price isn't reliable for bundles.
- **Heroes in bundles.** The source sometimes leaves out a bundle item's hero. It's filled in when a bundle is named after one hero or the same picture is sold elsewhere with a hero. Otherwise the item shows "Hero not stated" and isn't tracked as a cosmetic.
- **Availability.** "Not in shop" only means it wasn't in the latest shop data. It may be available another way.
- **Newest and oldest.** Order comes from the season or first shop sighting, then the product id, so it's rough within a season. Items with neither go last in both directions.
- **Battle Pass tiers.** Rewards come from the wiki's tier lists. A past pass can be bought under the rules the Battle Pass page gives, which leave some rewards out, and these are marked. Those rules are the wiki's, so check the game before buying.
- **OWCS Twitch campaigns.** Blizzard's forum doesn't announce these, so the one listed is reported by esports.gg and labeled that way. Others may be missing.
