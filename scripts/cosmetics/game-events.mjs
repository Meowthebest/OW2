// In-game events for the Events page. They're kept by hand in data/cosmetics/curated/game-events.json from Blizzard's
// announcements, then joined here to the catalogue and the recorded shop. See docs/COSMETICS_DATA.md.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks every record and adds what the page shows beside it: the cosmetics it names, the shop bundles that hold them,
 * and how many cosmetics in the catalogue carry its event tag. Returns the file to publish and any problems found.
 */
export function buildGameEvents(core, file, { rows, bundles, eventLabels }) {
  const errors = [];
  if (!file) return { file: null, errors };
  if (file.schema !== 1 || !Array.isArray(file.events)) return { file: null, errors: ['game events: expected { "schema": 1, "events": [...] }'] };
  for (const key of ['checkedAt', 'recordedFrom']) {
    if (file[key] !== undefined && file[key] !== null && !DATE_ONLY.test(file[key])) errors.push(`game events: ${key} should be YYYY-MM-DD`);
  }

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const tagCounts = new Map();
  for (const row of rows) if (row.event) tagCounts.set(row.event, (tagCounts.get(row.event) ?? 0) + 1);
  const context = { knownCosmetic: (id) => rowById.has(id), knownTag: (id) => tagCounts.has(id) };

  const seen = new Set();
  const events = file.events.map((record) => {
    errors.push(...core.checkGameEvent(record, context));
    if (seen.has(record?.id)) errors.push(`event ${record.id}: the id is used twice`);
    seen.add(record?.id);

    const named = [...new Set([...(record.cosmetics ?? []), ...(record.rewards ?? []).map((reward) => reward.cosmeticId).filter(Boolean)])];
    const featured = named
      .map((id) => rowById.get(id))
      .filter(Boolean)
      .map(({ id, name, type, rarity, hero, image, availability }) => ({ id, name, type, rarity, hero, image, availability }));
    const holding = new Set(named);
    const related = bundles
      .filter((bundle) => bundle.items.some((item) => item.id && holding.has(item.id)))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map(({ id, name, status, image }) => ({ id, name, status, image }));
    const tag = record.cosmeticsEvent ?? null;

    return {
      id: record.id,
      name: record.name,
      kind: record.kind,
      start: record.start,
      end: record.end ?? null,
      summary: record.summary,
      image: record.image ?? null,
      modes: record.modes ?? [],
      challenges: record.challenges ?? [],
      rewards: (record.rewards ?? []).map((reward) => ({ name: reward.name, rarity: reward.rarity ?? null, track: reward.track ?? null, note: reward.note ?? null, cosmeticId: reward.cosmeticId ?? null })),
      rewardsNote: record.rewardsNote ?? null,
      pass: record.pass ?? null,
      notes: record.notes ?? [],
      cosmetics: record.cosmetics ?? [],
      cosmeticsEvent: tag,
      links: record.links ?? [],
      sources: record.sources ?? [],
      featured,
      bundles: related,
      catalogue: tag && tagCounts.has(tag) ? { event: tag, label: eventLabels.get(tag) ?? tag, count: tagCounts.get(tag) } : null,
    };
  });

  return { file: { schema: 1, checkedAt: file.checkedAt ?? null, recordedFrom: file.recordedFrom ?? null, events }, errors };
}
