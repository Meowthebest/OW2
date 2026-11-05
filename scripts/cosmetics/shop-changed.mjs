// The cheap check before a shop sync: one request, no installed packages. Sets changed=true or changed=false for the workflow.
// If the check itself fails, it answers changed=true, so the full sync runs and reports the problem properly.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const API = (process.env.ITEMSHOP_API_URL ?? 'https://itemshop.gg/api/v1').replace(/\/$/, '');
const STATE = 'data/cosmetics/shop/state.json';

let changed = true;
try {
  const response = await fetch(`${API}/rotations`, { headers: { 'User-Agent': 'OW2-Hero-Selector-ShopSync (+https://github.com/Meowthebest/OW2)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (response.ok) {
    const fingerprint = (await response.json())?.data?.overwatch?.fingerprint;
    const stored = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')).sourceFingerprint : null;
    changed = !fingerprint || fingerprint !== stored;
    console.log(changed ? 'The shop has changed.' : 'The shop has not changed.');
  } else {
    console.log(`The check answered ${response.status}, so the full sync will run.`);
  }
} catch (error) {
  console.log(`The check failed (${error.message}), so the full sync will run.`);
}

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
