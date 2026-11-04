#!/usr/bin/env node
// Patch notes ingestion. Reads Blizzard's published patch notes pages and writes structured JSON for the site.
// There is no official Blizzard API for patch notes, so this reads the public, server-rendered pages,
// which robots.txt allows, one month at a time. Nothing here runs in visitors' browsers.
//
//   node scripts/patches/cli.mjs sync                 current and previous month
//   node scripts/patches/cli.mjs sync --all           every month since the import start
//   node scripts/patches/cli.mjs sync --month 2026-11
//   node scripts/patches/cli.mjs sync --from-dir DIR  read month-YYYY-MM.html files instead of the network
//   node scripts/patches/cli.mjs verify [--patch ID]  re-read the source and compare every stored value
//   node scripts/patches/cli.mjs check                check the stored data offline, without any network
//   node scripts/patches/cli.mjs review-template ID   print a patch's lines for writing a review file
//   node scripts/patches/cli.mjs abilities            refresh perk names from Blizzard's hero pages
//
// Any failure exits non-zero before anything is written, so the last good data stays in place.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = process.env.PATCH_DATA_DIR ?? path.join(ROOT, 'public/data/patches');
const SCRIPT_DIR = path.join(ROOT, 'scripts/patches');
const REVIEW_DIR = path.join(SCRIPT_DIR, 'reviews');
const SEASONS_FILE = path.join(SCRIPT_DIR, 'seasons.json');
const CATALOG_FILE = path.join(SCRIPT_DIR, 'hero-abilities.json');
const ARCHIVE = process.env.PATCH_ARCHIVE_URL ?? 'https://overwatch.blizzard.com/en-us/news/patch-notes/live';
const HERO_PAGES = 'https://overwatch.blizzard.com/en-us/heroes';
const USER_AGENT = 'OW2-Hero-Selector-PatchSync (+https://github.com/Meowthebest/OW2)';
const IMPORT_START = '2026-02';
const DAY = 24 * 60 * 60 * 1000;

const readJson = (file, fallback = null) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 1)}\n`);
  fs.renameSync(temp, file);
};
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const flags = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) flags._.push(item);
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) flags[item.slice(2)] = argv[++index];
    else flags[item.slice(2)] = true;
  }
  return flags;
}

/** Bundles the typed parser so this script and the site share one implementation. */
async function loadCore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow2-patches-'));
  const out = path.join(dir, 'core.mjs');
  await build({ entryPoints: [path.join(ROOT, 'src/features/patches/core/index.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const core = await import(pathToFileURL(out).href);
  fs.rmSync(dir, { recursive: true, force: true });
  return core;
}

async function fetchText(url, attempt = 1) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
    await sleep(2000 * attempt);
    return fetchText(url, attempt + 1);
  }
}

function monthsBetween(from, to) {
  const months = [];
  let [year, month] = from.split('-').map(Number);
  const [endYear, endMonth] = to.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return months;
}

function monthsToRead(flags, now) {
  if (flags.month) return [flags.month];
  const current = now.toISOString().slice(0, 7);
  if (flags.all) return monthsBetween(flags.since ?? IMPORT_START, current);
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  return previous < IMPORT_START ? [current] : [previous, current];
}

async function readMonth(month, flags) {
  if (flags['from-dir']) {
    const file = path.join(flags['from-dir'], `month-${month}.html`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
  // A month with no notes yet can come back empty, or with the same month of an earlier year.
  // Each patch's own anchor sets its date, so neither case can file a patch under the wrong month.
  const [year, number] = month.split('-');
  const html = await fetchText(`${ARCHIVE}/${year}/${number}/`);
  await sleep(600);
  return html;
}

/** Reads the requested months into parsed patches, or throws without having written anything. */
async function readSource(core, months, flags) {
  const raws = [];
  for (const month of months) {
    const html = await readMonth(month, flags);
    if (html === null) {
      console.log(`  ${month}: no page`);
      continue;
    }
    const patches = core.parseOfficialDocument(new JSDOM(html).window.document);
    const heroes = patches.reduce((sum, patch) => sum + patch.heroes.length, 0);
    console.log(`  ${month}: ${patches.length} patches, ${heroes} hero blocks`);
    raws.push(...patches);
  }
  return raws;
}

function updateSeasons(raws) {
  const seasons = readJson(SEASONS_FILE, []);
  let changed = false;
  for (const raw of [...raws].sort((a, b) => a.date.localeCompare(b.date))) {
    if (raw.seasonNumber === null) continue;
    const year = Number(raw.date.slice(0, 4));
    if (seasons.some((season) => season.year === year && season.number === raw.seasonNumber)) continue;
    seasons.push({ year, number: raw.seasonNumber, start: raw.date });
    changed = true;
    console.log(`  new season detected: ${year} Season ${raw.seasonNumber} starting ${raw.date}`);
  }
  seasons.sort((a, b) => a.start.localeCompare(b.start));
  return { seasons, changed };
}

const toMeta = ({ schema: _schema, notes: _notes, changes: _changes, other: _other, ...meta }) => meta;

function loadStoredPatches() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => readJson(path.join(DATA_DIR, name)));
}

function buildHeroHistory(core, patches) {
  const heroes = {};
  for (const patch of [...patches].sort((a, b) => a.date.localeCompare(b.date))) {
    const grouped = new Map();
    for (const change of patch.changes) {
      const key = `${change.heroId}|${core.cardGroup(change)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), change]);
    }
    for (const [key, list] of grouped) {
      const [heroId, group] = key.split('|');
      const rollup = core.rollupHero(list);
      (heroes[heroId] ??= []).push({ patch: patch.id, date: patch.date, group, classification: rollup.classification, buffs: rollup.buffs, nerfs: rollup.nerfs, other: rollup.neutral + rollup.qol + rollup.fixes, review: rollup.review });
    }
  }
  return { schema: 1, heroes };
}

async function sync(flags) {
  const core = await loadCore();
  const now = new Date(flags.now ?? Date.now());
  const nowIso = now.toISOString();
  const months = monthsToRead(flags, now);
  console.log(`Reading ${months.length} month(s) from ${flags['from-dir'] ? 'saved files' : 'the official site'}`);
  const raws = await readSource(core, months, flags);

  const previousIndex = readJson(path.join(DATA_DIR, 'index.json'));
  if (raws.length === 0) throw new Error('No patches found on the pages read.');

  const catalog = readJson(CATALOG_FILE, {});
  const { seasons, changed: seasonsChanged } = updateSeasons(raws);
  const startDate = `${flags.since ?? IMPORT_START}-01`;
  const stored = new Map(loadStoredPatches().map((patch) => [patch.id, patch]));
  const results = [];
  const problems = [];
  const staleReviews = [];
  const unknownHeroes = new Set();

  const uniqueRaws = new Map(raws.filter((raw) => raw.date >= startDate).map((raw) => [raw.id, raw]));

  // A month that has stored patches but now parses to nothing means the page's markup moved, not that patches vanished.
  const gone = [...stored.values()].filter((patch) => months.includes(patch.date.slice(0, 7)) && !uniqueRaws.has(patch.id));
  for (const month of months) {
    const inMonth = [...stored.values()].filter((patch) => patch.date.startsWith(month));
    if (inMonth.length > 0 && inMonth.every((patch) => !uniqueRaws.has(patch.id))) problems.push(`${month}: ${inMonth.length} stored patches but none found on the page`);
  }
  for (const raw of uniqueRaws.values()) {
    for (const hero of raw.heroes) if (!hero.heroId) unknownHeroes.add(hero.name);
    const review = readJson(path.join(REVIEW_DIR, `${raw.id}.json`));
    const { file, staleReviews: stale } = core.normalizePatch(raw, { hash: sha, catalog, seasons, review });
    staleReviews.push(...stale.map((id) => `${raw.id}: ${id}`));
    const previous = stored.get(raw.id) ?? null;
    const damage = flags['accept-shrink'] ? null : core.looksDamaged(previous, file);
    if (damage) {
      problems.push(`${raw.id}: ${damage}`);
      continue;
    }
    results.push(core.mergePatch(previous, file, nowIso));
  }

  gone.forEach((patch) => console.log(`  ${patch.id}: no longer on the official page, keeping the stored copy`));

  if (problems.length) {
    console.error('Refusing to replace stored data. Check the source markup, or pass --accept-shrink after confirming by hand:');
    problems.forEach((problem) => console.error(`  ${problem}`));
    process.exitCode = 1;
    return;
  }

  const newOrEdited = results.filter((result) => result.status !== 'unchanged');
  const lastChecked = previousIndex?.lastCheckedAt ? Date.parse(previousIndex.lastCheckedAt) : 0;
  const reviewOrShapeChanged = results.some((result) => {
    const previous = stored.get(result.file.id);
    if (!previous) return true;
    const strip = (file) => JSON.stringify({ ...file, lastVerifiedAt: null, firstImportedAt: null, revisions: null });
    return strip(previous) !== strip(result.file);
  });
  const shouldWrite = newOrEdited.length > 0 || reviewOrShapeChanged || seasonsChanged || !previousIndex || now.getTime() - lastChecked >= DAY - 60 * 60 * 1000 || flags.force;

  for (const result of newOrEdited) console.log(`  ${result.status}: ${result.file.id}`);
  if (unknownHeroes.size) console.log(`  heroes not on the site's roster: ${[...unknownHeroes].join(', ')}`);
  if (staleReviews.length) {
    console.log('  reviews that no longer match their source line, now needing a fresh look:');
    staleReviews.forEach((item) => console.log(`    ${item}`));
  }

  if (!shouldWrite) {
    console.log('No changes, and the last check is recent. Nothing written.');
    return;
  }
  const invalid = results.flatMap((result) => core.validatePatch(result.file));
  if (invalid.length) {
    console.error('Refusing to write data that fails its own checks:');
    invalid.forEach((problem) => console.error(`  ${problem}`));
    process.exitCode = 1;
    return;
  }
  if (flags['dry-run']) {
    console.log(`Dry run: would write ${results.length} patches.`);
    return;
  }

  if (seasonsChanged) writeJson(SEASONS_FILE, seasons);
  for (const result of results) {
    writeJson(path.join(DATA_DIR, `${result.file.id}.json`), result.file);
    stored.set(result.file.id, result.file);
  }

  // Patches that have left the source stay stored, because history should not vanish with a page edit.
  const all = [...stored.values()].sort((a, b) => b.date.localeCompare(a.date));
  const contentChanged = newOrEdited.length > 0 || !previousIndex;
  writeJson(path.join(DATA_DIR, 'index.json'), {
    schema: 1,
    source: `${ARCHIVE}/`,
    lastCheckedAt: nowIso,
    lastChangedAt: contentChanged ? nowIso : previousIndex.lastChangedAt,
    seasons,
    patches: all.map(toMeta),
  });
  writeJson(path.join(DATA_DIR, 'heroes.json'), buildHeroHistory(core, all));

  console.log(`Wrote ${results.length} patches (${newOrEdited.length} new or edited). ${all.length} stored in total.`);
  const lines = results.reduce((sum, result) => sum + result.file.changes.length, 0);
  const review = results.reduce((sum, result) => sum + result.file.changes.filter((change) => change.direction === 'needs-review').length, 0);
  console.log(`${lines} hero lines in this run, ${review} left as needs review.`);
  writeSummary([
    `**${results.length}** patches read, **${newOrEdited.filter((result) => result.status === 'new').length}** new, **${newOrEdited.filter((result) => result.status === 'edited').length}** edited by Blizzard since the last import.`,
    ...newOrEdited.slice(0, 40).map((result) => `- ${result.status}: ${result.file.id}, ${result.file.title}`),
    ...(staleReviews.length ? ['', '**Reviews to redo.** Blizzard changed these lines after they were reviewed, so they fell back to the rules:', ...staleReviews.map((item) => `- ${item}`)] : []),
    ...(unknownHeroes.size ? ['', `**Heroes not on the roster:** ${[...unknownHeroes].join(', ')}`] : []),
  ]);
}

/** Shows up on the workflow run's page, so edits and stale reviews get noticed. */
function writeSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

/** Offline checks on what is stored: provenance, consistency and that the index matches the files. */
async function check() {
  const core = await loadCore();
  const patches = loadStoredPatches();
  const index = readJson(path.join(DATA_DIR, 'index.json'));
  if (!index || patches.length === 0) throw new Error('No stored patch data found.');
  const problems = [...patches.flatMap((patch) => core.validatePatch(patch)), ...core.validateIndex(index, patches)];
  problems.forEach((problem) => console.error(problem));
  const lines = patches.reduce((sum, patch) => sum + patch.changes.length, 0);
  console.log(`Checked ${patches.length} patches and ${lines} lines. ${problems.length} problem(s).`);
  if (problems.length) process.exitCode = 1;
}

/** Re-reads the source and compares every stored line. Exits non-zero on any disagreement. */
async function verify(flags) {
  const core = await loadCore();
  const stored = loadStoredPatches().filter((patch) => !flags.patch || patch.id === flags.patch);
  if (stored.length === 0) throw new Error('Nothing stored to verify.');
  const months = [...new Set(stored.map((patch) => patch.date.slice(0, 7)))].sort();
  console.log(`Verifying ${stored.length} stored patch(es) against ${months.length} month page(s)`);
  const raws = await readSource(core, months, flags);
  const byId = new Map(raws.map((raw) => [raw.id, raw]));
  const catalog = readJson(CATALOG_FILE, {});
  const seasons = readJson(SEASONS_FILE, []);
  let failures = 0;
  let checkedLines = 0;
  let checkedValues = 0;

  for (const patch of stored) {
    const raw = byId.get(patch.id);
    if (!raw) {
      console.log(`  ${patch.id}: no longer on the official page`);
      failures += 1;
      continue;
    }
    const review = readJson(path.join(REVIEW_DIR, `${patch.id}.json`));
    const { file } = core.normalizePatch(raw, { hash: sha, catalog, seasons, review });
    const fresh = new Map(file.changes.map((change) => [change.id, change]));
    for (const change of patch.changes) {
      checkedLines += 1;
      const match = fresh.get(change.id);
      if (!match) {
        console.log(`  ${change.id}: not found in the source`);
        failures += 1;
        continue;
      }
      if (match.sourceHash !== change.sourceHash) {
        console.log(`  ${change.id}: source line was edited`);
        failures += 1;
      }
      if (change.previous !== null || change.next !== null) checkedValues += 1;
      if (match.previous !== change.previous || match.next !== change.next) {
        console.log(`  ${change.id}: stored ${change.previous} to ${change.next}, source says ${match.previous} to ${match.next}`);
        failures += 1;
      }
    }
    for (const id of fresh.keys()) {
      if (!patch.changes.some((change) => change.id === id)) {
        console.log(`  ${id}: in the source but not stored`);
        failures += 1;
      }
    }
    if (patch.forumUrl && !flags['from-dir']) {
      const forum = await crossCheckForum(patch);
      failures += forum;
    }
  }
  console.log(`Checked ${checkedLines} lines and ${checkedValues} sets of values. ${failures} disagreement(s).`);
  if (failures) process.exitCode = 1;
}

/** Blizzard also posts retail notes on the forums. Every stored number should appear there too. */
async function crossCheckForum(patch) {
  const url = `${patch.forumUrl.replace(/\/$/, '')}.json`;
  const json = await fetchText(url);
  if (!json) {
    console.log(`  ${patch.id}: forum post unavailable`);
    return 0;
  }
  const post = JSON.parse(json).post_stream?.posts?.[0]?.cooked ?? '';
  const forumLines = [...new JSDOM(post).window.document.querySelectorAll('li')].map((item) => item.textContent.replace(/\s+/g, ' '));
  const hasNumber = (line, value) => new RegExp(`(^|[^\\d.])${String(value).replace('.', '\\.')}(?![\\d]|\\.\\d)`).test(line);
  let missing = 0;
  let checked = 0;
  for (const change of patch.changes) {
    if (change.previous === null || change.next === null) continue;
    checked += 1;
    if (!forumLines.some((line) => hasNumber(line, change.previous) && hasNumber(line, change.next))) {
      console.log(`  ${change.id}: no forum line has both ${change.previous} and ${change.next}`);
      missing += 1;
    }
  }
  console.log(`  ${patch.id}: forum cross-check covered ${checked} numeric lines, ${missing} missing`);
  return missing;
}

function reviewTemplate(flags) {
  const id = flags._[1];
  const patch = readJson(path.join(DATA_DIR, `${id}.json`));
  if (!patch) throw new Error(`No stored patch ${id}. Run sync first.`);
  for (const change of patch.changes) {
    const values = change.previous !== null || change.next !== null ? `${change.previous} -> ${change.next} ${change.unit ?? ''}` : change.changeBy !== null ? `by ${change.changeBy} ${change.unit ?? ''}` : '(text)';
    console.log(`${change.id}\t${change.sourceHash}\t${change.direction}\t${change.kind}\t${change.ability ?? '-'}\t${change.stat ?? '-'}\t${values}`);
  }
  for (const item of patch.other) console.log(`${item.id}\t${item.sourceHash ?? '-'}\t${item.section}\t${item.group ?? '-'}\t${item.title ?? '-'}`);
}

/** Perk names change between seasons. Weapons and ultimates are curated by hand in the same file. */
async function abilities() {
  const catalog = readJson(CATALOG_FILE, {});
  const text = (element) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  let changed = 0;
  for (const id of Object.keys(catalog)) {
    const html = await fetchText(`${HERO_PAGES}/${id}/`);
    await sleep(500);
    if (!html) {
      console.log(`  ${id}: page not found`);
      continue;
    }
    const document = new JSDOM(html).window.document;
    for (const category of document.querySelectorAll('.perk-category')) {
      const key = /major/i.test(text(category.querySelector('.perk-category-header'))) ? 'majorPerks' : 'minorPerks';
      const names = [...new Set([...category.querySelectorAll('.perks h3, .perks h4')].map(text).filter(Boolean))];
      if (names.length && JSON.stringify(names) !== JSON.stringify(catalog[id][key])) {
        catalog[id][key] = names;
        changed += 1;
      }
    }
  }
  fs.writeFileSync(CATALOG_FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Updated ${changed} perk list(s).`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const command = flags._[0];
  if (command === 'sync') await sync(flags);
  else if (command === 'verify') await verify(flags);
  else if (command === 'check') await check();
  else if (command === 'review-template') reviewTemplate(flags);
  else if (command === 'abilities') await abilities();
  else {
    console.error('Usage: cli.mjs <sync|verify|check|review-template|abilities> [options]');
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  console.error('Stored data was not changed.');
  process.exitCode = 1;
});
