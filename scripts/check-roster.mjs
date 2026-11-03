// Compares src/data/heroes.ts against the live OverFast hero list and checks that image files exist.
// Run with: npm run check:roster
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync('src/data/heroes.ts', 'utf8');
const local = new Map([...source.matchAll(/\{ id: '([^']+)', name: '[^']*(?:\\'[^']*)*', role: '(\w+)'/g)].map((match) => [match[1], match[2]]));

const response = await fetch('https://overfast-api.tekrop.fr/heroes');
if (!response.ok) {
  console.error(`OverFast API returned ${response.status}. Try again later.`);
  process.exit(2);
}
const remote = new Map((await response.json()).map((hero) => [hero.key, hero.role]));

const problems = [];
for (const [id, role] of remote) {
  if (!local.has(id)) problems.push(`New hero missing from src/data/heroes.ts: ${id} (${role})`);
  else if (local.get(id) !== role) problems.push(`Role changed for ${id}: site says ${local.get(id)}, API says ${role}`);
}
for (const id of local.keys()) {
  if (!remote.has(id)) problems.push(`In src/data/heroes.ts but not in the API: ${id}`);
  for (const file of [`portrait/${id}.webp`, `art/${id}.webp`, `art/${id}-900.webp`]) {
    if (!existsSync(`public/heroes/${file}`)) problems.push(`Missing image: public/heroes/${file}`);
  }
}

console.log(`Site roster: ${local.size} heroes. API roster: ${remote.size} heroes.`);
if (problems.length) {
  problems.forEach((problem) => console.log(' - ' + problem));
  process.exit(1);
}
console.log('Roster is up to date.');
