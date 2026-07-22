import { build } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engineBundle = '/tmp/ow2-nuzlocke-engine.cjs';
const storageBundle = '/tmp/ow2-storage-engine.cjs';
const rankBundle = '/tmp/ow2-rank-engine.cjs';

await Promise.all([
  build({ entryPoints: ['src/lib/nuzlocke.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: engineBundle, logLevel: 'silent' }),
  build({ entryPoints: ['src/lib/storage.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: storageBundle, logLevel: 'silent' }),
  build({ entryPoints: ['src/lib/rankChallenge.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: rankBundle, logLevel: 'silent' }),
]);

const {
  createNuzlockeRun,
  getEligibleHeroes,
  pickNextHero,
  recordNuzlockeResult,
  rerollNuzlockeHero,
  undoNuzlockeAction,
} = require(engineBundle);
const { DEFAULT_NUZLOCKE_RULES, migrateLegacyNormalBackup, normalizeNuzlockeStore, normalizeRankChallengeStore } = require(storageBundle);
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
  excludedHeroes: Object.keys(goalRun.heroRecords).filter((hero) => hero !== 'D.Va'),
  totalLives: 5,
  requiredWins: 5,
});
assert(onlyDva.players[0].currentHero === 'D.Va', 'A one-hero pool should select its only hero.');
assert(getEligibleHeroes(onlyDva).length === 0, 'The selected hero should not be duplicated when duplicates are disabled.');
const finalHeroLoss = recordNuzlockeResult(onlyDva, 'loss');
assert(finalHeroLoss.phase === 'completed' && finalHeroLoss.endReason === 'no-heroes', 'Losing the final eligible hero should end the run.');
const restoredFinalLoss = normalizeNuzlockeStore({ version: 1, draftRules: finalHeroLoss.rules, currentRun: finalHeroLoss, runHistory: [] });
assert(restoredFinalLoss.currentRun.heroRecords['D.Va'].lives === 0, 'An eliminated hero must stay at zero lives after refresh.');

const sharedLifeRun = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  duplicateSelections: true,
  removeRule: 'never',
  livesPerHero: 3,
  totalLives: 1,
  requiredWins: 5,
});
const noLives = recordNuzlockeResult(sharedLifeRun, 'loss');
assert(noLives.phase === 'completed' && noLives.endReason === 'no-lives', 'The run should end when its shared lives reach zero.');

const noPool = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  excludedHeroes: Object.keys(goalRun.heroRecords),
});
assert(noPool.phase === 'completed' && noPool.endReason === 'no-heroes', 'An empty configured pool should end safely.');

const manualAdvance = createNuzlockeRun({ ...DEFAULT_NUZLOCKE_RULES, autoAdvance: false, requiredWins: 5 });
const waiting = recordNuzlockeResult(manualAdvance, 'win');
assert(waiting.phase === 'active' && waiting.players[0].currentHero === null, 'Auto-advance off should wait for the user.');
const advanced = pickNextHero(waiting);
assert(advanced.players[0].currentHero, 'Next hero should be selectable after a manual advance.');

const partyRun = createNuzlockeRun({
  ...DEFAULT_NUZLOCKE_RULES,
  playerCount: 3,
  playerNames: ['Tank Cat', 'DPS Cat', 'Support Cat', 'Player 4', 'Player 5'],
  duplicateSelections: true,
  removeRule: 'never',
  livesPerHero: 2,
  requiredWins: 5,
});
const startingParty = partyRun.players.map((player) => player.currentHero);
assert(startingParty.every(Boolean) && new Set(startingParty).size === 3, 'Every party member should receive a different eligible hero.');
const partyLoss = recordNuzlockeResult(partyRun, 'loss');
assert(partyLoss.losses === 1 && partyLoss.remainingLives === partyRun.remainingLives - 1, 'A party loss should count as one match and one shared run life.');
startingParty.forEach((hero) => assert(partyLoss.heroRecords[hero].lives === 1, 'Every active party hero should lose one hero life.'));
assert(partyLoss.players.every((player) => player.currentHero), 'Auto-advance should refill the whole party.');
const partyUndo = undoNuzlockeAction(partyLoss);
assert(JSON.stringify(partyUndo.players.map((player) => player.currentHero)) === JSON.stringify(startingParty), 'Undo should restore the exact party lineup.');
const teammateHeroes = partyRun.players.slice(1).map((player) => player.currentHero);
const partyReroll = rerollNuzlockeHero(partyRun, 'reroll', partyRun.players[0].id);
assert(partyReroll.players[0].currentHero !== startingParty[0], 'Reroll should change the selected player hero.');
assert(JSON.stringify(partyReroll.players.slice(1).map((player) => player.currentHero)) === JSON.stringify(teammateHeroes), 'Reroll should preserve teammate heroes.');
const restoredParty = normalizeNuzlockeStore({ version: 1, draftRules: partyLoss.rules, currentRun: partyLoss, runHistory: [] });
assert(restoredParty.currentRun.players.length === 3 && restoredParty.currentRun.players[1].name === 'DPS Cat', 'Party size, names, and lineup should survive refresh.');
const legacySingleRun = JSON.parse(JSON.stringify(goalRun));
legacySingleRun.currentHero = legacySingleRun.players[0].currentHero;
legacySingleRun.lastHero = legacySingleRun.players[0].lastHero;
delete legacySingleRun.players;
delete legacySingleRun.rules.playerCount;
delete legacySingleRun.rules.playerNames;
const migratedSingleRun = normalizeNuzlockeStore({ version: 1, draftRules: DEFAULT_NUZLOCKE_RULES, currentRun: legacySingleRun, runHistory: [] });
assert(migratedSingleRun.currentRun.players.length === 1 && migratedSingleRun.currentRun.players[0].currentHero === goalHero, 'Existing single-player saves should migrate into the party model.');

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
  sharedLives: true,
  emptyPool: true,
  manualAdvance: true,
  multiplayerParty: true,
  legacyMigration: true,
  persistence: true,
  rankGoalAndUndo: true,
  rankLimits: true,
  placements: true,
  separateRankModes: true,
});
