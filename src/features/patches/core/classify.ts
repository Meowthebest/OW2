import type { Direction, StatCategory } from './types';

export interface ParsedLine {
  stat: string | null;
  previous: number | null;
  next: number | null;
  /** A published difference, as in "reduced by 25%" or "Added 25 Shields". No values are implied from it. */
  changeBy: number | null;
  unit: string | null;
  qualifier: string | null;
  /** A short factual label for lines with no numbers, such as "Removed". Written for this site. */
  note: string | null;
  /** +1 for "increased", -1 for "reduced", 0 when the wording states no direction. */
  verb: -1 | 0 | 1;
  sixVsSix: boolean;
  queue: 'all' | 'competitive' | 'quickplay';
}

const UP = /^(increased|raised|added)$/i;
const DOWN = /^(reduced|decreased|lowered|removed)$/i;
const VERBS = 'increased|raised|reduced|decreased|lowered|changed|adjusted';
const NUM = '[+-]?\\d*\\.?\\d+';
const ATTACHED = '(%|s|m)?';
const UNIT_WORD = '(?:\\s*(seconds?|meters?|degrees?))?';

const verbSign = (verb: string): -1 | 0 | 1 => (UP.test(verb) ? 1 : DOWN.test(verb) ? -1 : 0);

const clean = (text: string) =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** A number's unit, from the text right after it. Anything else stays a short qualifier. */
function readUnit(attached: string | undefined, tail: string | undefined): { unit: string | null; qualifier: string | null } {
  const rest = (tail ?? '').replace(/[.,;]+$/, '').trim();
  let unit: string | null = attached === '%' ? '%' : attached === 's' ? 's' : attached === 'm' ? 'm' : null;
  let qualifier: string | null = rest || null;
  const patterns: Array<[RegExp, string]> = [
    [/^meters? per second\b/i, 'm/s'],
    [/^seconds?\b/i, 's'],
    [/^meters?\b/i, 'm'],
    [/^degrees?\b/i, '°'],
    [/^per second\b/i, '/s'],
  ];
  for (const [pattern, label] of patterns) {
    const match = pattern.exec(rest);
    if (match) {
      unit = unit === '%' && label === '/s' ? '%/s' : (unit ?? label);
      qualifier = rest.slice(match[0].length).trim() || null;
      break;
    }
  }
  if (qualifier && (qualifier.split(' ').length > 5 || /^in 5v5$/i.test(qualifier))) qualifier = null;
  return { unit, qualifier };
}

const stripStat = (stat: string) =>
  stat
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+(has been|have been|is|are|was|were)$/i, '')
    .trim();

/** Short status lines carry a fact worth showing, even with nothing to compare. */
function structuralNote(text: string): string | null {
  const line = text.replace(/\.$/, '').trim();
  if (/^new( (minor|major) perk| power| item| perk| ability)?$/i.test(line)) return 'Added';
  if (/^added$/i.test(line)) return 'Added';
  if (/^removed$/i.test(line)) return 'Removed';
  if (/^changed$/i.test(line)) return 'Changed';
  if (/^reworked\b/i.test(line)) return 'Reworked';
  const moved = /^(?:.{0,40}\s)?moved from (major|minor)(?: perk)? to (major|minor)(?: perk)?$/i.exec(line);
  if (moved) return `Moved to ${moved[2].charAt(0).toUpperCase()}${moved[2].slice(1).toLowerCase()} Perk`;
  if (/^moved from perk to baseline\b/i.test(line)) return 'Moved to baseline';
  const removedThing = /^([A-Z][\w' -]{1,30}) removed$/.exec(line);
  if (removedThing) return `${removedThing[1]} removed`;
  return null;
}

/**
 * Pulls the published facts out of one change line. Lines that are not a plain numeric change
 * come back with no values, and the classifier then leaves them for review.
 */
export function parseLine(raw: string): ParsedLine {
  let text = clean(raw);
  const sixVsSix = /\b6v6\b/i.test(text);
  const queue = /\(competitive( only)?\)/i.test(text) ? 'competitive' : /\(quick ?play( only)?\)/i.test(text) ? 'quickplay' : 'all';
  text = text
    .replace(/\s*\((6v6|5v5|competitive( only)?|quick ?play( only)?)\)\s*/gi, ' ')
    .replace(/\s+in 6v6\b/gi, '')
    .replace(/^6v6:?\s+/i, '')
    .trim();

  const base: ParsedLine = { stat: null, previous: null, next: null, changeBy: null, unit: null, qualifier: null, note: null, verb: 0, sixVsSix, queue };

  const note = structuralNote(text);
  if (note) return { ...base, note };
  if (text.startsWith('"')) return base;

  const line = text.replace(/\.$/, '');
  let match: RegExpExecArray | null;

  // "Added 25 Shields." or "Removed 20% Ability Power." State a difference and nothing else.
  match = new RegExp(`^(added|removed)\\s+(${NUM})(%)?\\s+([A-Za-z][\\w' -]{1,30})$`, 'i').exec(line);
  if (match) {
    const sign = verbSign(match[1]);
    return { ...base, stat: stripStat(match[4]), verb: sign, changeBy: sign * Math.abs(Number(match[2])), unit: match[3] ? '%' : null };
  }
  if (/^(added|removed|new|now)\b/i.test(text)) return base;

  // "Reduced recovery after the ability from 0.2 to 0.1 seconds."
  match = new RegExp(`^(increased|reduced|decreased|raised|lowered)\\s+(?:the\\s+)?(.{1,70}?)\\s+from\\s+(${NUM})${ATTACHED}${UNIT_WORD}\\s+to\\s+(${NUM})${ATTACHED}(?:\\s+(.{0,40}))?$`, 'i').exec(line);
  if (match) {
    const { unit, qualifier } = readUnit(match[7] ?? match[4], match[8] ?? match[5]);
    return { ...base, stat: stripStat(match[2]), verb: verbSign(match[1]), previous: Number(match[3]), next: Number(match[6]), unit, qualifier };
  }

  // "Damage increased from 22 to 24." "Cooldown decreased from 7 seconds to 6 seconds." "Damage reduced per rocket from 40 to 30."
  match = new RegExp(`^(.{1,90}?)\\s+(${VERBS})(?:\\s+(per [\\w ]{1,30}?))?\\s+from\\s+(${NUM})${ATTACHED}${UNIT_WORD}\\s+to\\s+(${NUM})${ATTACHED}(?:\\s+(.{0,40}))?$`, 'i').exec(line);
  if (match) {
    const { unit, qualifier } = readUnit(match[8] ?? match[5], match[9] ?? match[6]);
    return { ...base, stat: stripStat(match[3] ? `${match[1]} ${match[3]}` : match[1]), verb: verbSign(match[2]), previous: Number(match[4]), next: Number(match[7]), unit, qualifier };
  }

  // "Collateral range gain reduced 75% to 40%."
  match = new RegExp(`^(.{1,90}?)\\s+(${VERBS})\\s+(${NUM})(%|s|m)\\s+to\\s+(${NUM})(%|s|m)$`, 'i').exec(line);
  if (match) {
    return { ...base, stat: stripStat(match[1]), verb: verbSign(match[2]), previous: Number(match[3]), next: Number(match[5]), unit: readUnit(match[6], '').unit };
  }

  // "Lifesteal reduced to 3% (Down from 4%)." Stadium notes state the new value first.
  match = new RegExp(`^(.{1,90}?)\\s+(${VERBS})\\s+to\\s+(${NUM})${ATTACHED}(?:\\s+(.{0,40}?))?\\s*\\((?:up|down)\\s+from\\s+(${NUM})${ATTACHED}[^)]*\\)$`, 'i').exec(text.replace(/\.$/, ''));
  if (match) {
    const { unit, qualifier } = readUnit(match[4] ?? match[7], match[5]);
    return { ...base, stat: stripStat(match[1]), verb: verbSign(match[2]), previous: Number(match[6]), next: Number(match[3]), unit, qualifier };
  }

  // "Reduced ignore range to 7m (Down from 10m)."
  match = new RegExp(`^(increased|reduced|decreased)\\s+(.{1,70}?)\\s+to\\s+(${NUM})${ATTACHED}\\s*\\((?:up|down)\\s+from\\s+(${NUM})${ATTACHED}[^)]*\\)$`, 'i').exec(line);
  if (match) {
    return { ...base, stat: stripStat(match[2]), verb: verbSign(match[1]), previous: Number(match[5]), next: Number(match[3]), unit: readUnit(match[4] ?? match[6], '').unit };
  }

  // "Healing amplification reduced by 65%." States a difference only, so no values are implied.
  match = new RegExp(`^([A-Z][\\w\\s/'()-]{1,60}?)\\s+(increased|reduced|decreased|lowered|raised)\\s+by\\s+(${NUM})(%|s|m)?(?:\\s+(seconds?|meters?))?$`, 'i').exec(line);
  if (match) {
    const sign = verbSign(match[2]);
    return { ...base, stat: stripStat(match[1]), verb: sign, changeBy: sign * Math.abs(Number(match[3])), unit: readUnit(match[4], match[5]).unit };
  }

  // "Cooldown reduced to 7.5 seconds." The new value is published and the old one is not.
  match = new RegExp(`^([A-Z][\\w\\s/'()-]{1,60}?)\\s+(increased|reduced|decreased|lowered|raised)\\s+to\\s+(${NUM})${ATTACHED}(?:\\s+(.{0,30}))?$`, 'i').exec(line);
  if (match) {
    const { unit, qualifier } = readUnit(match[4], match[5]);
    return { ...base, stat: stripStat(match[1]), verb: verbSign(match[2]), next: Number(match[3]), unit, qualifier };
  }

  // "Cast time is 0.5 seconds." A stated value, with no direction.
  match = new RegExp(`^([A-Z][a-z][\\w\\s'-]{1,40}?)\\s+(?:is|are)\\s+(?:now\\s+)?(${NUM})${ATTACHED}(?:\\s+(.{0,30}))?$`).exec(line);
  if (match) {
    const { unit, qualifier } = readUnit(match[3], match[4]);
    return { ...base, stat: stripStat(match[1]), next: Number(match[2]), unit, qualifier };
  }

  return base;
}

// Wording where a bigger number is not reliably better or worse. These always go to review.
const AMBIGUOUS = /^reduced\b|knockback|threshold|\benem(y|ies)\b|hit ?(box|volume)|\bslow|damage fall-?off|fall-?off (damage|scalar)|eliminations?\b|currency|\bpull\b|\bhitstun\b|healing reduction|anti-?heal|speed reduction|minimum (deploy|active)|reduced damage/i;
// Checked before the wider lists because they contain words from them.
const LOWER_PHRASES = /\brequired\b|\bdrain\b/i;
const HIGHER_PHRASES = /\b(reduction|refund|refunded)\b|reload speed|cast speed|attack speed|fire rate|rate of fire|shots per second|shots until|charge speed|recovery speed|reduction amount|ultimate charge (gain|gained|generation|rate)|charge rate|recharge rate|fall-?off (range|distance)|minimum fall-?off|fall-?off minimum|number of|pellet count|projectile count/i;
const LOWER_BETTER = /cooldown|cast (time|duration)|recovery|reload time|\breload\b|spread|recoil|delay|wind-?up|time to|charge time|detonation time|move time|lockout|\bcost\b|penalty|damage taken|self[- ]damage|time between|downtime|interval|experience required/i;
const HIGHER_BETTER = /health|armor|shields?\b|overhealth|damage|healing|\bheals?\b|lifesteal|\bammo\b|duration|range|radius|speed|acceleration|regeneration|\bregen\b|projectile size|charges\b|resistance|weaken|\bpower\b|amplification|bonus|capacity|\bfuel\b|accuracy/i;

export type Polarity = 'higher' | 'lower' | 'unknown';

export function statPolarity(stat: string | null): Polarity {
  if (!stat || AMBIGUOUS.test(stat)) return 'unknown';
  if (LOWER_PHRASES.test(stat)) return 'lower';
  if (HIGHER_PHRASES.test(stat)) return 'higher';
  if (LOWER_BETTER.test(stat)) return 'lower';
  if (HIGHER_BETTER.test(stat)) return 'higher';
  return 'unknown';
}

const QOL_WORDS = /\b(visual effects?|vfx|sfx|sound (effects?|priority|volume|cues?)|audio|ui element|hud|indicator|reticle|accessibility|now visible|voice lines?)\b/i;

/**
 * Rule-based direction for one line. A lower number can be a buff, so direction comes from what the
 * stat means. When the wording and the numbers disagree, or the stat is ambiguous, it needs review.
 */
export function classifyLine(line: ParsedLine, rawText: string): Direction {
  const text = clean(rawText);
  if (/^fixed\b/i.test(text)) return 'bugfix';
  if (QOL_WORDS.test(text) && !/\d/.test(text)) return 'qol';
  if (line.note) return 'needs-review';

  const hasBoth = line.previous !== null && line.next !== null;
  const delta = line.changeBy ?? (hasBoth ? (line.next as number) - (line.previous as number) : line.next !== null && line.verb !== 0 ? line.verb : null);
  if (delta === null || delta === 0) return 'needs-review';
  // "Damage increased to 50% reduced damage (Up from 60% reduced)": the words and numbers point opposite ways.
  if (line.verb !== 0 && Math.sign(delta) !== line.verb) return 'needs-review';

  const polarity = statPolarity(line.stat);
  if (polarity === 'unknown') return 'needs-review';
  const better = polarity === 'higher' ? delta > 0 : delta < 0;
  return better ? 'buff' : 'nerf';
}

export function statCategories(stat: string | null, ability: string | null): StatCategory[] {
  const text = stat ?? '';
  const categories = new Set<StatCategory>();
  if (/\bhealth\b|\bhp\b|shields?\b|overhealth/i.test(text) && !/health pack|health bar/i.test(text)) categories.add('health');
  if (/\barmor\b/i.test(text)) categories.add('armor');
  if (/damage|dps|\bcrit/i.test(text) && !/damage reduction|damage taken|reduced damage/i.test(text)) categories.add('damage');
  if (/\bheal(s|ing|ed)?\b|lifesteal/i.test(text)) categories.add('healing');
  if (/cooldown|cast time|recovery|reload|charge time|time to/i.test(text)) categories.add('cooldown');
  const movesAbility = /momentum|dash|leap|flight|boost|sprint|slide|jump|glide|hover/i.test(ability ?? '');
  const movesStat = /move(ment)? speed|\bmove\b|acceleration|leap|dash|\bjump|fuel|flight|sprint|hover|glide|\bslide\b/i.test(text);
  const speedOnly = /\bspeed\b/i.test(text) && !/attack speed|reload speed|cast speed|projectile speed|charge speed|recovery speed|swing speed/i.test(text);
  if (movesStat || (movesAbility && speedOnly)) categories.add('mobility');
  if (/\bammo\b/i.test(text)) categories.add('ammo');
  return [...categories];
}

/** Percent difference, only when both published values exist and a ratio means something. */
export function percentChange(previous: number | null, next: number | null): number | null {
  if (previous === null || next === null || previous === 0) return null;
  return Math.round(((next - previous) / Math.abs(previous)) * 1000) / 10;
}

export const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A stat's key across patches, so "Base health" and "Deflect duration" line up with "health" and "duration". */
export function seriesStat(stat: string, ability: string | null) {
  let key = stat.toLowerCase().replace(/^base\s+/, '');
  if (ability) {
    const name = ability.toLowerCase().replace(/\s*\(.*\)$/, '');
    if (key.startsWith(`${name} `)) key = key.slice(name.length + 1);
  }
  return slug(key);
}

/** Canonical form of a source line for fingerprinting, so spacing and quote style do not count as edits. */
export const normalizeForHash = (text: string) => clean(text).toLowerCase();
