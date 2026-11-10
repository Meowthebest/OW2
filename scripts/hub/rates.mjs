// A daily copy of Blizzard's hero rates, so the Stats page can show how they moved from one day to the next.
// Read through the community-run OverFast API, as the page itself does. Twelve requests a day: both inputs, both
// modes and all three regions, over all maps and all ranks. Narrower selections are only shown live.

export const OVERFAST = 'https://overfast-api.tekrop.fr';

export const RATE_VIEWS = ['pc', 'console'].flatMap((platform) =>
  ['quickplay', 'competitive'].flatMap((mode) => ['americas', 'asia', 'europe'].map((region) => ({ platform, mode, region, key: `${platform}/${mode}/${region}` }))),
);

export const viewUrl = (view) => `${OVERFAST}/heroes/stats?platform=${view.platform}&gamemode=${view.mode}&region=${view.region}`;

const rate = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null);

/** One view's rows, compact and in hero order: [hero, pick, win, ban]. A short answer means something went wrong upstream. */
export function compactRates(answer) {
  if (!Array.isArray(answer)) throw new Error('OverFast sent something other than a list of heroes');
  const rows = answer
    .filter((row) => row && typeof row.hero === 'string' && /^[a-z0-9-]+$/.test(row.hero))
    .map((row) => [row.hero, rate(row.pickrate), rate(row.winrate), rate(row.banrate)]);
  if (rows.length < 10) throw new Error(`only ${rows.length} heroes came back`);
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Days are UTC dates, so each run of the job knows the same "today". */
export const dayOf = (time) => new Date(time).toISOString().slice(0, 10);

/** Adds a day to the list, newest first, keeping `keep` of them. Says which days fell off, so their files go too. */
export function updateIndex(index, day, { keep = 90 } = {}) {
  const days = [...new Set([day, ...(index?.days ?? [])])].sort().reverse();
  return { index: { days: days.slice(0, keep) }, dropped: days.slice(keep) };
}

/** Problems with one day's file, as sentences. */
export function checkRatesDay(file, day) {
  const problems = [];
  if (!file || file.day !== day) return [`${day}: the file is for another day`];
  if (!Number.isFinite(Date.parse(file.recordedAt))) problems.push(`${day}: the time it was recorded can't be read`);
  for (const view of RATE_VIEWS) {
    const rows = file.views?.[view.key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.length < 10) problems.push(`${day} ${view.key}: too few heroes`);
    else if (rows.some((row) => !Array.isArray(row) || typeof row[0] !== 'string' || row.slice(1).some((value) => value !== null && !(value >= 0 && value <= 100)))) problems.push(`${day} ${view.key}: a row isn't [hero, pick, win, ban]`);
  }
  if (!Object.keys(file.views ?? {}).length) problems.push(`${day}: no views recorded`);
  return problems;
}
