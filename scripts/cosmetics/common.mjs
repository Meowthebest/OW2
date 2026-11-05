// Shared helpers for the cosmetics scripts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = process.env.COSMETICS_DATA_DIR ?? path.join(ROOT, 'data/cosmetics');
export const OUT_DIR = process.env.COSMETICS_OUT_DIR ?? path.join(ROOT, 'public/data/cosmetics');

export const readJson = (file, fallback = null) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

/** Writes through a temporary file, so a crash can't leave half a file behind. */
export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}

export const writeJson = (file, value) => writeText(file, `${JSON.stringify(value, null, 1)}\n`);

/** One record per line, sorted by key, so a change shows up in git as just the lines that changed. */
export function writeKeyedJson(file, record) {
  const lines = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`);
  writeText(file, `{\n${lines.join(',\n')}\n}\n`);
}

export function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendJsonLine(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

/** Bundles the typed core so these scripts and the site share one implementation. */
export async function loadCore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow2-cosmetics-'));
  const out = path.join(dir, 'core.mjs');
  await build({ entryPoints: [path.join(ROOT, 'src/features/cosmetics/core/index.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const core = await import(pathToFileURL(out).href);
  fs.rmSync(dir, { recursive: true, force: true });
  return core;
}

export function parseArgs(argv) {
  const flags = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) flags._.push(item);
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) flags[item.slice(2)] = argv[++index];
    else flags[item.slice(2)] = true;
  }
  return flags;
}

/**
 * The itemshop.gg key from the environment, or from a .env.local file that git ignores.
 * The value is only ever sent to itemshop.gg and is never logged.
 */
export function readItemshopKey() {
  if (process.env.ITEMSHOP_API_KEY) return process.env.ITEMSHOP_API_KEY.trim();
  for (const dir of [ROOT, path.dirname(ROOT)]) {
    const file = path.join(dir, '.env.local');
    if (!fs.existsSync(file)) continue;
    const match = /^ITEMSHOP_API_KEY=(\S+)\s*$/m.exec(fs.readFileSync(file, 'utf8'));
    if (match) return match[1];
  }
  return null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function logChange(entry, now = new Date()) {
  appendJsonLine(path.join(DATA_DIR, 'log.jsonl'), { at: now.toISOString(), ...entry });
}
