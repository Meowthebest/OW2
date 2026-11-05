#!/usr/bin/env node
// Cosmetics data pipeline. See docs/COSMETICS_DATA.md.
//
//   node scripts/cosmetics/cli.mjs sync [--force]          record the shop if it changed (itemshop.gg)
//   node scripts/cosmetics/cli.mjs backfill [--stays]      read past shops and item history (needs a key)
//   node scripts/cosmetics/cli.mjs wiki-link               print the export links to open in your own browser
//   node scripts/cosmetics/cli.mjs import-wiki FILE...     import Special:Export files, offline
//   node scripts/cosmetics/cli.mjs build                   write the files the site reads
//   node scripts/cosmetics/cli.mjs check                   check the stored data, offline
//   node scripts/cosmetics/cli.mjs log [N]                 show the last N import log lines
//
// Any failure exits non-zero before the stored data changes, so the site keeps its last good copy.
import path from 'node:path';
import { DATA_DIR, loadCore, parseArgs, readItemshopKey, readJsonLines } from './common.mjs';
import { backfillShop, syncShop } from './itemshop.mjs';

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const command = flags._[0];

  if (command === 'sync') {
    const core = await loadCore();
    const key = readItemshopKey();
    const result = await syncShop(core, { key, force: Boolean(flags.force) });
    console.log(result.reason);
    if (result.stays) console.log(`Read ${result.stays.read} items' history.`);
    return;
  }

  if (command === 'backfill') {
    const core = await loadCore();
    const result = await backfillShop(core, { key: readItemshopKey(), staysOnly: Boolean(flags.stays) });
    console.log(`Source lists ${result.days} days. Added ${result.added}. Read ${result.stays.read} items' history. First day: ${result.historyFrom ?? 'unknown'}.`);
    for (const line of result.failed.slice(0, 20)) console.warn(`  Skipped ${line}`);
    return;
  }

  if (command === 'wiki-link') {
    const { exportLinks } = await import('./wiki.mjs');
    const { loadHeroes } = await import('./heroes-list.mjs');
    const { HEROES } = await loadHeroes();
    for (const link of exportLinks(HEROES.map((hero) => hero.name))) console.log(`${link}\n`);
    return;
  }

  if (command === 'import-wiki') {
    const files = flags._.slice(1);
    if (files.length === 0) throw new Error('Pass the path of each Special:Export file.');
    const { importWikiExport } = await import('./wiki.mjs');
    const result = await importWikiExport(files.map((file) => path.resolve(file)));
    console.log(result.summary);
    return;
  }

  if (command === 'build') {
    const { buildCatalog } = await import('./build.mjs');
    const report = await buildCatalog();
    console.log(report.summary);
    for (const warning of report.warnings.slice(0, 40)) console.warn(`  ${warning}`);
    if (report.warnings.length > 40) console.warn(`  ...and ${report.warnings.length - 40} more`);
    return;
  }

  if (command === 'check') {
    const { buildCatalog } = await import('./build.mjs');
    const report = await buildCatalog({ dryRun: true });
    console.log(report.summary);
    if (report.errors.length > 0) {
      report.errors.forEach((line) => console.error(`  ${line}`));
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'log') {
    const count = Number(flags._[1]) || 20;
    for (const line of readJsonLines(path.join(DATA_DIR, 'log.jsonl')).slice(-count)) console.log(JSON.stringify(line));
    return;
  }

  console.error('Commands: sync [--force], backfill [--stays], wiki-link, import-wiki FILE, build, check, log [N]');
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
