# Esports data

Guess the Pro (`#/guess`, under the Cosmetics menu) is a daily game about the players in the 2026 Overwatch Champions Series. This is where its player list comes from, and how to refresh it.

## Source

The list comes from [Liquipedia](https://liquipedia.net/overwatch/Main_Page). Liquipedia's text is under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), so the game credits it with a link, and the published list, `public/data/esports/owcs-players.json`, is under the same license.

The current list holds the 35 teams on the participant lists of Stage 3 of the 2026 OWCS, as of November 10, 2026: [Korea](https://liquipedia.net/overwatch/Overwatch_Champions_Series/2026/Asia/Stage_3/Korea), [China](https://liquipedia.net/overwatch/Overwatch_Champions_Series/2026/China/Stage_3), [Pacific](https://liquipedia.net/overwatch/Overwatch_Champions_Series/2026/Asia/Stage_3/Pacific), [North America](https://liquipedia.net/overwatch/Overwatch_Champions_Series/2026/NA/Stage_3) and [EMEA](https://liquipedia.net/overwatch/Overwatch_Champions_Series/2026/EMEA/Stage_3). It was read from screenshots of those lists, taken by a person in their own browser. Each team links back to its list.

The team logos were cut from the same screenshots, into `public/data/esports/logos`. They belong to their teams and appear only next to a team's name, to identify it. A team that Liquipedia shows with only the Overwatch symbol has no logo of its own, so it gets its initials instead.

Liquipedia marks some players with a fourth role icon beside Damage, Tank and Support. The game calls that role Flex.

It's taken by hand, because Liquipedia's [API terms](https://liquipedia.net/api-terms-of-use) don't allow a script to read it here:

- Its MediaWiki API is for editing pages. Using it to pull data for another site isn't supported.
- Scripts may not read its web pages.
- Its `robots.txt` turns away AI agents.

A person exporting pages in their own browser is fine, and that's all this uses. No script in this project contacts Liquipedia.

For a list that updates by itself, Liquipedia offers [its data API](https://liquipedia.net/api), free on request for non-commercial public websites. With a key from them, the import could run on a schedule instead.

## What's kept

For each player: their handle, team, the team's OWCS region, nationality and role. An export can also give a specialty, the year they joined the team and a link to their page. No real names, birth dates or photos.

Only players on a team's main roster count. Coaches, staff, and former, inactive or loaned players are left out.

## Refreshing the list

Rosters change, so refresh the list when a new stage starts. There are two ways.

**From screenshots.** Take screenshots of each region's participant list with the rosters shown, as for the current list, and hand them over. Someone then updates the roster table and logos, and checks every flag at a large size before writing anything.

**From an export**, which needs no reading of flags. It takes a few minutes.

1. Open [Liquipedia's Special:Export](https://liquipedia.net/overwatch/Special:Export).
2. In the box, put each team's page name, one per line. That's the part of its address after `liquipedia.net/overwatch/`, such as `Team_Falcons`.
3. Tick **Include only the current revision**, untick **Include templates**, and click **Export**.
4. Run:

   ```bash
   npm run import:pros -- path/to/the-export.xml
   ```

   It lists anything to look at, such as a player with no nationality, and stops without writing anything if the list has a problem.
5. Commit `public/data/esports/owcs-players.json`. The next deploy publishes it.

A team's OWCS region comes from `data/esports/teams.json` when the team is listed there, and from its Liquipedia page otherwise. Add a team there when its page gives no region, or the wrong one for the OWCS. The keys are page names as exported, such as `"Team Falcons": "kr"`. Regions are `na`, `emea`, `kr`, `cn`, `jp`, `pac` and `other`.

To check the published list without changing anything:

```bash
npm run check:pros
```

## How the game works

- **One pro a day.** The answer comes from the date and the list itself, so everyone gets the same pro on the same day with no server. It changes at midnight where each visitor is. Every player comes up once before any repeats. A new list reshuffles that order.
- **Clues.** Team, region, nationality and role. With an export, also specialty and the year they joined the team, which only show when Liquipedia gave them for most players. "Close" means a nationality from the same part of the world, the same role with a different specialty, or joining a year apart.
- **Results** are saved in the visitor's browser only, along with today's guesses. Practice games use a random pro and save nothing.

## Art

The arena banner and the faceless player in the top row (`public/art/guess-the-pro/`) were made for this site with Everygen, an AI image tool. They show no real people, teams, logos or game art.

## What it can't tell you

- **Roster moves since the list was taken.** The list is as of the date the game shows.
- **Players Liquipedia doesn't list.** Substitutes count only if Liquipedia puts them on the main roster.
- **Specialty and the year joined**, for the current list. The participant lists don't show them.
