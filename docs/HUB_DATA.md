# Hub data

The Hub is the row of tabs on the Events, Twitch Drops, Battle Passes, Mythics, Drives, Stats, News and Guess the Pro pages. The tabs are listed in `src/components/SectionNav.tsx`, beside the Cosmetics section's own. This page covers where the newer Hub pages get their data.

## News

The News page shows Blizzard's Overwatch articles, each with its picture, summary and date. Every card opens the article on Blizzard's site.

- **Source.** [Blizzard's news page](https://overwatch.blizzard.com/en-us/news/), plus the pages its "Load More" button reads. Blizzard's `robots.txt` allows both. Cards at the top of the list carry no summary, so a new one is read from its article page, a few per run at most.
- **When.** The **Sync hub news and hero rates** job (`.github/workflows/sync-hub.yml`) reads the list every six hours. It commits only when something changed, then starts a deploy.
- **What's kept.** `public/data/news.json`: the newest 120 articles. An article keeps its summary and picture if the list later stops showing them. Pictures must be on Blizzard's own hosts, over https, or the file fails its check.

To read it by hand:

```bash
npm run sync:news
```

## Hero rates

The Stats page's Hero Rates tab reads Blizzard's hero statistics live, through the community-run [OverFast API](https://overfast-api.tekrop.fr/). Live numbers say nothing about yesterday, so the same job keeps a copy once a day.

- **What's recorded.** Pick, win and ban rates for both inputs, both modes and all three regions, over all maps and all ranks: twelve requests a day. A day already recorded isn't read again. Narrower selections, by map or rank, stay live only.
- **Where.** `public/data/rates/<day>.json`, one file per UTC day, and `public/data/rates/index.json`, the list of days. The newest 90 days are kept.
- **What the page does with it.** Each win rate gets an arrow for how it moved since the newest earlier day on record. The **Day** menu shows any recorded day instead of the live numbers. Both appear once the selection is one the job records. Arrows need two days, so they start the day after the first record.

To record today by hand:

```bash
npm run sync:rates
```

To check both kinds of stored file:

```bash
npm run check:hub
```

## Twitch Drops

Campaigns are kept by hand in `data/cosmetics/curated/twitch-drops.json` and built with the rest of the cosmetics data. See [Cosmetics data](COSMETICS_DATA.md) for the build.

- **Esports campaigns.** [Blizzard's Overwatch Esports rewards page](https://esports.overwatch.com/en-us/rewards) lists each campaign's rewards, watch times and dates, with a picture of every reward. Copy the names exactly, and give each reward the picture's link in `image`. Those pictures come from `a.storyblok.com` and are resized on the way, as Blizzard's own are.
- **Other campaigns.** Blizzard announces these in its [forum](https://us.forums.blizzard.com/en/overwatch/c/announcements/5), without pictures. A reward with a `lookup` takes its picture from the catalog when the name matches one cosmetic. A loot box without a picture shows a box.
- **Dates.** When Blizzard gives days without times, a campaign runs from midnight to 23:59 Pacific, with a `note` saying so.
- **Picture order.** A reward's own `image` comes before the catalog's, since it's the picture the announcement shows.
- **Claim marks.** A reward's `id` is part of every visitor's claim marks, so keep it when correcting a name.

## Drives

The Drives page lists the Drives in the in-game events data: any event with "Drive" in its name, from `data/cosmetics/curated/game-events.json`. See [Adding in-game events](COSMETICS_DATA.md#adding-in-game-events).

Its pictures of Signatures and its explanations come from two Blizzard articles, linked on the page:

- [Driven To Victory! – Introducing Competitive Drives](https://overwatch.blizzard.com/en-us/news/24146089/driven-to-victory-introducing-competitive-drives/), from 2024. It shows the first Signatures and explains checkpoints and the numbers.
- [Reign of Talon – S5 Midcycle Sets Up the Showdown](https://overwatch.blizzard.com/en-us/news/24303010/reign-of-talon-s5-midcycle-sets-up-the-showdown/). It shows the December 2026 Signature and explains equipping earlier Signatures and Player Card Frames.

Blizzard hasn't published pictures of the other seasons' Signatures or Frames. The Overwatch Wiki has them, and its staff allowed this site to load the wiki's pictures, but its pages may only be exported by hand. See [Importing the wiki](COSMETICS_DATA.md#importing-the-wiki).
