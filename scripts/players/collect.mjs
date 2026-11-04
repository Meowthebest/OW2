#!/usr/bin/env node
// Takes one reading of Steam's player count and updates the data folder.
//
//   node scripts/players/collect.mjs <data-folder>            Take one reading
//   node scripts/players/collect.mjs <data-folder> --rebuild  Rebuild the derived files from stored readings
//
// A failed read is reported and exits normally, so a Steam outage doesn't mark every run as failed.
// The site shows the last good count as stale until a read succeeds.
import fs from 'node:fs';
import { collectOnce, rebuild, STEAM_URL } from './lib.mjs';

const [dir, flag] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: collect.mjs <data-folder> [--rebuild]');
  process.exit(2);
}

function summarize(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

if (flag === '--rebuild') {
  const latest = rebuild(dir);
  summarize(latest ? `Rebuilt from ${latest.readings} readings.` : 'No readings to rebuild from.');
  process.exit(0);
}

const result = await collectOnce({ dir, url: process.env.STEAM_PLAYERS_URL ?? STEAM_URL });
if (result.status === 'failed') {
  // Shows as a warning on the run page.
  console.log(`::warning::Steam read failed: ${result.error}`);
  summarize(`Steam read failed: ${result.error}. Stored data was kept.`);
} else if (result.status === 'duplicate') {
  summarize(`Already have a reading for this time (Steam now says ${result.players} players). Nothing written.`);
} else {
  summarize(`Recorded ${result.players} players.`);
}
