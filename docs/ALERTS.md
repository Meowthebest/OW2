# Alerts

Most of the site updates itself. A job watches for the parts that don't, and for automatic jobs that have stopped working, and keeps one GitHub issue open for each thing a person has to deal with.

GitHub notifies you about each new issue. Whether that's an email or only a notification on the site depends on your [notification settings](https://github.com/settings/notifications).

## What it flags

| Alert | When | What to do |
| --- | --- | --- |
| New hero to add | OverFast lists a hero the site doesn't have, or the shop labels something for one | [Add a new hero](../README.md#add-a-new-hero) |
| Hero role changed, or missing from OverFast | The site and OverFast disagree | Update `src/data/heroes.ts` |
| Blizzard post to check | A post in [Blizzard's announcements forum](https://us.forums.blizzard.com/en/overwatch/c/announcements/5) from the last 45 days mentions Drops or loot boxes in its title, and no stored record links to it | Add it to `data/cosmetics/curated/`, or close the issue if it changes nothing |
| Check Blizzard's article for events | An article on [Blizzard's news page](https://overwatch.blizzard.com/en-us/news/) from the last 60 days looks like event news by its title, and no event on the Events page cites it | [Add its events](COSMETICS_DATA.md#adding-in-game-events), or close the issue if it has none |
| Time for a wiki export | Three days after the last stored season ended, or 75 days after the last export | [Import the wiki](COSMETICS_DATA.md#importing-the-wiki) |
| Job keeps failing | Failed runs in a row: 6 for the player count, 3 for the shop, 2 for patch notes, 3 for hub news and hero rates, 1 for a site deploy | Open the linked run to see the error |
| Automatic updates have stopped | The player count hasn't run for 2 hours, the shop for 3, or patch notes or hub news for 30 | [Renew the timer's token](../timer/README.md#renew-the-token), the usual cause. Hub news runs on GitHub's own schedule, so for it, run it by hand from the Actions tab |
| Add the itemshop.gg key | `ITEMSHOP_API_KEY` isn't in the repository's secrets | [Add the key](COSMETICS_DATA.md#past-shops-need-a-key) |
| Renew the timer's token | October 1, 2027, ahead of the token's expiry | Renew it, then change the date in `scripts/alerts/checks.mjs` |
| Alerts can't read a source | OverFast, the forum or Blizzard's news page has been unreadable for three days | Often passes by itself. If not, the source may have changed |

## How the issues behave

- **One issue per thing.** A repeat of something already open doesn't open another. A new problem with the same job, after it's recovered, does.
- **They close themselves.** Once the hero is added or the job is running again, the next check closes the issue with a comment.
- **Closing one dismisses it.** Close an issue yourself and that alert doesn't come back. A Blizzard post that changes nothing is the usual case.
- **A failed check changes nothing.** If a source can't be read, issues that depend on it stay as they are.
- **A run opens five at most,** so a bug can't fill the repository. The rest open on later runs.

Issues in this repository are public, so never paste a key into one. The alerts only say whether a secret is set, never its value.

## When it runs

`.github/workflows/alerts.yml` runs after each patch sync, which the timer starts every six hours, so it needs nothing added to the timer. It also has a daily schedule as a backstop, in case the timer itself has stopped.

To run it by hand, use **Actions → Check what needs a person → Run workflow**. Tick the box to only report what it would do. To see the same report from your own computer, without changing anything:

```bash
npm run check:alerts
```

That can't see the repository's secrets, so it skips the key check.

## What it can't tell you

- **Campaigns announced elsewhere.** Twitch Drops that are only announced outside Blizzard's announcements forum, as some OWCS ones are, won't be flagged.
- **What's on the wiki.** The wiki's terms rule out scripted reads, so the job goes by what the last export said about the season. Its dates can be out if a season is extended, and new mid-season items don't raise an alert of their own.
- **Whether a post matters.** It goes by the words in a post's or article's title, so it can flag one that changes nothing, or miss one worded differently.
- **What's in an article.** It reads only the list on Blizzard's news page, never the articles, so a person adds the events. An article that drops off that list before the next run, which would take a burst of new posts, isn't seen.
- **Trouble on the timer's side.** It sees that jobs have stopped, not why. Check [timer/README.md](../timer/README.md) for the likely causes.

The forum is read once per run, from a topic list its `robots.txt` allows. Its RSS feeds are ruled out there, so they aren't used. Blizzard's news page is read once per run too, which its `robots.txt` allows.
