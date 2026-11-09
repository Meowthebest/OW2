// Tests patch note parsing, classification, ingestion, filters and history. Run with: npm run test:patches
// The HTML here copies the structure of Blizzard's pages, with lines made up for the tests.
// Real imported data lives in public/data/patches and is checked at the end of this file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const outdir = mkdtempSync(path.join(tmpdir(), 'ow2-patches-'));
const outfile = path.join(outdir, 'patches.cjs');

await build({
  stdin: {
    contents: [
      "export * from './src/features/patches/core/index.ts';",
      "export * from './src/features/patches/filters.ts';",
      "export * from './src/features/patches/format.ts';",
      "export * from './src/features/patches/history.ts';",
      "export * from './src/lib/router.ts';",
      "export * from './src/data/heroes.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'silent',
});

const {
  parseLine,
  classifyLine,
  statPolarity,
  statCategories,
  percentChange,
  seriesStat,
  splitBlockTitle,
  rollupHero,
  countPatch,
  parseOfficialDocument,
  normalizePatch,
  mergePatch,
  looksDamaged,
  diffPatches,
  seasonFor,
  validatePatch,
  validateIndex,
  parseFilters,
  parseDrawer,
  serializeFilters,
  selectPatches,
  latestBalancePatch,
  buildCards,
  buildSections,
  resultTotals,
  DEFAULT_FILTERS,
  formatDifference,
  formatValue,
  leanText,
  automaticSummary,
  collapseUnworded,
  buildSeries,
  cumulativeChange,
  comparePatches,
  repeatedChanges,
  parseHash,
  HEROES,
} = require(outfile);

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

// Fixtures: the page structure, not real notes.
const hash = (text) => {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) % 2147483647;
  return value.toString(16).padStart(16, '0');
};
const heroBlock = (name, { dev, general = '', abilities = [] } = {}) => `
  <div class="PatchNotesHeroUpdate">
    <div class="PatchNotesHeroUpdate-header"><h5 class="PatchNotesHeroUpdate-name">${name}</h5></div>
    <div class="PatchNotesHeroUpdate-body">
      ${dev ? `<div class="PatchNotes-dev PatchNotesHeroUpdate-dev"><p>${dev}</p></div>` : ''}
      ${general ? `<div class="PatchNotesHeroUpdate-generalUpdates">${general}</div>` : ''}
      <div class="PatchNotesHeroUpdate-abilitiesList">
        ${abilities.map(([title, lines]) => `<div class="PatchNotesAbilityUpdate"><div class="PatchNotesAbilityUpdate-text"><div class="PatchNotesAbilityUpdate-name">${title}</div><div class="PatchNotesAbilityUpdate-detailList"><ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul></div></div></div>`).join('')}
      </div>
    </div>
  </div>`;
const generic = (title, inner = '') => `<div class="PatchNotes-section PatchNotes-section-generic_update"><h4 class="PatchNotes-sectionTitle">${title}</h4>${inner}</div>`;
const heroSection = (title, blocks) => `<div class="PatchNotes-section PatchNotes-section-hero_update"><h4 class="PatchNotes-sectionTitle">${title}</h4>${blocks.join('')}</div>`;
const generalUpdate = (title, body) => `<div class="PatchNotesGeneralUpdate"><div class="PatchNotesGeneralUpdate-title">${title}</div><div class="PatchNotesGeneralUpdate-description">${body}</div></div>`;
const patchHtml = (date, title, sections) => `<div class="PatchNotes-patch PatchNotes-live"><div class="anchor" id="patch-${date}"></div><div class="PatchNotes-date">${date}</div><h3 class="PatchNotes-patchTitle">${title}</h3>${sections.join('')}</div>`;
const page = (...patches) => `<!doctype html><html><body><div class="PatchNotes">${patches.join('')}</div></body></html>`;
const parseHtml = (html) => parseOfficialDocument(new JSDOM(html).window.document);
const line = (overrides) => ({
  id: 'x/standard/hero/ability/0',
  series: null,
  heroId: 'genji',
  heroName: 'Genji',
  role: 'damage',
  scope: 'standard',
  queue: 'all',
  kind: 'ability',
  ability: 'Deflect',
  stat: 'Duration',
  categories: [],
  previous: 2,
  next: 1.5,
  changeBy: null,
  unit: 's',
  qualifier: null,
  note: null,
  percentChange: -25,
  direction: 'nerf',
  situational: false,
  classifiedBy: 'rule',
  summary: null,
  sourceHash: 'a'.repeat(16),
  ...overrides,
});
const SEASONS = [{ year: 2026, number: 1, start: '2026-02-09' }];
const CATALOG = {
  genji: { weapons: ['Shuriken'], ultimates: ['Dragonblade'], passives: ['Cyber-Agility'], minorPerks: ['Quick Blade'], majorPerks: ['Long Blade'] },
  vendetta: { weapons: ['Palatine Fang'], ultimates: ['Sundering Blade'], passives: [], minorPerks: ['Raging Storm'], majorPerks: [] },
};

// Reading single lines
await test('reads plain before and after values with their units', () => {
  const damage = parseLine('Damage increased from 22 to 24.');
  assert.deepEqual([damage.stat, damage.previous, damage.next, damage.unit, damage.verb], ['Damage', 22, 24, null, 1]);
  const cooldown = parseLine('Cooldown reduced from 9 to 7 seconds.');
  assert.deepEqual([cooldown.stat, cooldown.previous, cooldown.next, cooldown.unit, cooldown.verb], ['Cooldown', 9, 7, 's', -1]);
  assert.equal(parseLine('Cast time reduced from 1.2 to 1 second.').unit, 's');
  assert.equal(parseLine('Acceleration increased from 25 to 28 meters per second.').unit, 'm/s');
  assert.equal(parseLine('Fuel regeneration rate reduced from 25% to 20% per second.').unit, '%/s');
  assert.equal(parseLine('Starting spread reduced from 8.5 to 5.7 degrees.').unit, '°');
  assert.equal(parseLine('Weaken effect reduced from 50% to 40%.').unit, '%');
  assert.equal(parseLine('Primary Fire recovery time increased from 0.6 to 0.65').next, 0.65);
});

await test('reads the other wordings Blizzard uses for the same fact', () => {
  const first = parseLine('Lifesteal reduced to 3% (Down from 4%).');
  assert.deepEqual([first.previous, first.next, first.unit], [4, 3, '%']);
  const qualified = parseLine('Tesla Field damage reduced to 30 every 1s (Down from 40).');
  assert.deepEqual([qualified.previous, qualified.next, qualified.qualifier], [40, 30, 'every 1s']);
  const unitsBoth = parseLine('Cooldown decreased from 7 seconds to 6 seconds in 5v5.');
  assert.deepEqual([unitsBoth.previous, unitsBoth.next, unitsBoth.unit, unitsBoth.qualifier], [7, 6, 's', null]);
  const between = parseLine('Damage reduced per rocket from 40 to 30.');
  assert.deepEqual([between.stat, between.previous, between.next], ['Damage per rocket', 40, 30]);
  const verbFirst = parseLine('Reduced recovery after the ability from 0.2 to 0.1 seconds.');
  assert.deepEqual([verbFirst.stat, verbFirst.previous, verbFirst.next, verbFirst.verb], ['recovery after the ability', 0.2, 0.1, -1]);
  assert.equal(parseLine('Maximum number of active Steel Traps has been increased from 1 to 2.').stat, 'Maximum number of active Steel Traps');
});

await test('a stated difference never becomes invented before and after values', () => {
  const by = parseLine('Healing amplification reduced by 65%.');
  assert.deepEqual([by.previous, by.next, by.changeBy, by.unit], [null, null, -65, '%']);
  const added = parseLine('Added 25 Shields.');
  assert.deepEqual([added.previous, added.next, added.changeBy, added.stat], [null, null, 25, 'Shields']);
  const removed = parseLine('Removed 20% Ability Power.');
  assert.deepEqual([removed.changeBy, removed.unit, removed.stat], [-20, '%', 'Ability Power']);
  const newOnly = parseLine('Cooldown reduced to 7.5 seconds.');
  assert.deepEqual([newOnly.previous, newOnly.next, newOnly.unit], [null, 7.5, 's']);
  assert.equal(parseLine('Cast time is 0.5 seconds.').previous, null);
});

await test('lines with no numbers stay unparsed, with only a short factual label at most', () => {
  const text = parseLine('Now additionally refills ammo on use.');
  assert.deepEqual([text.stat, text.previous, text.next, text.note], [null, null, null, null]);
  assert.equal(parseLine('Removed.').note, 'Removed');
  assert.equal(parseLine('New Minor Perk.').note, 'Added');
  assert.equal(parseLine('Moved from Major to Minor.').note, 'Moved to Minor Perk');
  assert.equal(parseLine('Knockback removed.').note, 'Knockback removed');
  assert.equal(parseLine('"Fires a large projectile" is now the description.').note, null);
});

await test('6v6 and queue markers are detected and removed from the stat', () => {
  const six = parseLine('Base health increased from 450 to 500. (6v6)');
  assert.deepEqual([six.sixVsSix, six.stat, six.next], [true, 'Base health', 500]);
  assert.equal(parseLine('Base health increased from 375 to 425.').sixVsSix, false);
  const five = parseLine('(5v5) Cooldown reduced from 9 to 7 seconds.');
  assert.deepEqual([five.stat, five.sixVsSix], ['Cooldown', false]);
  assert.equal(parseLine('Damage increased from 1 to 2 (Competitive).').queue, 'competitive');
  assert.equal(parseLine('Damage increased from 1 to 2 (Quick Play).').queue, 'quickplay');
  assert.equal(parseLine('Damage increased from 1 to 2.').queue, 'all');
});

// Classification
const classify = (text) => classifyLine(parseLine(text), text);

await test('a lower number can be a buff and a higher number can be a nerf', () => {
  assert.equal(classify('Cooldown reduced from 9 to 7 seconds.'), 'buff');
  assert.equal(classify('Cast time reduced from 1.2 to 1 second.'), 'buff');
  assert.equal(classify('Starting spread reduced from 8.5 to 5.7 degrees.'), 'buff');
  assert.equal(classify('Detonation time reduced from 0.6 to 0.5 seconds.'), 'buff');
  assert.equal(classify('Time to maximum charge reduced from 0.65 to 0.575.'), 'buff');
  assert.equal(classify('Recovery increased from 0.2 to 0.3 seconds.'), 'nerf');
  assert.equal(classify('Initial swing delay increased from 0.15 to 0.2 seconds.'), 'nerf');
  assert.equal(classify('Cost increased to 12000 (Up from 10000).'), 'nerf');
  assert.equal(classify('Cost reduced to 9000 (Down from 10000).'), 'buff');
  assert.equal(classify('Number of hits required increased from 2 to 3.'), 'nerf');
  assert.equal(classify('Fuel drain rate increased from 10 to 12.'), 'nerf');
});

await test('plain stat changes follow what the stat means', () => {
  assert.equal(classify('Base health increased from 375 to 425.'), 'buff');
  assert.equal(classify('Explosion damage reduced from 90 to 60.'), 'nerf');
  assert.equal(classify('Duration reduced from 2 to 1.5 seconds.'), 'nerf');
  assert.equal(classify('Cooldown reduction increased from 1 to 2 seconds.'), 'buff');
  assert.equal(classify('Cooldown refund increased to 25% (Up from 20%).'), 'buff');
  assert.equal(classify('Attack speed reduced to 10% (Down from 15%).'), 'nerf');
  assert.equal(classify('Fuel regeneration rate reduced from 25% to 20% per second.'), 'nerf');
  assert.equal(classify('Shots until max spread reduced from 4 to 3.'), 'nerf');
  assert.equal(classify('Minimum falloff distance increased from 15 meters to 20 meters.'), 'buff');
});

await test('anything ambiguous is left as needs review instead of guessed', () => {
  assert.equal(classify('Knockback reduced from 8 to 4.'), 'needs-review');
  assert.equal(classify('Head hit volume increased from 18.5 to 20.'), 'needs-review');
  assert.equal(classify('Eliminations per increased stack increased to 3 (Up from 2).'), 'needs-review');
  assert.equal(classify('Currency from damage and healing reduced by 10%.'), 'needs-review');
  assert.equal(classify('Reduced Ultimate Cost increased from 10% to 15%.'), 'needs-review');
  assert.equal(classify('Damage increased to 50% reduced damage (Up from 60% reduced).'), 'needs-review');
  assert.equal(classify('Widgets increased from 1 to 2.'), 'needs-review');
  assert.equal(classify('Now additionally refills ammo on use.'), 'needs-review');
  assert.equal(classify('Removed.'), 'needs-review');
  assert.equal(statPolarity(null), 'unknown');
});

await test('fixes and interface changes are never counted as balance', () => {
  assert.equal(classify('Fixed a bug where a thing happened.'), 'bugfix');
  assert.equal(classify('Added a new UI element that tracks allies in range.'), 'qol');
  assert.equal(classify('Added an accessibility option for firing.'), 'qol');
  assert.equal(classify('Increased sound priority and volume of movement.'), 'qol');
  assert.equal(classify('Cooldown is now visible while active.'), 'qol');
});

await test('percent is only computed from two published values', () => {
  assert.equal(percentChange(90, 60), -33.3);
  assert.equal(percentChange(2, 1.5), -25);
  assert.equal(percentChange(375, 425), 13.3);
  assert.equal(percentChange(15, 0), -100);
  assert.equal(percentChange(0, 5), null);
  assert.equal(percentChange(null, 5), null);
  assert.equal(percentChange(5, null), null);
});

await test('differences show points for percent stats and never make up a ratio', () => {
  const diff = (fields) => formatDifference({ previous: null, next: null, unit: null, percentChange: null, changeBy: null, ...fields });
  assert.equal(diff({ previous: 90, next: 60, percentChange: -33.3 }), '−33.3%');
  assert.equal(diff({ previous: 50, next: 40, unit: '%', percentChange: -20 }), '−10 pts (−20%)');
  assert.equal(diff({ previous: 60, next: 50, unit: '%' }), '−10 pts');
  assert.equal(diff({ previous: 0, next: 5, unit: 's' }), '+5s');
  assert.equal(diff({ changeBy: -65, unit: '%' }), '−65%');
  assert.equal(diff({ next: 7 }), null);
  assert.equal(formatValue(1.5, 's'), '1.5s');
  assert.equal(formatValue(28, 'm/s'), '28 m/s');
  assert.equal(formatValue(5.7, '°'), '5.7°');
});

await test('stats are sorted into filter categories', () => {
  assert.deepEqual(statCategories('Base health', null), ['health']);
  assert.deepEqual(statCategories('Base armor', null), ['armor']);
  assert.deepEqual(statCategories('Explosion damage', 'Biotic Grenade'), ['damage']);
  assert.deepEqual(statCategories('Healing per second', null), ['healing']);
  assert.deepEqual(statCategories('Cooldown', 'Carnage'), ['cooldown']);
  assert.deepEqual(statCategories('Acceleration', 'Frenetic Flight'), ['mobility']);
  assert.deepEqual(statCategories('Speed', 'Shield Bash'), []);
  assert.deepEqual(statCategories('Speed', 'Jet Dash'), ['mobility']);
  assert.ok(!statCategories('Attack speed', 'Jet Dash').includes('mobility'));
  assert.ok(!statCategories('Damage reduction', null).includes('damage'));
});

await test('series keys line up the same stat across wordings', () => {
  assert.equal(seriesStat('Base health', null), 'health');
  assert.equal(seriesStat('Health', null), 'health');
  assert.equal(seriesStat('Deflect duration', 'Deflect'), 'duration');
  assert.equal(seriesStat('Duration', 'Deflect'), 'duration');
});

await test('block headers split perks, powers and items without breaking hyphenated names', () => {
  assert.deepEqual(splitBlockTitle('Tri-Shot'), { ability: 'Tri-Shot', kind: null });
  assert.deepEqual(splitBlockTitle('Self-Destruct'), { ability: 'Self-Destruct', kind: null });
  assert.deepEqual(splitBlockTitle('Overstrike - Major Perk'), { ability: 'Overstrike', kind: 'perk-major' });
  assert.deepEqual(splitBlockTitle('Aerial Munitions – Minor Perk'), { ability: 'Aerial Munitions', kind: 'perk-minor' });
  assert.deepEqual(splitBlockTitle('Major Thing – Major Perk (6v6)'), { ability: 'Major Thing', kind: 'perk-major' });
  assert.deepEqual(splitBlockTitle('Tesla Field – Power'), { ability: 'Tesla Field', kind: 'power' });
  assert.deepEqual(splitBlockTitle('Busan Blaster - Epic Hero Ability Item'), { ability: 'Busan Blaster', kind: 'item' });
  assert.deepEqual(splitBlockTitle('Scrap Gun – Primary Fire'), { ability: 'Scrap Gun (Primary Fire)', kind: 'weapon' });
  assert.deepEqual(splitBlockTitle('Ultimate – Vermillion Ascent'), { ability: 'Vermillion Ascent', kind: 'ultimate' });
  assert.deepEqual(splitBlockTitle('General'), { ability: null, kind: null });
  assert.deepEqual(splitBlockTitle(null), { ability: null, kind: null });
});

// Rolling lines up to a hero
await test('a hero with both buffs and nerfs is mixed, and the lean weighs situational changes less', () => {
  const sombra = rollupHero([
    line({ direction: 'nerf' }),
    line({ direction: 'nerf' }),
    line({ direction: 'buff', situational: true }),
  ]);
  assert.equal(sombra.classification, 'mixed');
  assert.equal(sombra.lean, 'nerf');
  assert.match(leanText(sombra), /^2 nerfs against 1 situational buff, so the overall result leans toward nerfs\.$/);

  const even = rollupHero([line({ direction: 'buff' }), line({ direction: 'buff' }), line({ direction: 'nerf' }), line({ direction: 'nerf' })]);
  assert.equal(even.classification, 'mixed');
  assert.equal(even.lean, null);
  assert.match(leanText(even), /no clear lean/);

  const unknown = rollupHero([line({ direction: 'buff' }), line({ direction: 'nerf' }), line({ direction: 'needs-review' })]);
  assert.match(leanText(unknown), /does not count 1 line still needing review/);
});

await test('bug fixes and interface lines never change a hero result', () => {
  assert.equal(rollupHero([line({ direction: 'nerf' }), line({ direction: 'bugfix' })]).classification, 'nerf');
  assert.equal(rollupHero([line({ direction: 'qol' })]).classification, 'neutral');
  assert.equal(rollupHero([line({ direction: 'neutral' })]).classification, 'neutral');
  assert.equal(rollupHero([line({ direction: 'bugfix' })]).classification, 'fix');
  assert.equal(rollupHero([line({ direction: 'needs-review' })]).classification, 'needs-review');
  assert.equal(rollupHero([line({ direction: 'buff' }), line({ direction: 'needs-review' })]).classification, 'buff');
});

await test('headline counts are unique heroes in standard play, with Stadium and limited modes apart', () => {
  const counts = countPatch(
    [
      line({ heroId: 'a', direction: 'buff' }),
      line({ heroId: 'a', direction: 'buff', scope: '6v6' }),
      line({ heroId: 'b', direction: 'nerf' }),
      line({ heroId: 'b', direction: 'nerf' }),
      line({ heroId: 'c', direction: 'buff' }),
      line({ heroId: 'c', direction: 'nerf' }),
      line({ heroId: 'd', direction: 'qol' }),
      line({ heroId: 'e', direction: 'bugfix', kind: 'fix' }),
      line({ heroId: 'a', direction: 'nerf', scope: 'stadium' }),
      line({ heroId: 'z', direction: 'buff', scope: 'limited' }),
    ],
    3,
  );
  assert.deepEqual(
    [counts.heroesBuffed, counts.heroesNerfed, counts.heroesMixed, counts.heroesNeutral],
    [1, 1, 1, 1],
  );
  assert.deepEqual([counts.buffs, counts.nerfs, counts.qol, counts.sixVsSix, counts.gameplayChanges], [3, 3, 1, 1, 6]);
  assert.deepEqual([counts.stadiumHeroes, counts.stadiumChanges, counts.limitedHeroes, counts.limitedChanges], [1, 1, 1, 1]);
  assert.equal(counts.bugFixes, 4);
});

// Reading whole pages
const FIXTURE = page(
  patchHtml('2026-03-10', 'Patch Notes', [
    generic('Season 9: Made Up'),
    generic('A Made Up Event', '<div class="PatchNotes-sectionDescription"><p>Words about an event.</p></div>'),
    generic('General Updates', generalUpdate('Queue Improvement', '<p>Words.</p>')),
    generic('Hero Updates'),
    heroSection('Tank', [heroBlock('Junker Queen', { dev: 'A developer comment.', general: '<ul><li>Base health increased from 375 to 425.</li><li>Base health increased from 450 to 500. (6v6)</li></ul>', abilities: [['Carnage', ['Cooldown reduced from 9 to 7 seconds.']]] })]),
    heroSection('Damage', [heroBlock('Genji', { abilities: [['Deflect', ['Duration reduced from 2 to 1.5 seconds.']], ['Dragonblade', ['Damage increased from 100 to 110.']], ['Shuriken', ['Damage increased from 25 to 27.']]], general: '<p><strong>Quick Blade - Minor Perk</strong></p><ul><li>Cooldown reduced from 5 to 4 seconds.</li></ul>' }), heroBlock('Vendetta', { abilities: [['Whirlwind Dash', ['Raging Storm perk horizontal knockback reduced from 8 to 4.']]] })]),
    heroSection('Support', [heroBlock('Sombra', { abilities: [['Hotfix', ['Duration reduced from 12 to 10 seconds.']]] }), heroBlock('Lúcio', { abilities: [['Crossfade', ['Healing increased from 10 to 12.']]] })]),
    generic('Stadium Updates'),
    heroSection('Damage', [heroBlock('Genji', { general: "<p>Wyrm's Maw – Power</p><ul><li>Swift Strike Damage per stack increased to 15% (Up from 10%).</li></ul>" })]),
    generic('Bug Fixes',
      generalUpdate('General', '<ul><li>Fixed a skin bug.</li></ul>')
      + generalUpdate('Heroes', '<p><strong>Mizuki</strong></p><ul><li>Fixed a stuck bug.</li></ul>')
      + generalUpdate('Maps', '<p><strong>Eichenwalde</strong></p><ul><li>Fixed a sightline.</li></ul>')
      + generalUpdate('Stadium', '<ul><li>Fixed a Stadium item.</li></ul>')),
  ]),
  patchHtml('2026-03-12', 'Hotfix patch', [
    generic('Hotfix Update'),
    heroSection('Hero Updates', [heroBlock('Mercy', { abilities: [['Resurrect', ['Cooldown increased from 30 to 35 seconds.']]] })]),
  ]),
  patchHtml('2026-03-13', 'Sombra notes without a hotfix', [
    generic('General Updates'),
    heroSection('Damage', [heroBlock('Sombra', { abilities: [['Hotfix', ['Cooldown reduced from 8 to 7 seconds.']]] })]),
  ]),
  patchHtml('2026-03-14', 'Limited mode', [
    generic('Community Crafted Event'),
    heroSection('Tank', [heroBlock('Reinhardt', { abilities: [['Charge', ['Now fires a rocket.']]] })]),
    generic('Support', '<p>A generic role heading must not end the limited mode.</p>'),
    heroSection('', [heroBlock('Mercy', { abilities: [['Caduceus Staff', ['Healing increased from 55 to 60.']]] })]),
  ]),
  patchHtml('2026-03-15', 'Bug fix heroes', [
    generic('Bug Fix Update'),
    generic('Bug Fixes', '<p>General words.</p>'),
    heroSection('Heroes', [heroBlock('Moira', { abilities: [['Fade', ['Now works properly.']]] })]),
  ]),
  patchHtml('2026-03-16', 'Interface', [
    generic('Hero Updates'),
    heroSection('UI Updates', [heroBlock('Ana', { abilities: [['Sleep Dart', ['Target outline adjusted.']]] })]),
  ]),
);

const parsed = parseHtml(FIXTURE);
const byDate = Object.fromEntries(parsed.map((raw) => [raw.id, raw]));
const normalized = (raw, review) => normalizePatch(raw, { hash, catalog: CATALOG, seasons: SEASONS, review }).file;

await test('finds every patch, and stable IDs come from the anchor date', () => {
  assert.deepEqual(parsed.map((raw) => raw.id), ['2026-03-10', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16']);
  assert.equal(parseHtml(page()).length, 0);
});

await test('hotfixes come from section titles, not from an ability named Hotfix', () => {
  assert.equal(byDate['2026-03-12'].isHotfix, true);
  assert.equal(byDate['2026-03-13'].isHotfix, false);
  assert.equal(byDate['2026-03-10'].isHotfix, false);
});

await test('season headings are read only from the first section', () => {
  assert.equal(byDate['2026-03-10'].seasonNumber, 9);
  assert.equal(byDate['2026-03-12'].seasonNumber, null);
});

await test('headings set the format, and Stadium stays apart from standard play', () => {
  const main = normalized(byDate['2026-03-10']);
  const scopes = (heroId) => main.changes.filter((change) => change.heroId === heroId && change.kind !== 'fix').map((change) => change.scope);
  assert.deepEqual(scopes('junker-queen'), ['standard', '6v6', 'standard']);
  assert.ok(scopes('genji').includes('standard') && scopes('genji').includes('stadium'));
  assert.equal(main.counts.stadiumChanges, 1);
  assert.equal(main.counts.stadiumHeroes, 1);
  assert.equal(main.counts.sixVsSix, 1);
});

await test('a generic role heading does not end a limited-time mode section', () => {
  const limited = normalized(byDate['2026-03-14']);
  assert.ok(limited.changes.every((change) => change.scope === 'limited'));
  assert.equal(limited.changes.find((change) => change.heroId === 'mercy').role, 'support');
  assert.equal(limited.type, 'limited');
  assert.equal(limited.counts.gameplayChanges, 0);
  assert.equal(limited.counts.limitedHeroes, 2);
});

await test('section context marks bug fixes and interface updates', () => {
  const fixes = normalized(byDate['2026-03-15']);
  assert.equal(fixes.changes[0].direction, 'bugfix');
  assert.equal(fixes.type, 'update');
  const ui = normalized(byDate['2026-03-16']);
  assert.equal(ui.changes[0].direction, 'qol');
});

await test('a section role is kept even if the roster has since moved the hero', () => {
  const moved = normalized(byDate['2026-03-13']);
  assert.equal(moved.changes[0].role, 'damage');
  const main = normalized(byDate['2026-03-10']);
  assert.equal(main.changes.find((change) => change.heroId === 'sombra').role, 'support');
});

await test('line kinds come from headers, then the ability catalog', () => {
  const main = normalized(byDate['2026-03-10']);
  const kind = (ability) => main.changes.find((change) => change.ability === ability)?.kind;
  assert.equal(kind('Dragonblade'), 'ultimate');
  assert.equal(kind('Shuriken'), 'weapon');
  assert.equal(kind('Deflect'), 'ability');
  assert.equal(kind('Quick Blade'), 'perk-minor');
  assert.equal(kind("Wyrm's Maw"), 'power');
  assert.equal(kind('Whirlwind Dash'), 'perk-minor');
  assert.equal(main.changes.find((change) => change.heroId === 'junker-queen').kind, 'base');
});

await test('hero names are normalized, and accents and casing cannot split a hero', () => {
  const main = normalized(byDate['2026-03-10']);
  const lucio = main.changes.find((change) => change.heroId === 'lucio');
  assert.equal(lucio.heroName, 'Lúcio');
  const variants = parseHtml(page(patchHtml('2026-03-20', 'T', [heroSection('Tank', [heroBlock('wrecking Ball', { abilities: [['Roll', ['Speed increased from 1 to 2.']]] }), heroBlock('Ashe (Rework)', { abilities: [['Coach Gun', ['Damage increased from 1 to 2.']]] }), heroBlock('Lucio', { abilities: [['Crossfade', ['Healing increased from 1 to 2.']]] })])])))[0];
  assert.deepEqual(variants.heroes.map((hero) => hero.heroId), ['wrecking-ball', 'ashe', 'lucio']);
});

await test('other sections keep titles, and hero bug fixes go on hero cards', () => {
  const main = normalized(byDate['2026-03-10']);
  assert.ok(main.other.some((item) => item.title === 'A Made Up Event' && item.section === 'event'));
  assert.ok(main.other.some((item) => item.title === 'Queue Improvement' && item.section === 'general'));
  assert.ok(!main.other.some((item) => /^(Hero Updates|Stadium Updates|General Updates|Bug Fixes)$/.test(item.title ?? '')));
  const fix = main.changes.find((change) => change.heroId === 'mizuki');
  assert.equal(fix.direction, 'bugfix');
  assert.equal(fix.kind, 'fix');
  assert.equal(main.counts.bugFixes, 4);
  assert.ok(main.other.some((item) => item.section === 'bugfix' && item.group === 'Stadium'));
  assert.ok(main.other.some((item) => item.section === 'bugfix' && item.title === 'Eichenwalde'));
});

await test('no source wording reaches the stored records', () => {
  const stored = JSON.stringify(normalized(byDate['2026-03-10']));
  for (const words of ['A developer comment', 'Words about an event', 'Fixed a skin bug', 'Fixed a stuck bug', 'Fixed a Stadium item', 'reduced from 9 to 7']) {
    assert.ok(!stored.includes(words), `stored: ${words}`);
  }
  const main = normalized(byDate['2026-03-10']);
  assert.equal(main.notes.find((note) => note.heroId === 'junker-queen').hasDeveloperComment, true);
  assert.equal(main.notes.find((note) => note.heroId === 'sombra').hasDeveloperComment, false);
});

await test('IDs stay the same when unrelated lines are added or a 6v6 line moves', () => {
  const before = normalized(parseHtml(page(patchHtml('2026-03-21', 'T', [heroSection('Tank', [heroBlock('Mauga', { general: '<ul><li>Base armor increased from 125 to 150.</li><li>Base armor increased from 150 to 175. (6v6)</li></ul>' })])])))[0]);
  const after = normalized(parseHtml(page(patchHtml('2026-03-21', 'T', [heroSection('Tank', [heroBlock('Reinhardt', { abilities: [['Charge', ['Damage increased from 1 to 2.']]] }), heroBlock('Mauga', { general: '<ul><li>Base armor increased from 150 to 175. (6v6)</li><li>Base armor increased from 125 to 150.</li></ul>' })])])))[0]);
  const ids = (file) => file.changes.filter((change) => change.heroId === 'mauga').map((change) => change.id).sort();
  assert.deepEqual(ids(before), ids(after));
  assert.deepEqual(ids(before), ['2026-03-21/6v6/mauga/base/0', '2026-03-21/standard/mauga/base/0']);
});

// Reviews
await test('a review applies while its source line is unchanged, and falls away when Blizzard edits it', () => {
  const raw = parseHtml(page(patchHtml('2026-03-22', 'T', [heroSection('Damage', [heroBlock('Vendetta', { abilities: [['Whirlwind Dash', ['Raging Storm perk horizontal knockback reduced from 8 to 4.']]] })])])))[0];
  const first = normalizePatch(raw, { hash, catalog: CATALOG, seasons: SEASONS }).file.changes[0];
  assert.equal(first.direction, 'needs-review');
  assert.equal(first.classifiedBy, 'none');

  const review = { patchId: raw.id, reviewedAt: '2026-03-23', changes: { [first.id]: { sourceHash: first.sourceHash, direction: 'nerf' } }, heroes: { 'vendetta|standard': { summary: 'Less knockback.', devIntent: 'Own words.' } } };
  const applied = normalizePatch(raw, { hash, catalog: CATALOG, seasons: SEASONS, review });
  assert.equal(applied.file.changes[0].direction, 'nerf');
  assert.equal(applied.file.changes[0].classifiedBy, 'review');
  assert.equal(applied.file.notes[0].devIntent, 'Own words.');
  assert.equal(applied.file.reviewedAt, '2026-03-23');
  assert.deepEqual(applied.staleReviews, []);

  const edited = parseHtml(page(patchHtml('2026-03-22', 'T', [heroSection('Damage', [heroBlock('Vendetta', { abilities: [['Whirlwind Dash', ['Raging Storm perk horizontal knockback reduced from 8 to 5.']]] })])])))[0];
  const stale = normalizePatch(edited, { hash, catalog: CATALOG, seasons: SEASONS, review });
  assert.equal(stale.file.changes[0].direction, 'needs-review');
  assert.equal(stale.file.changes[0].classifiedBy, 'none');
  assert.deepEqual(stale.staleReviews, [first.id]);
});

await test('reviews can clear a misleading percent but the checks refuse an unsupported one', () => {
  const raw = parseHtml(page(patchHtml('2026-03-24', 'T', [heroSection('Damage', [heroBlock('Genji', { abilities: [['Deflect', ['Duration reduced from 2 to 1.5 seconds.']]] })])])))[0];
  const change = normalizePatch(raw, { hash, catalog: CATALOG, seasons: SEASONS }).file.changes[0];
  const clear = normalizePatch(raw, { hash, catalog: CATALOG, seasons: SEASONS, review: { patchId: raw.id, reviewedAt: 'x', changes: { [change.id]: { sourceHash: change.sourceHash, percentChange: null } } } }).file.changes[0];
  assert.equal(clear.percentChange, null);
  const stored = { ...normalizePatch(raw, { hash: () => 'a'.repeat(16), catalog: CATALOG, seasons: SEASONS }).file, firstImportedAt: '2026-03-24T00:00:00Z', lastVerifiedAt: '2026-03-24T00:00:00Z', revisions: [] };
  assert.deepEqual(validatePatch(stored), []);
  const faked = structuredClone(stored);
  faked.changes[0].percentChange = -50;
  assert.ok(validatePatch(faked).some((problem) => /percent/.test(problem)));
  const noValues = structuredClone(stored);
  noValues.changes[0].previous = null;
  assert.ok(validatePatch(noValues).some((problem) => /percent/.test(problem)));
});

await test('checks catch bad provenance, duplicates, long text and wrong counts', () => {
  const raw = parseHtml(page(patchHtml('2026-03-25', 'T', [heroSection('Damage', [heroBlock('Genji', { abilities: [['Deflect', ['Duration reduced from 2 to 1.5 seconds.', 'Cooldown reduced from 8 to 7 seconds.']]] })])])))[0];
  const stored = { ...normalizePatch(raw, { hash: () => 'a'.repeat(16), catalog: CATALOG, seasons: SEASONS }).file, firstImportedAt: '2026-03-25T00:00:00Z', lastVerifiedAt: '2026-03-25T00:00:00Z', revisions: [] };
  const breaks = [
    (file) => { file.sourceUrl = 'https://example.com/notes'; },
    (file) => { file.changes[1].id = file.changes[0].id; },
    (file) => { file.changes[0].note = 'x'.repeat(300); },
    (file) => { file.counts.nerfs = 99; },
    (file) => { file.changes[0].sourceHash = ''; },
    (file) => { file.lastVerifiedAt = 'never'; },
  ];
  breaks.forEach((apply) => {
    const copy = structuredClone(stored);
    apply(copy);
    assert.ok(validatePatch(copy).length > 0, String(apply));
  });
  const meta = { id: stored.id, date: stored.date, contentHash: stored.contentHash };
  assert.deepEqual(validateIndex({ patches: [meta] }, [stored]), []);
  assert.ok(validateIndex({ patches: [] }, [stored]).length > 0);
  assert.ok(validateIndex({ patches: [{ ...meta, contentHash: 'other' }] }, [stored]).length > 0);
});

// Updating stored data
await test('re-importing keeps first-seen dates, and edits are logged with what changed', () => {
  const base = normalized(byDate['2026-03-12']);
  const first = mergePatch(null, base, '2026-03-12T00:00:00.000Z');
  assert.equal(first.status, 'new');
  const again = mergePatch(first.file, base, '2026-03-13T00:00:00.000Z');
  assert.equal(again.status, 'unchanged');
  assert.equal(again.file.firstImportedAt, '2026-03-12T00:00:00.000Z');
  assert.equal(again.file.lastVerifiedAt, '2026-03-13T00:00:00.000Z');
  assert.deepEqual(again.file.revisions, []);

  const edited = normalized(parseHtml(page(patchHtml('2026-03-12', 'Hotfix patch', [generic('Hotfix Update'), heroSection('Hero Updates', [heroBlock('Mercy', { abilities: [['Resurrect', ['Cooldown increased from 30 to 40 seconds.', 'Cast time reduced from 2 to 1 seconds.']]] })])])))[0]);
  const result = mergePatch(again.file, edited, '2026-03-14T00:00:00.000Z');
  assert.equal(result.status, 'edited');
  assert.equal(result.file.firstImportedAt, '2026-03-12T00:00:00.000Z');
  assert.equal(result.file.revisions.length, 1);
  assert.deepEqual([result.file.revisions[0].added, result.file.revisions[0].changed, result.file.revisions[0].removed], [1, 1, 0]);
  assert.deepEqual(diffPatches(result.file, base), { added: 0, removed: 1, changed: 1 });
});

await test('a sudden drop in lines is treated as damage, not as an edit', () => {
  const change = () => line({});
  assert.equal(looksDamaged(null, { changes: [], other: [] }), null);
  assert.match(looksDamaged({ changes: [change(), change(), change(), change(), change()], other: [] }, { changes: [change()], other: [] }), /fell/);
  assert.match(looksDamaged({ changes: [change()], other: [] }, { changes: [], other: [{}] }), /fell/);
  assert.equal(looksDamaged({ changes: [change(), change(), change(), change(), change()], other: [] }, { changes: [change(), change(), change(), change()], other: [] }), null);
});

await test('seasons apply from their start date', () => {
  const seasons = [{ year: 2026, number: 1, start: '2026-02-09' }, { year: 2026, number: 2, start: '2026-04-14' }];
  assert.equal(seasonFor('2026-02-08', seasons), null);
  assert.equal(seasonFor('2026-02-09', seasons).id, '2026-s1');
  assert.equal(seasonFor('2026-04-13', seasons).label, 'Season 1');
  assert.equal(seasonFor('2026-11-03', seasons).number, 2);
});

// The ingestion command, with real files in a temporary folder
function runCli(args, env, extra = {}) {
  return spawnSync(process.execPath, ['scripts/patches/cli.mjs', ...args], { encoding: 'utf8', env: { ...process.env, ...env }, ...extra });
}

const SYNC_PAGE = (lines) => page(patchHtml('2026-12-01', 'Made up December patch', [generic('Hero Updates'), heroSection('Damage', [heroBlock('Genji', { abilities: [['Deflect', lines]] }), heroBlock('Tracer', { abilities: [['Blink', ['Cooldown reduced from 3 to 2 seconds.']]] })])]));
const snapshot = (dir) => Object.fromEntries(readdirSync(dir).sort().map((name) => [name, readFileSync(path.join(dir, name), 'utf8')]));

await test('sync creates data, skips needless writes, and logs edits safely', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ow2-sync-'));
  const pages = path.join(root, 'pages');
  const data = path.join(root, 'data');
  mkdirSync(pages);
  const write = (html) => writeFileSync(path.join(pages, 'month-2026-12.html'), html);
  const sync = (now, ...flags) => runCli(['sync', '--month', '2026-12', '--from-dir', pages, '--now', now, ...flags], { PATCH_DATA_DIR: data });
  const stored = () => JSON.parse(readFileSync(path.join(data, '2026-12-01.json'), 'utf8'));
  const index = () => JSON.parse(readFileSync(path.join(data, 'index.json'), 'utf8'));

  write(SYNC_PAGE(['Duration reduced from 2 to 1.5 seconds.']));
  let result = sync('2026-12-02T00:00:00.000Z');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(stored().changes.length, 2);
  assert.equal(stored().firstImportedAt, '2026-12-02T00:00:00.000Z');
  assert.ok(existsSync(path.join(data, 'heroes.json')));
  assert.equal(JSON.parse(readFileSync(path.join(data, 'heroes.json'), 'utf8')).heroes.genji[0].classification, 'nerf');
  assert.equal(runCli(['check'], { PATCH_DATA_DIR: data }).status, 0);

  // Nothing new and checked recently: no files touched, so no commit and no deploy.
  const before = snapshot(data);
  result = sync('2026-12-02T01:00:00.000Z');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing written/);
  assert.deepEqual(snapshot(data), before);

  // A day later the check time updates, and nothing else about the patch does.
  result = sync('2026-12-03T01:00:00.000Z');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(index().lastCheckedAt, '2026-12-03T01:00:00.000Z');
  assert.equal(index().lastChangedAt, '2026-12-02T00:00:00.000Z');
  assert.equal(stored().firstImportedAt, '2026-12-02T00:00:00.000Z');
  assert.deepEqual(stored().revisions, []);

  // Blizzard edits a line: the new value wins, and the edit is logged.
  write(SYNC_PAGE(['Duration reduced from 2 to 1.75 seconds.']));
  result = sync('2026-12-03T02:00:00.000Z');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /edited: 2026-12-01/);
  assert.equal(stored().changes[0].next, 1.75);
  assert.equal(stored().revisions.length, 1);
  assert.equal(stored().revisions[0].changed, 1);
  assert.equal(index().lastChangedAt, '2026-12-03T02:00:00.000Z');

  // A broken page or a large drop fails and leaves the stored data byte for byte.
  const good = snapshot(data);
  write('<html><body>Something else entirely</body></html>');
  result = sync('2026-12-04T02:00:00.000Z');
  assert.notEqual(result.status, 0);
  assert.deepEqual(snapshot(data), good);

  write(page(patchHtml('2026-12-01', 'Made up December patch', [generic('Hero Updates')])));
  result = sync('2026-12-04T03:00:00.000Z');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing/);
  assert.deepEqual(snapshot(data), good);

  // A confirmed shrink is allowed by hand.
  result = sync('2026-12-04T04:00:00.000Z', '--accept-shrink');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(stored().changes.length, 0);

  // A damaged store is reported by the offline check.
  const damaged = stored();
  damaged.counts.nerfs = 99;
  writeFileSync(path.join(data, '2026-12-01.json'), JSON.stringify(damaged));
  assert.notEqual(runCli(['check'], { PATCH_DATA_DIR: data }).status, 0);

  rmSync(root, { recursive: true, force: true });
});

await test('a patch that leaves the page stays stored', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ow2-sync-'));
  const pages = path.join(root, 'pages');
  const data = path.join(root, 'data');
  mkdirSync(pages);
  const heroes = (name) => [generic('Hero Updates'), heroSection('Damage', [heroBlock(name, { abilities: [['Blink', ['Cooldown reduced from 3 to 2 seconds.']]] })])];
  writeFileSync(path.join(pages, 'month-2026-12.html'), page(patchHtml('2026-12-02', 'B', heroes('Tracer')), patchHtml('2026-12-01', 'A', heroes('Genji'))));
  assert.equal(runCli(['sync', '--month', '2026-12', '--from-dir', pages, '--now', '2026-12-03T00:00:00.000Z'], { PATCH_DATA_DIR: data }).status, 0);
  writeFileSync(path.join(pages, 'month-2026-12.html'), page(patchHtml('2026-12-02', 'B', heroes('Tracer'))));
  const result = runCli(['sync', '--month', '2026-12', '--from-dir', pages, '--now', '2026-12-05T00:00:00.000Z'], { PATCH_DATA_DIR: data });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2026-12-01: no longer on the official page, keeping the stored copy/);
  assert.ok(existsSync(path.join(data, '2026-12-01.json')));
  assert.equal(JSON.parse(readFileSync(path.join(data, 'index.json'), 'utf8')).patches.length, 2);
  rmSync(root, { recursive: true, force: true });
});

await test('a failed read exits with an error and keeps stored data', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ow2-sync-'));
  const data = path.join(root, 'data');
  mkdirSync(data);
  cpSync('public/data/patches', data, { recursive: true });
  const before = snapshot(data);
  const server = http.createServer((request, response) => {
    response.writeHead(500);
    response.end('nope');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const child = await new Promise((resolve) => {
    const proc = spawnAsync(process.execPath, ['scripts/patches/cli.mjs', 'sync', '--month', '2026-11'], { env: { ...process.env, PATCH_DATA_DIR: data, PATCH_ARCHIVE_URL: `http://127.0.0.1:${port}/live` } });
    resolve(proc);
  });
  server.close();
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Stored data was not changed/);
  assert.deepEqual(snapshot(data), before);
  rmSync(root, { recursive: true, force: true });
});

function spawnAsync(command, args, options) {
  return new Promise((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const proc = spawn(command, args, options);
      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk; });
      proc.on('close', (status) => resolve({ status, stderr }));
    });
  });
}

// Filters
await test('filters round trip through the URL, and only differences are written', () => {
  assert.equal(serializeFilters(DEFAULT_FILTERS), '');
  assert.deepEqual(parseFilters(''), DEFAULT_FILTERS);
  const filters = { ...DEFAULT_FILTERS, hero: 'd.va', ability: 'micro missiles', balance: 'nerf', role: 'tank', patch: '2026-11-03', season: '2026-s5', queue: 'competitive', format: '6v6', kind: 'perk-major', stat: 'cooldown', sort: 'buffs' };
  assert.deepEqual(parseFilters(serializeFilters(filters)), filters);
  assert.equal(serializeFilters({ ...DEFAULT_FILTERS, balance: 'nerf' }), 'balance=nerf');
  assert.equal(serializeFilters({ ...DEFAULT_FILTERS, role: 'support' }, { heroId: 'ana', patchId: '2026-11-03' }), 'role=support&open=ana&at=2026-11-03');
});

await test('unknown URL values fall back to defaults', () => {
  const filters = parseFilters('balance=mega&role=healer&patch=soon&format=9v9&type=x&stat=y&sort=z&queue=q');
  assert.deepEqual(filters, DEFAULT_FILTERS);
  assert.equal(parseDrawer('open=../../etc'), null);
  assert.deepEqual(parseDrawer('open=ana&at=nope'), { heroId: 'ana', patchId: null });
  assert.deepEqual(parseDrawer('open=ana&at=2026-11-03'), { heroId: 'ana', patchId: '2026-11-03' });
  assert.equal(parseDrawer(''), null);
});

await test('patch routes carry a query, and other routes keep their shape', () => {
  assert.deepEqual(parseHash('#/patches'), { view: 'patches', tab: 'changes', query: '' });
  assert.deepEqual(parseHash('#/patches?balance=nerf&role=tank'), { view: 'patches', tab: 'changes', query: 'balance=nerf&role=tank' });
  assert.deepEqual(parseHash('#/patches/history?hero=genji'), { view: 'patches', tab: 'history', query: 'hero=genji' });
  assert.deepEqual(parseHash('#/heroes'), { view: 'heroes' });
  assert.deepEqual(parseHash('#/'), { view: 'randomizer' });
  assert.deepEqual(parseHash('#/career'), { view: 'career', playerId: undefined, tab: 'overview', hero: undefined });
});

await test('selecting patches: latest is the newest with hero changes', () => {
  const meta = (id, season, gameplay) => ({ id, date: id, season: season ? { id: season } : null, counts: { gameplayChanges: gameplay, qol: 0, stadiumChanges: 0, limitedChanges: 0 } });
  const index = { patches: [meta('2026-11-10', 's5', 0), meta('2026-11-03', 's5', 10), meta('2026-08-01', 's4', 5)] };
  assert.equal(latestBalancePatch(index).id, '2026-11-03');
  const ids = (filters) => selectPatches(index, filters).map((patch) => patch.id);
  assert.deepEqual(ids({ patch: 'latest', season: 'all' }), ['2026-11-03']);
  assert.deepEqual(ids({ patch: 'all', season: 'all' }), ['2026-11-10', '2026-11-03', '2026-08-01']);
  assert.deepEqual(ids({ patch: 'latest', season: 's5' }), ['2026-11-10', '2026-11-03']);
  assert.deepEqual(ids({ patch: '2026-08-01', season: 'all' }), ['2026-08-01']);
  assert.deepEqual(ids({ patch: '2026-08-01', season: 's5' }), []);
  assert.equal(latestBalancePatch({ patches: [] }), null);
});

await test('summaries and unreviewed lines read sensibly', () => {
  assert.equal(automaticSummary([line({ ability: 'Deflect' })]), '1 change to Deflect.');
  assert.equal(automaticSummary([line({ ability: 'A' }), line({ ability: 'B' }), line({ ability: null })]), '3 changes to A, B and base stats.');
  assert.equal(automaticSummary([line({ ability: 'A' }), line({ ability: 'B' }), line({ ability: 'C' }), line({ ability: 'D' }), line({ ability: 'E' })]), '5 changes to A, B, C and 2 more.');
  assert.equal(automaticSummary([line({ direction: 'bugfix' })]), 'One bug fix.');
  const blank = (id) => line({ id, stat: null, previous: null, next: null, percentChange: null, direction: 'needs-review', ability: 'Fade' });
  const items = collapseUnworded([blank('a'), blank('b'), line({ id: 'c' }), blank('d')]);
  assert.deepEqual(items.map((item) => item.type), ['unworded', 'line']);
  assert.equal(items[0].count, 3);
});

// History
const historyPatch = (id, changes) => ({ id, date: id, sourceUrl: `https://overwatch.blizzard.com/en-us/news/patch-notes/live/${id.slice(0, 4)}/${id.slice(5, 7)}/#patch-${id}`, changes, notes: [], other: [], counts: {} });
const deflect = (id, previous, next, direction = 'nerf') => line({ id: `${id}/standard/genji/deflect/0`, series: 'standard/genji/deflect/duration', previous, next, direction, percentChange: percentChange(previous, next) });

await test('a stat series only holds published values, and mismatches become gaps', () => {
  const [series] = buildSeries([
    historyPatch('2026-05-01', [deflect('2026-05-01', 1.5, 1)]),
    historyPatch('2026-03-01', [deflect('2026-03-01', 2, 1.5)]),
    historyPatch('2026-08-01', [deflect('2026-08-01', 2, 1.75, 'buff')]),
  ], 'genji');
  assert.deepEqual(series.points.map((point) => point.date), ['2026-03-01', '2026-05-01', '2026-08-01']);
  assert.deepEqual(series.points.map((point) => point.continues), [null, true, false]);
  assert.deepEqual(series.points.flatMap((point) => [point.change.previous, point.change.next]), [2, 1.5, 1.5, 1, 2, 1.75]);
});

await test('cumulative changes only span connected values', () => {
  const [series] = buildSeries([
    historyPatch('2026-03-01', [deflect('2026-03-01', 2, 1.5)]),
    historyPatch('2026-05-01', [deflect('2026-05-01', 1.5, 1)]),
    historyPatch('2026-08-01', [deflect('2026-08-01', 2, 1.75, 'buff')]),
  ], 'genji');
  const connected = cumulativeChange(series, 0, 1);
  assert.deepEqual([connected.from, connected.to, connected.percent, connected.patches, connected.brokenAt], [2, 1, -50, 2, null]);
  const broken = cumulativeChange(series, 0, 2);
  assert.equal(broken.brokenAt, '2026-08-01');
  assert.equal(broken.percent, null);
  assert.equal(cumulativeChange(series, 2, 0).brokenAt, '2026-08-01');
  assert.equal(cumulativeChange({ points: [], unit: null }, 0, 0), null);
});

await test('comparing patches keeps formats apart and finds shared stats', () => {
  const a = historyPatch('2026-03-01', [deflect('2026-03-01', 2, 1.5), line({ id: 'a2', heroId: 'ana', heroName: 'Ana', role: 'support', direction: 'buff' }), line({ id: 'a3', heroId: 'mauga', heroName: 'Mauga', role: 'tank', scope: 'stadium', direction: 'buff' })]);
  const b = historyPatch('2026-05-01', [deflect('2026-05-01', 1.5, 1), line({ id: 'b2', heroId: 'mauga', heroName: 'Mauga', role: 'tank', direction: 'nerf' })]);
  const result = comparePatches(a, b, 'standard');
  assert.deepEqual([result.both, result.onlyA, result.onlyB], [1, 1, 1]);
  assert.deepEqual(result.rows.map((row) => row.heroId), ['mauga', 'genji', 'ana']);
  assert.equal(result.rows[1].shared.length, 1);
  assert.equal(result.rows[1].a.rollup.classification, 'nerf');
  assert.equal(result.rows[0].a, null);
  assert.deepEqual(comparePatches(a, b, 'stadium').rows.map((row) => row.heroId), ['mauga']);
});

await test('repeated changes count patches per hero and report a current run', () => {
  const tally = (patch, classification, group = 'standard') => ({ patch, date: patch, group, classification, buffs: classification === 'buff' ? 2 : 0, nerfs: classification === 'nerf' ? 1 : 0, other: 0, review: 0 });
  const history = { heroes: {
    genji: [tally('2026-03-01', 'buff'), tally('2026-04-01', 'nerf'), tally('2026-05-01', 'nerf'), tally('2026-06-01', 'fix'), tally('2026-06-02', 'nerf', 'stadium')],
    ana: [tally('2026-03-01', 'buff')],
    mei: [tally('2026-03-01', 'nerf', 'stadium')],
  } };
  const patches = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-06-02'].map((id) => ({ id }));
  const rows = repeatedChanges(history, patches, 'standard');
  assert.deepEqual(rows.map((row) => row.heroId), ['genji', 'ana']);
  assert.deepEqual([rows[0].buffPatches, rows[0].nerfPatches, rows[0].buffLines, rows[0].nerfLines], [1, 2, 2, 2]);
  assert.deepEqual(rows[0].streak, { direction: 'nerf', length: 2 });
  assert.equal(rows[1].streak.length, 1);
  assert.deepEqual(repeatedChanges(history, patches.slice(0, 1), 'standard').map((row) => row.heroId), ['ana', 'genji']);
});

// The real imported data
const DATA_DIR = 'public/data/patches';
const load = (name) => JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8'));
const allPatches = readdirSync(DATA_DIR).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map(load);
const storedIndex = load('index.json');
const nov3 = load('2026-11-03.json');

await test('every stored patch passes its checks and links to its official source', () => {
  assert.ok(allPatches.length >= 42);
  assert.deepEqual(allPatches.flatMap(validatePatch), []);
  assert.deepEqual(validateIndex(storedIndex, allPatches), []);
  assert.ok(Date.parse(storedIndex.lastCheckedAt) > 0);
  const history = load('heroes.json');
  for (const patch of allPatches) {
    for (const change of patch.changes) {
      assert.ok(history.heroes[change.heroId].some((tally) => tally.patch === patch.id), `${change.id} missing from hero history`);
    }
  }
});

await test('every roster hero has an ability list with a weapon or ultimate', () => {
  const catalog = JSON.parse(readFileSync('scripts/patches/hero-abilities.json', 'utf8'));
  for (const hero of HEROES) {
    const entry = catalog[hero.id];
    assert.ok(entry, `${hero.id} is missing from hero-abilities.json`);
    assert.ok(entry.ultimates.length > 0 && entry.weapons.length > 0, hero.id);
    assert.ok(entry.minorPerks.length > 0 && entry.majorPerks.length > 0, `${hero.id} has no perks`);
  }
});

await test('stored seasons match the official season starts', () => {
  // These five were checked by hand. The patch sync adds later seasons itself, so those only need to follow on in order.
  assert.deepEqual(storedIndex.seasons.slice(0, 5).map((season) => [season.number, season.start]), [[1, '2026-02-09'], [2, '2026-04-14'], [3, '2026-06-16'], [4, '2026-08-11'], [5, '2026-10-06']]);
  storedIndex.seasons.slice(5).forEach((season, index) => {
    const before = storedIndex.seasons[index + 4];
    assert.ok(season.start > before.start, `season ${season.number} starts after season ${before.number}`);
    assert.ok(season.number === before.number + 1 || season.year > before.year, `season ${season.number} follows season ${before.number}`);
  });
  assert.equal(nov3.season.label, 'Season 5');
});

// These pin the reviewed November 3 import. If Blizzard edits those notes, the sync logs a revision and these step aside.
const pristine = nov3.revisions.length === 0;
const find = (id) => nov3.changes.find((change) => change.id === `2026-11-03/${id}`);
const cardsFor = (filters) => buildCards([nov3], { ...DEFAULT_FILTERS, ...filters });
const names = (filters, group = 'standard') => cardsFor(filters).filter((card) => card.group === group).map((card) => card.heroName).sort();

await test('November 3 counts match the official notes', () => {
  if (!pristine) return;
  assert.deepEqual(
    [nov3.counts.heroesBuffed, nov3.counts.heroesNerfed, nov3.counts.heroesMixed, nov3.counts.heroesNeutral, nov3.counts.heroesNeedsReview],
    [9, 7, 3, 1, 0],
  );
  assert.deepEqual([nov3.counts.buffs, nov3.counts.nerfs, nov3.counts.neutral, nov3.counts.qol, nov3.counts.sixVsSix], [19, 22, 1, 4, 1]);
  assert.deepEqual([nov3.counts.stadiumHeroes, nov3.counts.stadiumChanges, nov3.counts.bugFixes], [5, 7, 12]);
  assert.equal(nov3.changes.filter((change) => change.kind !== 'fix').length, 54);
  assert.equal(nov3.changes.filter((change) => change.direction === 'needs-review').length, 0);
  const emre = nov3.changes.filter((change) => change.heroId === 'emre' && change.direction === 'bugfix');
  assert.equal(emre.length, 1);
});

await test('November 3 hero results match a reading of the official notes', () => {
  if (!pristine) return;
  assert.deepEqual(names({ balance: 'buff' }), ['Brigitte', 'Echo', 'Emre', 'Illari', 'Junker Queen', 'Mauga', 'Ramattra', 'Reaper', 'Shion']);
  assert.deepEqual(names({ balance: 'nerf' }), ['Ana', 'D.Mon', 'Doctrine', 'Genji', 'Hanzo', 'Vendetta', 'Winston']);
  assert.deepEqual(names({ balance: 'mixed' }), ['Anran', 'Jetpack Cat', 'Sombra']);
  assert.deepEqual(names({ balance: 'neutral' }), ['Baptiste', 'Emre', 'Junker Queen']);
  assert.deepEqual(names({ balance: 'bugfix' }), ['D.Mon', 'Emre', 'Mizuki', 'Sombra', 'Wrecking Ball']);
  assert.deepEqual(names({ balance: 'buff' }, 'stadium'), ['Cassidy', 'Genji', 'Sojourn']);
  assert.deepEqual(names({ balance: 'nerf' }, 'stadium'), ['Vendetta', 'Winston']);
});

await test('November 3 values and percentages match the official notes', () => {
  if (!pristine) return;
  const expect = (id, previous, next, unit, percent, direction) => {
    const change = find(id);
    assert.ok(change, id);
    assert.deepEqual([change.previous, change.next, change.unit, change.percentChange, change.direction], [previous, next, unit, percent, direction], id);
  };
  expect('standard/junker-queen/base/0', 375, 425, null, 13.3, 'buff');
  expect('6v6/junker-queen/base/0', 450, 500, null, 11.1, 'buff');
  expect('standard/junker-queen/carnage/0', 9, 7, 's', -22.2, 'buff');
  expect('standard/ana/biotic-grenade/0', 90, 60, null, -33.3, 'nerf');
  expect('standard/genji/deflect/0', 2, 1.5, 's', -25, 'nerf');
  expect('standard/anran/zhuque-fans/0', 22, 24, null, 9.1, 'buff');
  expect('standard/anran/vermillion-ascent/0', 1.2, 1, 's', -16.7, 'buff');
  expect('standard/sombra/hotfix/0', 12, 10, 's', -16.7, 'nerf');
  expect('standard/sombra/cyberspace/0', 50, 40, '%', -20, 'nerf');
  expect('standard/doctrine/eternal-scepter/0', 0.6, 0.65, null, 8.3, 'nerf');
  expect('standard/doctrine/eternal-scepter/1', 90, 80, null, -11.1, 'nerf');
  expect('standard/doctrine/eternal-scepter/2', 120, 110, null, -8.3, 'nerf');
  expect('standard/doctrine/shrouded-momentum/0', 8, 10, 's', 25, 'nerf');
  expect('standard/doctrine/infuse/0', 8, 9, 's', 12.5, 'nerf');
  expect('standard/illari/solar-rifle/0', 0.65, 0.575, null, -11.5, 'buff');
  expect('standard/shion/execution/0', 8.5, 5.7, '°', -32.9, 'buff');
  expect('standard/jetpack-cat/frenetic-flight/0', 25, 28, 'm/s', 12, 'buff');
  expect('standard/jetpack-cat/frenetic-flight/1', 25, 20, '%/s', -20, 'nerf');
  expect('stadium/winston/tesla-field/0', 40, 30, null, -25, 'nerf');
  expect('stadium/vendetta/apex-bloodlust/0', 4, 3, '%', -25, 'nerf');
  // Both are damage penalties, so a smaller number is the buff and a plain percent would mislead.
  expect('stadium/cassidy/barrage-blastin/0', 60, 50, '%', null, 'buff');
  expect('stadium/sojourn/hard-stuck/0', 25, 10, '%', null, 'buff');
  expect('stadium/vendetta/rampant-onslaught/0', 2, 3, null, 50, 'nerf');
});

await test('November 3 special cases from the brief', () => {
  if (!pristine) return;
  const card = (name, group = 'standard') => cardsFor({}).find((item) => item.heroName === name && item.group === group);

  const sombra = card('Sombra');
  assert.equal(sombra.rollup.classification, 'mixed');
  assert.equal(sombra.rollup.lean, 'nerf');
  assert.deepEqual([find('standard/sombra/emp/0').direction, find('standard/sombra/emp/0').situational], ['buff', true]);
  assert.match(leanText(sombra.rollup), /leans toward nerfs/);

  const doctrine = card('Doctrine');
  assert.equal(doctrine.rollup.classification, 'nerf');
  assert.equal(doctrine.rollup.nerfs, 5);
  assert.deepEqual(doctrine.lines.map((change) => change.ability), ['Eternal Scepter', 'Eternal Scepter', 'Eternal Scepter', 'Shrouded Momentum', 'Infuse']);

  const baptiste = card('Baptiste');
  assert.equal(baptiste.rollup.classification, 'neutral');
  assert.equal(find('standard/baptiste/regenerative-burst/0').direction, 'qol');
  assert.equal(baptiste.rollup.buffs, 0);

  const anran = card('Anran');
  assert.equal(anran.rollup.classification, 'mixed');
  assert.deepEqual(anran.lines.map((change) => change.direction), ['buff', 'nerf', 'nerf', 'buff']);
  assert.equal(find('standard/anran/vermillion-ascent/0').kind, 'ultimate');

  // Stadium and 6v6 stay apart.
  assert.equal(card('Genji').rollup.classification, 'nerf');
  assert.equal(card('Genji', 'stadium').rollup.classification, 'buff');
  assert.equal(card('Genji').lines.filter((change) => change.scope === 'stadium').length, 0);
  assert.equal(find('6v6/junker-queen/base/0').scope, '6v6');
  assert.deepEqual(cardsFor({ format: '6v6' }).map((item) => item.heroName), ['Junker Queen']);
  assert.equal(cardsFor({ format: '6v6' })[0].shown.length, 1);
  assert.equal(cardsFor({ format: '5v5' }).find((item) => item.heroName === 'Junker Queen').lines.length, 3);
});

await test('November 3 filters combine', () => {
  if (!pristine) return;
  assert.deepEqual(names({ role: 'support', balance: 'nerf' }), ['Ana', 'Doctrine']);
  assert.deepEqual(names({ role: 'tank', balance: 'buff' }), ['Junker Queen', 'Mauga', 'Ramattra']);
  assert.deepEqual(names({ hero: 'junker' }), ['Junker Queen']);
  assert.deepEqual(names({ hero: 'WRECKINGBALL' }), ['Wrecking Ball']);
  assert.deepEqual(names({ hero: 'd.mon' }), ['D.Mon']);
  assert.deepEqual(names({ ability: 'deflect' }), ['Genji']);
  assert.deepEqual(names({ ability: 'vermillion' }), ['Anran']);
  assert.deepEqual(names({ kind: 'perk-major' }), ['D.Mon', 'Hanzo', 'Winston']);
  assert.deepEqual(names({ kind: 'perk-minor' }), ['Echo', 'Vendetta']);
  assert.deepEqual(names({ kind: 'ultimate' }), ['Anran', 'Shion', 'Sombra']);
  assert.ok(names({ kind: 'weapon' }).includes('Ramattra'));
  assert.equal(cardsFor({ kind: 'power' }).reduce((sum, card) => sum + card.shown.length, 0), 7);
  assert.equal(cardsFor({ kind: 'power' }).every((card) => card.group === 'stadium'), true);
  assert.deepEqual(names({ stat: 'armor' }), ['Mauga']);
  assert.deepEqual(names({ stat: 'health' }), ['Jetpack Cat', 'Junker Queen', 'Reaper']);
  assert.deepEqual(names({ stat: 'cooldown' }).includes('Junker Queen'), true);
  assert.deepEqual(names({ stat: 'mobility' }).includes('Jetpack Cat'), true);
  assert.equal(cardsFor({ hero: 'nobody here' }).length, 0);
  // A line filter narrows a card without changing its overall result.
  const narrowed = cardsFor({ stat: 'armor' })[0];
  assert.equal(narrowed.shown.length, 1);
  assert.equal(narrowed.lines.length, 2);
  assert.equal(narrowed.rollup.classification, 'buff');
  // No queue-specific lines exist yet, so both choices keep them all.
  assert.equal(cardsFor({ queue: 'competitive' }).length, cardsFor({}).length);
  assert.equal(cardsFor({ queue: 'quickplay' }).length, cardsFor({}).length);
});

await test('November 3 sorting and sections never merge Stadium with standard play', () => {
  if (!pristine) return;
  const sorted = (sort) => cardsFor({ sort, format: '5v5' }).map((card) => card.heroName);
  assert.deepEqual(sorted('name').slice(0, 3), ['Ana', 'Anran', 'Baptiste']);
  assert.equal(cardsFor({ sort: 'buffs' })[0].rollup.buffs, 3);
  assert.equal(cardsFor({ sort: 'nerfs' })[0].heroName, 'Doctrine');
  const newest = cardsFor({}).filter((card) => card.group === 'standard').map((card) => card.role);
  assert.deepEqual([...new Set(newest)], ['tank', 'damage', 'support']);
  for (const sort of ['newest', 'name', 'buffs', 'nerfs']) {
    const sections = buildSections(cardsFor({ sort }), sort, false);
    assert.deepEqual(sections.map((section) => section.group), ['standard', 'stadium'], sort);
    assert.ok(sections[0].cards.every((card) => card.group === 'standard'));
    assert.ok(sections[1].cards.every((card) => card.group === 'stadium'));
  }
  const totals = resultTotals(cardsFor({}));
  assert.deepEqual([totals.heroes, totals.lines, totals.stadiumHeroes, totals.stadiumLines], [22, 51, 5, 7]);
});

await test('Genji has a real Deflect history across patches, and it connects or shows a gap', () => {
  const series = buildSeries(allPatches, 'genji');
  const deflectSeries = series.find((item) => item.key === 'standard/genji/deflect/duration');
  assert.ok(deflectSeries, 'no Deflect duration series');
  assert.equal(deflectSeries.points[deflectSeries.points.length - 1].date >= '2026-11-03', true);
  deflectSeries.points.forEach((point, index) => {
    if (index === 0) return;
    const before = deflectSeries.points[index - 1].change.next;
    assert.equal(point.continues, before === point.change.previous);
  });
});

await test('the stored data holds no source passages', () => {
  const longest = (patch) => Math.max(0, ...patch.changes.flatMap((change) => [change.stat, change.note, change.summary, change.qualifier].map((text) => text?.length ?? 0)), ...patch.notes.flatMap((note) => [note.summary, note.devIntent].map((text) => text?.length ?? 0)));
  allPatches.forEach((patch) => assert.ok(longest(patch) <= 220, `${patch.id}: ${longest(patch)}`));
  const raw = JSON.stringify(nov3);
  for (const passage of ['Developer Comments', 'reduced from 90 to 60', 'Recent changes to', 'Fixed an issue where']) {
    assert.ok(!raw.includes(passage), passage);
  }
});

rmSync(outdir, { recursive: true, force: true });

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((failure) => console.error('FAIL ' + failure));
  process.exit(1);
}
