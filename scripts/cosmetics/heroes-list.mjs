// Reads the hero roster from the site's own data file, so there is one list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { ROOT } from './common.mjs';

let cached = null;

export async function loadHeroes() {
  if (cached) return cached;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow2-heroes-'));
  const out = path.join(dir, 'heroes.mjs');
  await build({ entryPoints: [path.join(ROOT, 'src/data/heroes.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  cached = await import(pathToFileURL(out).href);
  fs.rmSync(dir, { recursive: true, force: true });
  return cached;
}
