import { normalizePlayerId } from './requests';

export type PlayerQuery =
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'id'; id: string }
  | { kind: 'battletag'; tag: string; name: string }
  | { kind: 'name'; name: string };

const HEX_ID = /^[0-9a-f]{8,}(\||%7C)[0-9a-f]{8,}$/i;
const BATTLETAG = /^([^\s#/\\?&]{2,})[#-](\d{3,8})$/;
const NAME = /^[^\s#/\\?&]{2,32}$/;

/** Accepts a BattleTag, a player name, a Blizzard hex id, or a Blizzard or OverFast profile URL. */
export function parsePlayerQuery(raw: string): PlayerQuery {
  const input = raw.trim();
  if (!input) return { kind: 'empty' };

  if (/^https?:\/\//i.test(input) || /^(overwatch\.blizzard\.com|overfast-api\.tekrop\.fr)\//i.test(input)) {
    let url: URL;
    try {
      url = new URL(/^https?:/i.test(input) ? input : `https://${input}`);
    } catch {
      return { kind: 'invalid', reason: 'That link could not be read.' };
    }
    const pattern = url.hostname.endsWith('overwatch.blizzard.com')
      ? /\/career\/([^/?#]+)/
      : url.hostname === 'overfast-api.tekrop.fr'
        ? /\/players\/([^/?#]+)/
        : null;
    if (!pattern) return { kind: 'invalid', reason: 'Only Overwatch career links from overwatch.blizzard.com are supported.' };
    const match = pattern.exec(url.pathname);
    if (!match) return { kind: 'invalid', reason: 'That link does not point to a career profile.' };
    return { kind: 'id', id: normalizePlayerId(match[1]) };
  }

  if (HEX_ID.test(input)) return { kind: 'id', id: normalizePlayerId(input) };

  const tag = BATTLETAG.exec(input);
  if (tag) return { kind: 'battletag', tag: `${tag[1]}-${tag[2]}`, name: tag[1] };

  if (NAME.test(input)) return { kind: 'name', name: input };
  return { kind: 'invalid', reason: 'Enter a BattleTag like Name#1234, an exact player name, or a career profile link.' };
}
