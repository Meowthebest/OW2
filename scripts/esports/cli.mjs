// The Guess the Pro player list.
//   node scripts/esports/cli.mjs import FILE.xml [MORE.xml]   read a Liquipedia export and write the list
//   node scripts/esports/cli.mjs check                        check the published list, offline
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { readJson, ROOT, writeJson } from '../cosmetics/common.mjs';
import { buildProData } from './liquipedia.mjs';

const OUT_FILE = process.env.PRO_DATA_FILE ?? path.join(ROOT, 'public/data/esports/owcs-players.json');
const TEAMS_FILE = path.join(ROOT, 'data/esports/teams.json');

/** The site's own checks, so the importer and the page agree on what a good list is. */
async function loadCore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow2-pro-'));
  const out = path.join(dir, 'core.mjs');
  await build({ entryPoints: [path.join(ROOT, 'src/features/pro/core.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const core = await import(pathToFileURL(out).href);
  fs.rmSync(dir, { recursive: true, force: true });
  return core;
}

async function main() {
  const [command, ...files] = process.argv.slice(2);
  const core = await loadCore();

  if (command === 'import') {
    if (files.length === 0) throw new Error('Give the exported file: node scripts/esports/cli.mjs import Liquipedia-export.xml');
    const regions = readJson(TEAMS_FILE, { regions: {} })?.regions ?? {};
    const { data, notes } = buildProData(files.map((file) => fs.readFileSync(file, 'utf8')), { regions });
    for (const note of notes) console.warn(`  ${note}`);
    const problems = core.checkProData(data);
    if (problems.length > 0) {
      problems.forEach((line) => console.error(`  ${line}`));
      throw new Error('The list has problems, so nothing was written.');
    }
    writeJson(OUT_FILE, data);
    console.log(`Wrote ${data.players.length} players from ${data.teams.length} teams, exported ${data.exportedAt ?? 'at an unknown time'}.`);
    return;
  }

  if (command === 'check') {
    const data = readJson(OUT_FILE, null);
    if (!data) {
      console.log('No player list yet. The game page says so until one is imported.');
      return;
    }
    const problems = core.checkProData(data);
    problems.forEach((line) => console.error(`  ${line}`));
    console.log(`${data.players.length} players from ${data.teams.length} teams. ${problems.length} problems.`);
    if (problems.length > 0) process.exitCode = 1;
    return;
  }

  console.error('Commands: import FILE.xml [MORE.xml], check');
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
