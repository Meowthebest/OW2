import { build } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engineBundle = '/tmp/ow2-nuzlocke-engine.cjs';
const storageBundle = '/tmp/ow2-storage-engine.cjs';
const rankBundle = '/tmp/ow2-rank-engine.cjs';
const heroBundle = '/tmp/ow2-hero-data.cjs';

await Promise.all([
  build({ entryPoints: ['src/lib/nuzlocke.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: engineBundle, logLevel: 'silent' }),
  build({ entryPoints: ['src/lib/storage.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: storageBundle, logLevel: 'silent' }),
  build({ entryPoints: ['src/lib/rankChallenge.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: rankBundle, logLevel: 'silent' }),
  build({ entryPoints: ['src/data/heroes.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: heroBundle, logLevel: 'silent' }),
]);

const {
  createNuzlockeRun,
  getEligibleHeroes,
  getSelectableHeroes,
  chooseNuzlockeHero,
  pickNextHero,
  recordNuzlockeResult,
  rerollNuzlockeHero,
  undoNuzlockeAction,
} = require(engineBundle);
const { DEFAULT_NUZLOCKE_RULES, migrateLegacyNormalBackup, normalizeNuzlockeStore, normalizeRankChallengeStore } = require(storageBundle);
const { HERO_BY_NAME } = require(heroBundle);
const {
  DEFAULT_RANK_CHALLENGE_CONFIG,
  createRankChallenge,
  recordRankChallengeResult,
  updateRankChallengePosition,
  undoRankChallenge,
} = require(rankBundle);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const goalRun = createNuzlockeRun({ ...DEFAULT_NUZLOCKE_RULES, requiredWins: 1 });
const goalHero = goalRun.players[0].currentHero;
const completed = recordNuzlockeResult(goalRun, 'win');
assert(completed.phase === 'completed' && completed.endReason === 'goal', 'A goal win should complete the run.');
assert(completed.wins === 1, 'A goal win should be counted.');

const restored = undoNuzlockeAction(completed);
assert(restored.phase === 'active', 'Undo should reopen a just-completed run.');
assert(restored.players[0].currentHero === goalHero && restored.wins === 0, 'Undo should exactly restore the previous hero and score.');

const onlyDva = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  roles: ['Tank'],
  excludedHeroes: Object.keys(goalRun.players[0].heroRecords).filter((hero) => hero !== 'D.Va'),
  totalLives: 5,
  requiredWins: 5,
});
assert(onlyDva.players[0].currentHero === 'D.Va', 'A one-hero pool should select its only hero.');
assert(getEligibleHeroes(onlyDva).length === 0, 'The selected hero should not be duplicated when duplicates are disabled.');
const finalHeroLoss = recordNuzlockeResult(onlyDva, 'loss');
assert(finalHeroLoss.phase === 'completed' && finalHeroLoss.endReason === 'no-heroes', 'Losing the final eligible hero should end the run.');
const restoredFinalLoss = normalizeNuzlockeStore({ version: 1, draftRules: finalHeroLoss.rules, currentRun: finalHeroLoss, runHistory: [] });
assert(restoredFinalLoss.currentRun.players[0].heroRecords['D.Va'].lives === 0, 'An eliminated hero must stay at zero lives after refresh.');

const sharedLifeRun = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  duplicateSelections: true,
  removeRule: 'never',
  livesPerHero: 3,
  totalLives: 1,
  requiredWins: 5,
});
const noLives = recordNuzlockeResult(sharedLifeRun, 'loss');
assert(noLives.phase === 'completed' && noLives.endReason === 'no-lives', 'A single-player run should end when its personal lives reach zero.');

const noPool = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  excludedHeroes: Object.keys(goalRun.players[0].heroRecords),
});
assert(noPool.phase === 'completed' && noPool.endReason === 'no-heroes', 'An empty configured pool should end safely.');

const manualAdvance = createNuzlockeRun({ ...DEFAULT_NUZLOCKE_RULES, autoAdvance: false, requiredWins: 5 });
const waiting = recordNuzlockeResult(manualAdvance, 'win');
assert(waiting.phase === 'active' && waiting.players[0].currentHero === null, 'Auto-advance off should wait for the user.');
const advanced = pickNextHero(waiting);
assert(advanced.players[0].currentHero, 'Next hero should be selectable after a manual advance.');

const manuallyReusableRun = createNuzlockeRun({ ...DEFAULT_NUZLOCKE_RULES, duplicateSelections: false, requiredWins: 5 });
const previouslyUsedHero = manuallyReusableRun.players[0].currentHero;
const afterReroll = rerollNuzlockeHero(manuallyReusableRun, 'reroll');
assert(afterReroll.players[0].heroRecords[previouslyUsedHero].wins === 0 && afterReroll.players[0].heroRecords[previouslyUsedHero].selections === 1, 'The manual reuse test should start with a used non-winner.');
assert(getSelectableHeroes(afterReroll).some((hero) => hero.name === previouslyUsedHero), 'A previously used hero with lives remaining should stay manually selectable.');
const manuallyReselected = chooseNuzlockeHero(afterReroll, previouslyUsedHero);
assert(manuallyReselected.players[0].currentHero === previouslyUsedHero, 'Manual selection should allow any previously used non-eliminated hero.');

const partyRun = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  playerCount: 3,
  playerNames: ['Tank Cat', 'DPS Cat', 'Support Cat', 'Player 4', 'Player 5'],
  playerRoles: [['Damage', 'Support'], ['Tank'], ['Support'], ['Tank', 'Damage', 'Support'], ['Tank', 'Damage', 'Support']],
  duplicateSelections: true,
  removeRule: 'never',
  livesPerHero: 2,
  requiredWins: 5,
});
const startingParty = partyRun.players.map((player) => player.currentHero);
assert(startingParty.every(Boolean) && new Set(startingParty).size === 3, 'Every party member should receive a different eligible hero.');
assert(['Damage', 'Support'].includes(HERO_BY_NAME[startingParty[0]].role), 'A flex player should draw from either selected role.');
assert(HERO_BY_NAME[startingParty[1]].role === 'Tank', 'A role-locked player should only draw that role.');
assert(HERO_BY_NAME[startingParty[2]].role === 'Support', 'Each player should keep an independent role pool.');
const partyLoss = recordNuzlockeResult(partyRun, 'loss');
assert(partyLoss.losses === 1 && partyLoss.remainingLives === partyRun.remainingLives - 3, 'A party loss should count as one match and remove one personal life from each active player.');
assert(partyLoss.players.every((player) => player.remainingLives === partyRun.rules.totalLives - 1), 'Every active player should have an independent run-life counter.');
startingParty.forEach((hero, index) => assert(partyLoss.players[index].heroRecords[hero].lives === 1, 'Every active party hero should lose one life in its player profile.'));
assert(partyLoss.players.every((player) => player.currentHero), 'Auto-advance should refill the whole party.');
const partyUndo = undoNuzlockeAction(partyLoss);
assert(JSON.stringify(partyUndo.players.map((player) => player.currentHero)) === JSON.stringify(startingParty), 'Undo should restore the exact party lineup.');
const teammateHeroes = partyRun.players.slice(1).map((player) => player.currentHero);
const partyReroll = rerollNuzlockeHero(partyRun, 'reroll', partyRun.players[0].id);
assert(partyReroll.players[0].currentHero !== startingParty[0], 'Reroll should change the selected player hero.');
assert(['Damage', 'Support'].includes(HERO_BY_NAME[partyReroll.players[0].currentHero].role), 'Flex rerolls should remain inside the selected role combination.');
assert(JSON.stringify(partyReroll.players.slice(1).map((player) => player.currentHero)) === JSON.stringify(teammateHeroes), 'Reroll should preserve teammate heroes.');
const restoredParty = normalizeNuzlockeStore({ version: 1, draftRules: partyLoss.rules, currentRun: partyLoss, runHistory: [] });
assert(restoredParty.currentRun.players.length === 3 && restoredParty.currentRun.players[1].name === 'DPS Cat', 'Party size, names, and lineup should survive refresh.');
assert(restoredParty.currentRun.players.every((player) => player.remainingLives === partyRun.rules.totalLives - 1), 'Individual player lives should survive refresh.');
assert(restoredParty.currentRun.players.every((player) => Object.keys(player.heroRecords).length === Object.keys(HERO_BY_NAME).length), 'Every persisted player should retain a complete personal hero pool.');

const separateProfilesRun = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  playerCount: 2,
  playerNames: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'],
  playerRoles: [['Damage'], ['Damage'], ['Damage'], ['Damage'], ['Damage']],
  roles: ['Damage'],
  excludedHeroes: Object.keys(goalRun.players[0].heroRecords).filter((hero) => hero !== 'Pharah' && hero !== 'Tracer'),
  removeRule: 'both',
  livesPerHero: 1,
  totalLives: 3,
  requiredWins: 5,
});
assert(new Set(separateProfilesRun.players.map((player) => player.currentHero)).size === 2, 'The two-player test should start with different heroes.');
const pharahOwnerIndex = separateProfilesRun.players.findIndex((player) => player.currentHero === 'Pharah');
const otherPlayerIndex = pharahOwnerIndex === 0 ? 1 : 0;
const separateProfileLoss = recordNuzlockeResult(separateProfilesRun, 'loss');
assert(separateProfileLoss.players[pharahOwnerIndex].heroRecords.Pharah.state === 'eliminated', 'Pharah should be eliminated only for the player who lost with her.');
assert(separateProfileLoss.players[otherPlayerIndex].heroRecords.Pharah.state === 'available', 'The other player should retain an available Pharah profile.');
assert(separateProfileLoss.players[otherPlayerIndex].currentHero === 'Pharah', 'The other player should be able to receive Pharah immediately.');
const legacySharedProfileRun = JSON.parse(JSON.stringify(separateProfileLoss));
legacySharedProfileRun.heroRecords = legacySharedProfileRun.players[0].heroRecords;
legacySharedProfileRun.players.forEach((player) => delete player.heroRecords);
const migratedSharedProfileRun = normalizeNuzlockeStore({ version: 1, draftRules: legacySharedProfileRun.rules, currentRun: legacySharedProfileRun, runHistory: [] }).currentRun;
assert(migratedSharedProfileRun.players[0].heroRecords.Pharah, 'Legacy shared hero data should migrate into Player 1.');
assert(migratedSharedProfileRun.players[1].heroRecords.Pharah.state === 'available' && migratedSharedProfileRun.players[1].heroRecords.Pharah.lives === legacySharedProfileRun.rules.livesPerHero, 'Additional players should receive fresh independent pools when a shared save migrates.');

const mixedLivesRun = JSON.parse(JSON.stringify(partyRun));
mixedLivesRun.players[0].remainingLives = 1;
mixedLivesRun.players[1].remainingLives = 2;
mixedLivesRun.players[2].remainingLives = 2;
mixedLivesRun.remainingLives = 5;
const onePlayerOut = recordNuzlockeResult(mixedLivesRun, 'loss');
assert(onePlayerOut.phase === 'active' && onePlayerOut.players[0].remainingLives === 0 && !onePlayerOut.players[0].currentHero, 'A player at zero personal lives should be out of the active lineup.');
assert(onePlayerOut.players.slice(1).every((player) => player.remainingLives === 1 && player.currentHero), 'Teammates with personal lives should continue the run.');

const winnerReserveRun = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  roles: ['Tank'],
  excludedHeroes: Object.keys(goalRun.players[0].heroRecords).filter((hero) => hero !== 'D.Va'),
  removeRule: 'win',
  duplicateSelections: false,
  reuseCompletedHeroes: true,
  requiredWins: 2,
});
const reserveWin = recordNuzlockeResult(winnerReserveRun, 'win');
assert(reserveWin.phase === 'active' && reserveWin.players[0].currentHero === 'D.Va', 'A winning hero should return when no fresh hero remains.');
assert(reserveWin.players[0].heroRecords['D.Va'].state === 'available', 'A reusable winner should stay available instead of becoming completed.');
assert(reserveWin.players[0].heroRecords['D.Va'].wins === 1, 'A reusable winner should track its hero win count.');

const winnerChoiceRun = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  roles: ['Tank'],
  excludedHeroes: Object.keys(goalRun.players[0].heroRecords).filter((hero) => hero !== 'D.Va' && hero !== 'Winston' && hero !== 'Orisa'),
  removeRule: 'win',
  duplicateSelections: false,
  reuseCompletedHeroes: true,
  requiredWins: 3,
});
const firstWinner = winnerChoiceRun.players[0].currentHero;
const freshAfterWin = recordNuzlockeResult(winnerChoiceRun, 'win');
assert(freshAfterWin.players[0].currentHero !== firstWinner, 'Automatic selection should still prioritize a fresh hero.');
assert(!getEligibleHeroes(freshAfterWin).some((hero) => hero.name === firstWinner), 'The automatic pool should keep prioritizing fresh heroes.');
assert(getSelectableHeroes(freshAfterWin).some((hero) => hero.name === firstWinner), 'A winner should remain immediately available for manual selection.');
const manuallyReusedWinner = chooseNuzlockeHero(freshAfterWin, firstWinner);
assert(manuallyReusedWinner.players[0].currentHero === firstWinner, 'A winning hero should be manually selectable while fresh heroes remain.');
assert(manuallyReusedWinner.players[0].heroRecords[firstWinner].state === 'available', 'Reusing a winner should preserve its available status.');
const repeatedWinner = recordNuzlockeResult(manuallyReusedWinner, 'win');
assert(repeatedWinner.players[0].heroRecords[firstWinner].wins === 2, 'Every additional win should increment that hero\'s win count.');
const legacyCompletedWinner = JSON.parse(JSON.stringify(freshAfterWin));
legacyCompletedWinner.players[0].heroRecords[firstWinner].state = 'completed';
const migratedWinner = normalizeNuzlockeStore({ version: 1, draftRules: legacyCompletedWinner.rules, currentRun: legacyCompletedWinner, runHistory: [] });
assert(migratedWinner.currentRun.players[0].heroRecords[firstWinner].state === 'available', 'Existing completed winners should migrate back into the selectable pool.');
const legacySingleRun = JSON.parse(JSON.stringify(goalRun));
legacySingleRun.currentHero = legacySingleRun.players[0].currentHero;
legacySingleRun.lastHero = legacySingleRun.players[0].lastHero;
legacySingleRun.heroRecords = legacySingleRun.players[0].heroRecords;
delete legacySingleRun.players[0].remainingLives;
delete legacySingleRun.players;
delete legacySingleRun.rules.playerCount;
delete legacySingleRun.rules.playerNames;
delete legacySingleRun.rules.playerRoles;
const migratedSingleRun = normalizeNuzlockeStore({ version: 1, draftRules: DEFAULT_NUZLOCKE_RULES, currentRun: legacySingleRun, runHistory: [] });
assert(migratedSingleRun.currentRun.players.length === 1 && migratedSingleRun.currentRun.players[0].currentHero === goalHero, 'Existing single-player saves should migrate into the party model.');
assert(migratedSingleRun.currentRun.rules.playerRoles[0].length === 3, 'Existing saves should migrate to a flexible all-role pool.');

const legacy = migrateLegacyNormalBackup({
  version: 2,
  playerCount: 3,
  playerNames: { 1: 'A', 2: 'B', 3: 'C' },
  playerRoles: { 1: 'Tank', 2: 'Damage', 3: 'Support' },
  lineup: { 1: 'D.Va', 2: 'Tracer', 3: 'Ana' },
  disabledHeroes: { Reaper: true },
  favorites: { Mercy: true },
  completedHeroes: { 1: ['D.Va'], 2: [], 3: [] },
  matchLog: [{ id: 'm1', at: 123, result: 'W', slots: [] }],
});
assert(legacy.players[0].name === 'A' && legacy.players[1].currentHero === 'Tracer', 'Legacy player state should migrate.');
assert(legacy.excludedHeroes.includes('Reaper') && legacy.favoriteHeroes.includes('Mercy'), 'Legacy pool preferences should migrate.');
assert(legacy.matches.length === 1, 'Legacy match history should migrate.');

const roundTrip = JSON.parse(JSON.stringify(completed));
assert(roundTrip.wins === completed.wins && roundTrip.events.length === completed.events.length, 'Run state should survive JSON persistence.');

const climb = createRankChallenge('normal', {
  ...DEFAULT_RANK_CHALLENGE_CONFIG,
  startingPosition: { rank: 'Bronze', division: 5 },
  goalPosition: { rank: 'Silver', division: 5 },
  matchLimit: 5,
});
const climbWin = recordRankChallengeResult(climb, 'W', 'Tracer');
assert(climbWin.wins === 1 && climbWin.heroesUsed.includes('Tracer'), 'Rank Challenge should track results and unique heroes.');
const climbUndo = undoRankChallenge(climbWin);
assert(climbUndo.wins === 0 && climbUndo.heroesUsed.length === 0 && climbUndo.phase === 'active', 'Rank result undo should restore the exact challenge state.');
const rankGoal = updateRankChallengePosition(climbWin, { rank: 'Silver', division: 5 });
assert(rankGoal.phase === 'completed' && rankGoal.endReason === 'rank-goal', 'Updating to the goal rank should complete the challenge.');
const rankGoalUndo = undoRankChallenge(rankGoal);
assert(rankGoalUndo.phase === 'active' && rankGoalUndo.currentPosition.rank === 'Bronze', 'A completed rank goal should be undoable.');

const placementClimb = createRankChallenge('normal', {
  ...DEFAULT_RANK_CHALLENGE_CONFIG,
  startingPosition: { rank: 'Placements', division: null },
  goalPosition: { rank: 'Gold', division: 5 },
});
assert(placementClimb.currentPosition.rank === 'Placements' && placementClimb.currentPosition.division === null, 'A challenge should support an undecided placement rank.');
const placementMatch = recordRankChallengeResult(placementClimb, 'W', 'Sojourn');
assert(placementMatch.phase === 'active' && placementMatch.wins === 1, 'Placement matches should count without ending the challenge.');
const firstRank = updateRankChallengePosition(placementMatch, { rank: 'Silver', division: 5 });
assert(firstRank.phase === 'active' && firstRank.currentPosition.rank === 'Silver', 'A player should be able to enter their first assigned rank.');
const placedAtGoal = updateRankChallengePosition(firstRank, { rank: 'Gold', division: 5 });
assert(placedAtGoal.phase === 'completed' && placedAtGoal.endReason === 'rank-goal', 'Receiving a goal rank after placements should complete the challenge.');
const placementUndo = undoRankChallenge(placedAtGoal);
assert(placementUndo.phase === 'active' && placementUndo.currentPosition.rank === 'Silver', 'The first-rank update should remain undoable.');

const winTarget = createRankChallenge('nuzlocke', { ...DEFAULT_RANK_CHALLENGE_CONFIG, requiredWins: 1, matchLimit: null });
const winTargetDone = recordRankChallengeResult(winTarget, 'W', 'Ana');
assert(winTargetDone.phase === 'completed' && winTargetDone.endReason === 'required-wins', 'Optional required wins should complete the challenge.');
const matchLimit = createRankChallenge('normal', { ...DEFAULT_RANK_CHALLENGE_CONFIG, requiredWins: null, matchLimit: 1 });
const matchLimitDone = recordRankChallengeResult(matchLimit, 'L', 'D.Va');
assert(matchLimitDone.phase === 'completed' && matchLimitDone.endReason === 'match-limit', 'Optional match limits should conclude the challenge.');

const restoredChallenges = normalizeRankChallengeStore({ version: 1, normal: rankGoal, nuzlocke: winTargetDone });
assert(restoredChallenges.normal?.endReason === 'rank-goal' && restoredChallenges.nuzlocke?.endReason === 'required-wins', 'Normal and Nuzlocke Rank Challenges should persist independently.');
assert(restoredChallenges.normal?.undoSnapshot?.phase === 'active', 'Rank Challenge undo state should survive refresh.');
const restoredPlacement = normalizeRankChallengeStore({ version: 1, normal: placementMatch, nuzlocke: null });
assert(restoredPlacement.normal?.currentPosition.rank === 'Placements' && restoredPlacement.normal.currentPosition.division === null, 'Placements should survive refresh without a fake division.');

console.log('NUZLOCKE_ENGINE_TESTS_PASS', {
  goalAndUndo: true,
  finalHero: true,
  personalLifeEnd: true,
  emptyPool: true,
  manualAdvance: true,
  multiplayerParty: true,
  individualPlayerLives: true,
  independentHeroProfiles: true,
  reusableWinnerCounts: true,
  usedHeroesSelectable: true,
  recentStateRemoved: true,
  legacyMigration: true,
  persistence: true,
  rankGoalAndUndo: true,
  rankLimits: true,
  placements: true,
  separateRankModes: true,
});
