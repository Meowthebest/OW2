// Reads team pages exported from Liquipedia by hand (Special:Export) into the Guess the Pro player list.
// Liquipedia's terms don't allow scripts to read its pages, and its API is for editing, so a person exports them.
// Nothing here contacts Liquipedia. See docs/ESPORTS_DATA.md.
import { readExport, templateParams } from '../cosmetics/wiki.mjs';

export const LIQUIPEDIA = 'https://liquipedia.net/overwatch/';
export const pageLink = (title) => `${LIQUIPEDIA}${encodeURIComponent(title.trim().replace(/ /g, '_')).replace(/%2F/g, '/')}`;

const REGION_WORDS = [
  [/north america|^na$|americas/i, 'na'],
  [/emea|europe|middle east/i, 'emea'],
  [/korea/i, 'kr'],
  [/china|chinese/i, 'cn'],
  [/japan/i, 'jp'],
  [/pacific|asia|oceania/i, 'pac'],
];
export const regionFrom = (text) => REGION_WORDS.find(([pattern]) => pattern.test(String(text ?? '').trim()))?.[1] ?? null;

/** Liquipedia's flag names that aren't plain country codes. */
const FLAG_CODES = { uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', usa: 'US', korea: 'KR', 'south korea': 'KR', china: 'CN', taiwan: 'TW', japan: 'JP' };
export function nationalityFrom(flag) {
  const value = String(flag ?? '').trim().toLowerCase();
  if (!value) return null;
  if (FLAG_CODES[value]) return FLAG_CODES[value];
  return /^[a-z]{2}$/.test(value) ? value.toUpperCase() : null;
}

/** Role and specialty from Liquipedia's role or position text, such as "dps", "Hitscan" or "Flex Support". Staff give null. */
export function roleFrom(text) {
  const value = String(text ?? '').toLowerCase().replace(/[_-]/g, ' ').trim();
  if (!value || /coach|manager|analyst|owner|ceo|staff|caster|substitute coach/.test(value)) return null;
  if (/tank/.test(value)) return { role: 'tank', specialty: null };
  if (/support|healer|heal/.test(value)) return { role: 'support', specialty: /main/.test(value) ? 'main-support' : /flex/.test(value) ? 'flex-support' : null };
  if (/dps|damage|hitscan|projectile|attack/.test(value)) return { role: 'damage', specialty: /hitscan/.test(value) ? 'hitscan' : /projectile/.test(value) ? 'projectile' : /flex/.test(value) ? 'flex' : null };
  if (/^flex$/.test(value)) return { role: 'flex', specialty: null };
  return null;
}

export const slug = (text) => String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every call of the named templates in a page, nested or not, with the heading and squad block it sits in. */
function findCalls(text, names) {
  const calls = [];
  const opener = /\{\{\s*([^|{}]+?)\s*(?=\||\}\})/g;
  for (const match of text.matchAll(opener)) {
    const name = match[1].trim().toLowerCase().replace(/_/g, ' ');
    if (!names.test(name)) continue;
    let depth = 0;
    let end = match.index;
    for (; end < text.length - 1; end += 1) {
      const pair = text.slice(end, end + 2);
      if (pair === '{{') { depth += 1; end += 1; } else if (pair === '}}') { depth -= 1; end += 1; if (depth === 0) break; }
    }
    const body = text.slice(match.index + 2, end - 1);
    const before = text.slice(0, match.index);
    const heading = [...before.matchAll(/^=+\s*([^=\n]+?)\s*=+\s*$/gm)].at(-1)?.[1] ?? '';
    // The squad block it's in: {{SquadStart|type=former}}, {{FormerSquad|...}}, {{ActiveSquad|...}} and so on.
    const block = [...before.matchAll(/\{\{\s*(SquadStart|Squad start|ActiveSquad|Active Squad|FormerSquad|Former Squad|InactiveSquad|Inactive Squad|Squad)\b([^{}]*)/gi)].at(-1);
    calls.push({ ...templateParams(body), heading, block: block ? `${block[1]} ${block[2]}` : '' });
  }
  return calls;
}

const PLAYER_TEMPLATES = /^(squad ?player|squadplayer|squad row|squadrow|roster player)$/;
const NOT_ACTIVE = /former|inactive|retired|loan|staff|organi[sz]ation|management|coach|history/i;

/** One team page: its name, region and the players on its active roster. */
export function readTeamPage(page) {
  const infobox = findCalls(page.text, /^infobox team$/)[0]?.named ?? {};
  const name = (infobox.name || page.title).replace(/\[\[|\]\]/g, '').trim();
  const players = [];
  for (const call of findCalls(page.text, PLAYER_TEMPLATES)) {
    const params = call.named;
    if (params.leavedate || params.inactivedate || /^(former|inactive|loan)$/i.test(params.status ?? '') || /former|inactive|staff|retired/i.test(params.type ?? '')) continue;
    if (NOT_ACTIVE.test(call.heading) || NOT_ACTIVE.test(call.block)) continue;
    const handle = (params.id || params.player || '').replace(/\[\[|\]\]/g, '').trim();
    const role = roleFrom(params.role || params.position || params.pos);
    if (!handle || !role) continue;
    const joined = /^(\d{4})/.exec(params.joindate ?? params.join ?? '')?.[1];
    players.push({
      name: handle,
      nationality: nationalityFrom(params.flag || params.nationality || params.country),
      ...role,
      joined: joined ? Number(joined) : null,
      page: pageLink(params.link || handle),
    });
  }
  return { title: page.title, name, region: regionFrom(infobox.region), timestamp: page.timestamp, players };
}

/**
 * Builds the published list from export files. `regions` maps a team's page title to its OWCS region, from
 * data/esports/teams.json, and wins over the page's own infobox. Returns the data and anything worth a look.
 */
export function buildProData(xmlFiles, { regions = {}, season = '2026' } = {}) {
  const pages = xmlFiles.flatMap((xml) => {
    const exported = readExport(xml);
    if (exported.sitename && !/liquipedia/i.test(exported.sitename)) throw new Error(`This export is from ${exported.sitename}, not Liquipedia.`);
    return exported.pages;
  });
  const notes = [];
  const teams = [];
  const players = [];
  const ids = new Set();
  for (const page of pages) {
    const team = readTeamPage(page);
    if (team.players.length === 0) {
      notes.push(`${page.title}: no active players found, so it's left out`);
      continue;
    }
    const region = regions[page.title] ?? regions[team.name] ?? team.region;
    if (!region) {
      notes.push(`${page.title}: no region. Add it to data/esports/teams.json`);
      continue;
    }
    const teamId = slug(team.name);
    teams.push({ id: teamId, name: team.name, region, page: pageLink(page.title) });
    for (const player of team.players) {
      let id = slug(player.name);
      if (!id) continue;
      if (ids.has(id)) id = `${id}-${teamId}`;
      ids.add(id);
      players.push({ id, team: teamId, ...player });
      if (!player.nationality) notes.push(`${player.name} (${team.name}): no nationality`);
    }
  }
  const stamps = pages.map((page) => page.timestamp).filter(Boolean).sort();
  return {
    data: { schema: 1, season, exportedAt: stamps.at(-1) ?? null, teams: teams.sort((a, b) => a.name.localeCompare(b.name)), players: players.sort((a, b) => a.id.localeCompare(b.id)) },
    notes,
  };
}
