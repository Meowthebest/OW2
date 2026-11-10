// Tests Guess the Pro: its rules, the daily answer, results, and reading a Liquipedia export. Run with: npm run test:pro
// Players and teams below are made up for the tests. The real list comes from Liquipedia and is checked at the end.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { buildProData, nationalityFrom, readTeamPage, regionFrom, roleFrom } from './esports/liquipedia.mjs';

const require = createRequire(import.meta.url);
const work = mkdtempSync(path.join(tmpdir(), 'ow2-pro-test-'));
const outfile = path.join(work, 'core.cjs');
await build({ entryPoints: ['src/features/pro/core.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
const core = require(outfile);

let passed = 0;
const failures = [];
async function test(name, run) {
  try {
    await run();
    passed += 1;
  } catch (error) {
    failures.push(`${name}\n    ${error.message}`);
  }
}

const TEAMS = [
  { id: 'alpha', name: 'Alpha Esports', region: 'kr', page: null },
  { id: 'bravo', name: 'Bravo Gaming', region: 'kr', page: null },
  { id: 'cobalt', name: 'Cobalt', region: 'na', page: null },
];
const player = (id, team, nationality, role, specialty, joined) => ({ id, name: id[0].toUpperCase() + id.slice(1), team, nationality, role, specialty, joined, page: null });
const PLAYERS = [
  player('ace', 'alpha', 'KR', 'damage', 'hitscan', 2025),
  player('bolt', 'alpha', 'KR', 'damage', 'projectile', 2024),
  player('clay', 'alpha', 'KR', 'tank', null, 2026),
  player('dune', 'bravo', 'JP', 'support', 'main-support', 2023),
  player('echo', 'bravo', 'KR', 'support', 'flex-support', 2026),
  player('fern', 'bravo', 'CN', 'damage', 'hitscan', 2025),
  player('gale', 'cobalt', 'US', 'tank', null, 2024),
  player('hale', 'cobalt', 'CA', 'damage', 'projectile', 2026),
  player('iris', 'cobalt', 'GB', 'support', 'flex-support', 2025),
  player('jade', 'cobalt', 'US', 'support', 'main-support', 2022),
];
const DATA = { schema: 1, season: '2026', exportedAt: '2026-11-10T00:00:00Z', teams: TEAMS, players: PLAYERS };
const teamMap = new Map(TEAMS.map((team) => [team.id, team]));
const byId = (id) => PLAYERS.find((item) => item.id === id);
const statuses = (guess, answer) => Object.fromEntries(core.compareGuess(byId(guess), byId(answer), teamMap, core.cluesFor(DATA)).map((clue) => [clue.key, clue.status]));

await test('every clue shows match, close or no match, for the right reason', () => {
  assert.deepEqual(core.cluesFor(DATA), ['team', 'region', 'nationality', 'role', 'specialty', 'joined']);
  assert.deepEqual(statuses('ace', 'ace'), { team: 'match', region: 'match', nationality: 'match', role: 'match', specialty: 'match', joined: 'match' });
  // Same team, same country, same role with a different specialty, a year apart.
  assert.deepEqual(statuses('bolt', 'ace'), { team: 'match', region: 'match', nationality: 'match', role: 'match', specialty: 'close', joined: 'close' });
  // Another Korean team, a Japanese player is close to Korea, a different role is a miss for both role and specialty.
  assert.deepEqual(statuses('dune', 'ace'), { team: 'miss', region: 'match', nationality: 'close', role: 'miss', specialty: 'miss', joined: 'miss' });
  assert.deepEqual(statuses('iris', 'ace'), { team: 'miss', region: 'miss', nationality: 'miss', role: 'miss', specialty: 'miss', joined: 'match' });
  const joined = core.compareGuess(byId('jade'), byId('ace'), teamMap, ['joined'])[0];
  assert.deepEqual(joined, { key: 'joined', status: 'miss', value: '2022', hint: 'later' }, 'the answer joined later');
  assert.equal(core.compareGuess(byId('clay'), byId('ace'), teamMap, ['joined'])[0].hint, 'earlier');
});

await test('clues with too little data are left out rather than shown half empty', () => {
  const sparse = { players: PLAYERS.map((item, index) => ({ ...item, specialty: index < 3 ? item.specialty : null })) };
  assert.ok(!core.cluesFor(sparse).includes('specialty'));
  assert.ok(core.cluesFor(sparse).includes('joined'));
});

await test('everyone gets the same answer on a day, and nobody repeats until all have had a turn', () => {
  assert.equal(core.puzzleNumber(core.FIRST_DAY), 1);
  assert.equal(core.puzzleNumber('2026-11-20'), 11);
  assert.equal(core.answerFor('2026-11-15', PLAYERS).id, core.answerFor('2026-11-15', [...PLAYERS].reverse()).id, 'the order of the list doesn\'t matter');
  const run = Array.from({ length: PLAYERS.length }, (_, index) => core.answerFor(core.addDays(core.FIRST_DAY, index), PLAYERS).id);
  assert.equal(new Set(run).size, PLAYERS.length, 'one full round with no repeats');
  assert.equal(core.answerFor(core.addDays(core.FIRST_DAY, PLAYERS.length), PLAYERS).id, run[0], 'then it starts over');
  assert.equal(core.answerFor('2026-11-15', []), null);
});

await test('the day turns over at the visitor\'s own midnight', () => {
  const late = new Date(2026, 10, 15, 23, 59, 30).getTime();
  assert.equal(core.localDay(late), '2026-11-15');
  assert.equal(core.localDay(late + 60000), '2026-11-16');
  assert.equal(core.untilNextDay(late), 30000);
});

await test('a shared result shows the colours and the score, and never a name', () => {
  const rows = [core.compareGuess(byId('dune'), byId('ace'), teamMap, core.cluesFor(DATA)), core.compareGuess(byId('ace'), byId('ace'), teamMap, core.cluesFor(DATA))];
  const text = core.shareText({ day: '2026-11-12', rows, won: true });
  assert.equal(text, 'Guess the Pro #3 2/8\n⬛🟩🟨⬛⬛⬛\n🟩🟩🟩🟩🟩🟩');
  assert.ok(!/ace|dune|alpha/i.test(text));
  assert.match(core.shareText({ day: '2026-11-12', rows, won: false }), /X\/8/);
  assert.match(core.shareText({ day: '2026-11-12', rows, won: true, practice: true }), /^Guess the Pro \(practice\) 2\/8/);
});

await test('results count once a day, and a streak needs days in a row', () => {
  let stats = core.emptyStats();
  stats = core.recordResult(stats, '2026-11-10', true, 3);
  stats = core.recordResult(stats, '2026-11-10', true, 1);
  assert.deepEqual([stats.played, stats.wins, stats.streak, stats.spread[2], stats.spread[0]], [1, 1, 1, 1, 0], 'the second result that day is ignored');
  stats = core.recordResult(stats, '2026-11-11', true, 5);
  assert.deepEqual([stats.streak, stats.best], [2, 2]);
  stats = core.recordResult(stats, '2026-11-13', true, 2);
  assert.equal(stats.streak, 1, 'a missed day starts a new streak');
  stats = core.recordResult(stats, '2026-11-14', false, 8);
  assert.deepEqual([stats.played, stats.wins, stats.streak, stats.best], [4, 3, 0, 2]);
});

await test('a list that would break the game is refused, with the reason', () => {
  assert.deepEqual(core.checkProData(DATA), []);
  const bad = {
    ...DATA,
    teams: [...TEAMS, { id: 'empty', name: 'Empty', region: 'mars', page: null }],
    players: [...PLAYERS, { ...byId('ace'), id: 'ace' }, { ...byId('bolt'), id: 'bolt-2', name: 'BOLT' }, { ...byId('clay'), id: 'x', team: 'nobody', role: 'sniper', nationality: 'Korea', joined: 1999 }],
  };
  const problems = core.checkProData(bad).join('\n');
  for (const pattern of [/ace: the id is used twice/, /can't be told apart by name/, /unknown team nobody/, /unknown role sniper/, /two-letter code/, /joined should be a year/, /unknown region mars/, /empty: has no players/]) assert.match(problems, pattern);
  assert.match(core.checkProData({ ...DATA, players: PLAYERS.slice(0, 3) }).join(' '), /too few/);
});

await test('flex players and team logos are part of a good list', () => {
  const flex = { ...DATA, teams: TEAMS.map((team, index) => ({ ...team, logo: index === 0 ? 'data/esports/logos/alpha.png' : null })), players: [...PLAYERS, { ...byId('ace'), id: 'kite', name: 'Kite', role: 'flex', specialty: null }] };
  assert.deepEqual(core.checkProData(flex), []);
  assert.equal(core.compareGuess(byId('ace'), flex.players.at(-1), teamMap, ['role'])[0].status, 'miss', 'flex is its own role');
  assert.match(core.checkProData({ ...flex, teams: [{ ...TEAMS[0], logo: 'https://elsewhere.test/logo.png' }, ...TEAMS.slice(1)] }).join(' '), /logo should be a file in data\/esports\/logos/);
  assert.equal(core.teamInitials('Team Risk'), 'TR');
  assert.equal(core.teamInitials('SeijiKING'), 'SE');
  assert.equal(core.teamInitials('The Kafe'), 'KA');
});

await test('names are matched however they\'re typed', () => {
  assert.equal(core.foldName('Próper'), core.foldName('PROPER'));
  assert.equal(core.foldName('Lip!'), 'lip');
  assert.equal(core.countryName('KR'), 'South Korea');
  assert.equal(core.countryName(null), 'Unknown');
  assert.equal(core.countryArea('jp'), 'east-asia');
});

// Reading Liquipedia exports. The markup copies the shape of Liquipedia's team pages, with made-up people.
const exportFile = (pages, sitename = 'Liquipedia') => `<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/">
<siteinfo><sitename>${sitename}</sitename></siteinfo>
${pages.map(([title, text, timestamp = '2026-11-09T12:00:00Z']) => `<page><title>${title}</title><revision><timestamp>${timestamp}</timestamp><text xml:space="preserve">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text></revision></page>`).join('\n')}
</mediawiki>`;

const ALPHA = `{{Infobox team
|name=Alpha Esports
|location=South Korea
|region=Korea
}}
==Player Roster==
===Active===
{{SquadStart}}
{{SquadPlayer|id=Ace|flag=kr|link=Ace (Korean player)|name=Made Up|role=Hitscan DPS|joindate=2025-01-14}}
{{SquadPlayer|id=Bolt|flag=kr|name=Made Up|role=dps|joindate=2024-06-01}}
{{SquadPlayer|id=Clay|flag=kr|name=Made Up|role=tank|joindate=2026-02-03}}
{{SquadPlayer|id=Dune|flag=jp|name=Made Up|role=Main Support|joindate=2023-11-30}}
{{SquadPlayer|id=Echo|flag=kr|name=Made Up|role=Flex Support|joindate=2026-01-05}}
{{SquadEnd}}
===Organization===
{{SquadStart|type=staff}}
{{SquadPlayer|id=Coachy|flag=kr|position=Head Coach|joindate=2025-01-01}}
{{SquadEnd}}
===Former===
{{SquadStart|type=former}}
{{SquadPlayer|id=Gone|flag=kr|role=dps|joindate=2023-01-01|leavedate=2024-12-01}}
{{SquadEnd}}`;

const COBALT = `{{Infobox team
|name=Cobalt
|location=United States
|region=
}}
==Player Roster==
{{ActiveSquad|
{{SquadPlayer|id=Gale|flag=us|role=tank|joindate=2024-03-01}}
{{SquadPlayer|id=Hale|flag=ca|role=Projectile|joindate=2026-01-10}}
{{SquadPlayer|id=Iris|flag=uk|role=support|joindate=2025-05-05}}
{{SquadPlayer|id=Jade|flag=us|role=Support|joindate=2022-09-09}}
{{SquadPlayer|id=Kite|flag=us|role=DPS|joindate=2025-08-08}}
{{SquadPlayer|id=Lark|flag=mx|role=DPS|joindate=2026-04-04|leavedate=2026-10-01}}
}}`;

await test('a team page gives its active players, with role, specialty, flag and year, and nobody else', () => {
  const team = readTeamPage({ title: 'Alpha_Esports', text: ALPHA, timestamp: null });
  assert.equal(team.name, 'Alpha Esports');
  assert.equal(team.region, 'kr');
  assert.deepEqual(team.players.map((item) => item.name), ['Ace', 'Bolt', 'Clay', 'Dune', 'Echo'], 'no coach, no former player');
  assert.deepEqual(team.players[0], { name: 'Ace', nationality: 'KR', role: 'damage', specialty: 'hitscan', joined: 2025, page: 'https://liquipedia.net/overwatch/Ace_(Korean_player)' });
  assert.deepEqual([team.players[3].role, team.players[3].specialty], ['support', 'main-support']);
  assert.deepEqual([team.players[4].specialty, team.players[2].specialty], ['flex-support', null]);
  const cobalt = readTeamPage({ title: 'Cobalt', text: COBALT, timestamp: null });
  assert.deepEqual(cobalt.players.map((item) => item.name), ['Gale', 'Hale', 'Iris', 'Jade', 'Kite'], 'a player with a leave date is gone');
  assert.equal(cobalt.players[2].nationality, 'GB', 'Liquipedia\'s "uk" flag is Great Britain');
});

await test('an export becomes a checked list, with regions from teams.json when a page has none', () => {
  const xml = exportFile([['Alpha Esports', ALPHA], ['Cobalt', COBALT, '2026-11-10T08:00:00Z'], ['Empty Team', '{{Infobox team|name=Empty Team|region=Korea}}\nNo roster yet.']]);
  const { data, notes } = buildProData([xml], { regions: { Cobalt: 'na' } });
  assert.deepEqual(data.teams.map((team) => [team.id, team.region]), [['alpha-esports', 'kr'], ['cobalt', 'na']]);
  assert.equal(data.players.length, 10);
  assert.equal(data.exportedAt, '2026-11-10T08:00:00Z', 'the newest page');
  assert.ok(notes.some((note) => /Empty Team: no active players/.test(note)));
  assert.deepEqual(core.checkProData(data), []);
  const noRegion = buildProData([xml]);
  assert.ok(noRegion.notes.some((note) => /Cobalt: no region/.test(note)));
  assert.throws(() => buildProData([exportFile([['A', ALPHA]], 'Overwatch Wiki')]), /not Liquipedia/);
  assert.throws(() => buildProData(['<html>not an export</html>']), /not a Special:Export file/);
});

await test('roles, flags and regions are read from Liquipedia\'s wording', () => {
  assert.deepEqual(roleFrom('Head Coach'), null);
  assert.deepEqual(roleFrom('Flex DPS'), { role: 'damage', specialty: 'flex' });
  assert.deepEqual(roleFrom('main_tank'), { role: 'tank', specialty: null });
  assert.deepEqual(roleFrom('Flex'), { role: 'flex', specialty: null });
  assert.deepEqual(roleFrom('Flex Support'), { role: 'support', specialty: 'flex-support' });
  assert.equal(nationalityFrom('england'), 'GB');
  assert.equal(nationalityFrom('XX1'), null);
  assert.equal(regionFrom('North America'), 'na');
  assert.equal(regionFrom('EMEA'), 'emea');
  assert.equal(regionFrom(''), null);
});

// The real list
const REAL = 'public/data/esports/owcs-players.json';
await test('the published list passes the game\'s checks', () => {
  if (!existsSync(REAL)) return;
  const data = JSON.parse(readFileSync(REAL, 'utf8'));
  assert.deepEqual(core.checkProData(data), []);
  assert.ok(data.players.every((item) => item.page === null || item.page.startsWith('https://liquipedia.net/overwatch/')));
  for (const team of data.teams) {
    if (team.logo) assert.ok(existsSync(path.join('public', team.logo)), `${team.id}: its logo file is missing`);
    assert.ok(team.page?.startsWith('https://liquipedia.net/overwatch/'), `${team.id} links to where its roster came from`);
  }
});

rmSync(work, { recursive: true, force: true });
console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(failures.length > 0 ? 1 : 0);
