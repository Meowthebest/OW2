import { percentChange } from './classify';
import { countPatch } from './rollup';
import type { Direction, PatchFile, PatchIndex } from './types';

const OFFICIAL_SOURCE = /^https:\/\/overwatch\.blizzard\.com\/en-us\/news\/patch-notes\/live\/\d{4}\/\d{2}\/#patch-\d{4}-\d{2}-\d{2}$/;
const DIRECTIONS: readonly Direction[] = ['buff', 'nerf', 'neutral', 'qol', 'bugfix', 'needs-review'];

// Stored text is labels and short summaries. Anything longer would suggest source wording got stored by accident.
const MAX_LABEL = 100;
const MAX_SUMMARY = 220;

/** Checks a stored patch for internal consistency and provenance. Returns a list of problems, empty when sound. */
export function validatePatch(patch: PatchFile): string[] {
  const problems: string[] = [];
  const problem = (text: string) => problems.push(`${patch.id}: ${text}`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.id) || patch.date !== patch.id) problem('id and date must be the same YYYY-MM-DD');
  if (!OFFICIAL_SOURCE.test(patch.sourceUrl)) problem(`source is not the official patch notes page: ${patch.sourceUrl}`);
  if (patch.forumUrl && !patch.forumUrl.startsWith('https://us.forums.blizzard.com/')) problem(`forum link is not Blizzard's forum: ${patch.forumUrl}`);
  if (!Number.isFinite(Date.parse(patch.lastVerifiedAt))) problem('missing last verified time');
  if (!Number.isFinite(Date.parse(patch.firstImportedAt))) problem('missing first imported time');
  if (!patch.contentHash) problem('missing content hash');

  const ids = new Set<string>();
  for (const change of patch.changes) {
    if (ids.has(change.id)) problem(`duplicate change id ${change.id}`);
    ids.add(change.id);
    if (!change.id.startsWith(`${patch.id}/`)) problem(`change ${change.id} does not belong to this patch`);
    if (!/^[0-9a-f]{16}$/.test(change.sourceHash)) problem(`change ${change.id} has no source fingerprint`);
    if (!DIRECTIONS.includes(change.direction)) problem(`change ${change.id} has an unknown direction`);
    if (change.classifiedBy === 'none' && change.direction !== 'needs-review') problem(`change ${change.id} has a direction but no classifier`);
    for (const value of [change.previous, change.next, change.changeBy]) {
      if (value !== null && !Number.isFinite(value)) problem(`change ${change.id} has a value that is not a number`);
    }
    // A percent must come from two published values. Reviews may clear it where a ratio would mislead, but never add one.
    if (change.percentChange !== null) {
      const expected = percentChange(change.previous, change.next);
      if (expected === null || Math.abs(expected - change.percentChange) > 0.05) problem(`change ${change.id} has a percent that its values do not support`);
    }
    if (change.series && (change.previous === null || change.next === null)) problem(`change ${change.id} is in a series without both values`);
    for (const label of [change.stat, change.note, change.qualifier, change.ability]) {
      if (label && label.length > MAX_LABEL) problem(`change ${change.id} has an unusually long label`);
    }
    if (change.summary && change.summary.length > MAX_SUMMARY) problem(`change ${change.id} has an unusually long summary`);
  }

  for (const note of patch.notes) {
    if ((note.summary?.length ?? 0) > MAX_SUMMARY) problem(`note for ${note.heroId} has an unusually long summary`);
    if ((note.devIntent?.length ?? 0) > MAX_SUMMARY) problem(`note for ${note.heroId} has an unusually long developer summary`);
  }

  const otherIds = new Set<string>();
  for (const item of patch.other) {
    if (otherIds.has(item.id)) problem(`duplicate item id ${item.id}`);
    otherIds.add(item.id);
    if ((item.summary?.length ?? 0) > MAX_SUMMARY) problem(`item ${item.id} has an unusually long summary`);
    if ((item.title?.length ?? 0) > MAX_LABEL) problem(`item ${item.id} has an unusually long title`);
  }

  const otherFixes = patch.other.filter((item) => item.section === 'bugfix').length;
  if (JSON.stringify(countPatch(patch.changes, otherFixes)) !== JSON.stringify(patch.counts)) problem('stored counts do not match its lines');
  return problems;
}

export function validateIndex(index: PatchIndex, patches: PatchFile[]): string[] {
  const problems: string[] = [];
  const stored = new Map(patches.map((patch) => [patch.id, patch]));
  if (index.patches.length !== patches.length) problems.push(`index lists ${index.patches.length} patches but ${patches.length} are stored`);
  let last = '9999';
  for (const meta of index.patches) {
    if (meta.date >= last) problems.push(`index is not newest first at ${meta.id}`);
    last = meta.date;
    const patch = stored.get(meta.id);
    if (!patch) problems.push(`index lists ${meta.id} but it is not stored`);
    else if (patch.contentHash !== meta.contentHash) problems.push(`index and stored file disagree for ${meta.id}`);
  }
  return problems;
}
