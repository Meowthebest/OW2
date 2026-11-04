import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, ExternalLink, Wrench } from 'lucide-react';
import { Panel, SelectField, StateBlock } from '../../../components/controls';
import { HeroPortrait } from '../../../components/media';
import { HERO_BY_ID } from '../../../data/heroes';
import { cn } from '../../../lib/format';
import type { CardGroup, PatchFile, PatchIndex, PatchMeta } from '../core/types';
import { loadHeroHistory, loadPatches, useAsync, usePaged } from '../data';
import { latestBalancePatch } from '../filters';
import { CLASS_LABEL, formatDifference, formatMonth, formatPatchDate, formatValue, SCOPE_LABEL } from '../format';
import { comparePatches, repeatedChanges, type CompareSide } from '../history';
import { AbilityTimeline } from './AbilityTimeline';
import { ClassBadge } from './Direction';
import { typeLabel } from './PatchHeader';

const PAGE = 15;

interface HistoryState {
  season: string;
  month: string;
  a: string;
  b: string;
  group: CardGroup;
  repeatSeason: string;
  repeatGroup: CardGroup;
  hero: string;
  series: string;
}

function parseHistory(query: string, index: PatchIndex): HistoryState {
  const params = new URLSearchParams(query);
  const balance = index.patches.filter((patch) => patch.counts.gameplayChanges > 0);
  const known = (id: string | null) => (id && index.patches.some((patch) => patch.id === id) ? id : null);
  const group = (value: string | null): CardGroup => (value === 'stadium' || value === 'limited' ? value : 'standard');
  return {
    season: params.get('season') ?? 'all',
    month: params.get('month') ?? 'all',
    a: known(params.get('a')) ?? balance[1]?.id ?? index.patches[1]?.id ?? '',
    b: known(params.get('b')) ?? balance[0]?.id ?? index.patches[0]?.id ?? '',
    group: group(params.get('group')),
    repeatSeason: params.get('repeat') ?? 'all',
    repeatGroup: group(params.get('repeatGroup')),
    hero: params.get('hero') ?? 'genji',
    series: params.get('series') ?? '',
  };
}

function serializeHistory(state: HistoryState, index: PatchIndex) {
  const defaults = parseHistory('', index);
  const params = new URLSearchParams();
  (Object.keys(state) as Array<keyof HistoryState>).forEach((key) => {
    const name = key === 'repeatSeason' ? 'repeat' : key;
    if (state[key] && state[key] !== defaults[key]) params.set(name, state[key]);
  });
  return params.toString();
}

function PatchTallies({ patch }: { patch: PatchMeta }) {
  const { counts } = patch;
  return (
    <span className="patch-row__tallies">
      <span className="count-chip" data-direction="buff"><ArrowUp size={13} strokeWidth={2.8} aria-hidden="true" />{counts.heroesBuffed}<span className="sr-only"> heroes buffed</span></span>
      <span className="count-chip" data-direction="nerf"><ArrowDown size={13} strokeWidth={2.8} aria-hidden="true" />{counts.heroesNerfed}<span className="sr-only"> heroes nerfed</span></span>
      <span className="count-chip" data-direction="mixed"><ArrowLeftRight size={13} strokeWidth={2.8} aria-hidden="true" />{counts.heroesMixed}<span className="sr-only"> heroes mixed</span></span>
      <span className="count-chip"><Wrench size={13} aria-hidden="true" />{counts.bugFixes}<span className="sr-only"> bug fixes</span></span>
    </span>
  );
}

function PatchBrowser({ index, state, update }: { index: PatchIndex; state: HistoryState; update: (partial: Partial<HistoryState>) => void }) {
  const [visible, showMore] = usePaged(PAGE, `${state.season}|${state.month}`);
  const inSeason = state.season === 'all' ? index.patches : index.patches.filter((patch) => patch.season?.id === state.season);
  const months = [...new Set(inSeason.map((patch) => patch.date.slice(0, 7)))];
  const list = state.month === 'all' ? inSeason : inSeason.filter((patch) => patch.date.startsWith(state.month));

  return (
    <Panel eyebrow="Chronological" title="Browse patches" className="patch-panel">
      <div className="timeline__controls">
        <SelectField label="Season" value={state.season} onChange={(season) => update({ season, month: 'all' })}>
          <option value="all">All seasons</option>
          {[...index.seasons].reverse().map((season) => <option key={season.start} value={`${season.year}-s${season.number}`}>Season {season.number} ({season.year})</option>)}
        </SelectField>
        <SelectField label="Month" value={state.month} onChange={(month) => update({ month })}>
          <option value="all">All months</option>
          {months.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
        </SelectField>
      </div>

      {list.length === 0 ? (
        <StateBlock title="No patches in this range">Try another season or month.</StateBlock>
      ) : (
        <ol className="patch-list">
          {list.slice(0, visible).map((patch) => (
            <li key={patch.id} className="patch-row">
              <a className="patch-row__main" href={`#/patches?patch=${patch.id}`}>
                <span className="patch-row__date">{formatPatchDate(patch.date, 'short')}</span>
                <span className="patch-row__title">{patch.title || typeLabel(patch.type)}</span>
                <span className="patch-row__tags">
                  {patch.season && <span className="tag">{patch.season.label}</span>}
                  <span className="tag">{typeLabel(patch.type)}</span>
                  {patch.reviewedAt && <span className="tag tag--accent">Reviewed</span>}
                  {patch.counts.stadiumChanges > 0 && <span className="tag">Stadium {patch.counts.stadiumChanges}</span>}
                  {patch.counts.limitedChanges > 0 && <span className="tag">Limited mode {patch.counts.limitedChanges}</span>}
                </span>
              </a>
              <PatchTallies patch={patch} />
              <a className="patch-row__source" href={patch.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Official notes for ${formatPatchDate(patch.date)}`}>
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      )}
      <div className="patch-list__foot">
        <span>Showing {Math.min(visible, list.length)} of {list.length} patches</span>
        {visible < list.length && <button type="button" className="btn-plain" onClick={showMore}>Show more</button>}
      </div>
    </Panel>
  );
}

function CompareCell({ side }: { side: CompareSide | null }) {
  if (!side) return <span className="compare__none">No change</span>;
  return (
    <span className="compare__cell">
      <ClassBadge classification={side.rollup.classification} />
      <small>{side.rollup.buffs} up, {side.rollup.nerfs} down{side.rollup.review ? `, ${side.rollup.review} review` : ''}</small>
    </span>
  );
}

function PatchCompare({ index, state, update }: { index: PatchIndex; state: HistoryState; update: (partial: Partial<HistoryState>) => void }) {
  const ids = [state.a, state.b];
  const files = useAsync<PatchFile[]>(() => loadPatches(ids), ids.join('|'));
  const [a, b] = files.data ?? [];
  const comparison = useMemo(() => (a && b && a.id === state.a && b.id === state.b ? comparePatches(a, b, state.group) : null), [a, b, state.a, state.b, state.group]);
  const option = (patch: PatchMeta) => <option key={patch.id} value={patch.id}>{formatPatchDate(patch.date, 'short')} · {typeLabel(patch.type)}</option>;

  return (
    <Panel eyebrow="Side by side" title="Compare two patches" className="patch-panel">
      <div className="timeline__controls">
        <SelectField label="Patch A" value={state.a} onChange={(value) => update({ a: value })}>{index.patches.map(option)}</SelectField>
        <SelectField label="Patch B" value={state.b} onChange={(value) => update({ b: value })}>{index.patches.map(option)}</SelectField>
        <SelectField label="Format" value={state.group} onChange={(value) => update({ group: value as CardGroup })}>
          <option value="standard">Standard play</option>
          <option value="stadium">Stadium</option>
          <option value="limited">Limited-time modes</option>
        </SelectField>
      </div>
      {files.status === 'error' && (
        <StateBlock tone="error" title="Could not load those patches" actions={<button type="button" className="btn-plain" onClick={files.retry}>Try again</button>} />
      )}
      {files.status === 'loading' && !comparison && <div className="skeleton" aria-hidden="true"><span /><span /><span /></div>}
      {comparison && (
        <>
          <p className="patches-note">
            {comparison.both} {comparison.both === 1 ? 'hero' : 'heroes'} changed in both, {comparison.onlyA} only in A, {comparison.onlyB} only in B. Results describe each patch on its own, with nothing inferred between them.
          </p>
          {comparison.rows.length === 0 ? (
            <StateBlock title="No hero changes in this format">Neither patch lists a hero change here.</StateBlock>
          ) : (
            <div className="timeline__table-wrap">
              <table className="data-table compare">
                <thead>
                  <tr>
                    <th scope="col">Hero</th>
                    <th scope="col">A: {formatPatchDate(state.a, 'short')}</th>
                    <th scope="col">B: {formatPatchDate(state.b, 'short')}</th>
                    <th scope="col" className="compare__shared-head">Same stat in both</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.heroId}>
                      <th scope="row"><a className="compare__hero" href={`#/patches?open=${row.heroId}&at=${row.b ? state.b : state.a}`}>{row.heroName}</a></th>
                      <td><CompareCell side={row.a} /></td>
                      <td><CompareCell side={row.b} /></td>
                      <td className="compare__shared">
                        {row.shared.length === 0 ? <span className="compare__none">None</span> : row.shared.map(({ series, a: left, b: right }) => (
                          <span key={series} className="compare__stat">
                            <b>{[left.ability, left.stat].filter(Boolean).join(' · ')}</b>
                            <small>A: {formatValue(left.previous as number, left.unit)} → {formatValue(left.next as number, left.unit)} ({formatDifference(left)}). B: {formatValue(right.previous as number, right.unit)} → {formatValue(right.next as number, right.unit)} ({formatDifference(right)})</small>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function RepeatedPanel({ index, state, update }: { index: PatchIndex; state: HistoryState; update: (partial: Partial<HistoryState>) => void }) {
  const history = useAsync(loadHeroHistory, 'hero-history');
  const [visible, showMore] = usePaged(PAGE, `${state.repeatSeason}|${state.repeatGroup}`);
  const range = state.repeatSeason === 'all' ? index.patches : index.patches.filter((patch) => patch.season?.id === state.repeatSeason);
  const rows = useMemo(() => (history.data ? repeatedChanges(history.data, range, state.repeatGroup) : []), [history.data, range, state.repeatGroup]);

  return (
    <Panel eyebrow="Patterns" title="Repeated buffs and nerfs" className="patch-panel">
      <div className="timeline__controls">
        <SelectField label="Season" value={state.repeatSeason} onChange={(repeatSeason) => update({ repeatSeason })}>
          <option value="all">All stored seasons</option>
          {[...index.seasons].reverse().map((season) => <option key={season.start} value={`${season.year}-s${season.number}`}>Season {season.number} ({season.year})</option>)}
        </SelectField>
        <SelectField label="Format" value={state.repeatGroup} onChange={(value) => update({ repeatGroup: value as CardGroup })}>
          <option value="standard">Standard play</option>
          <option value="stadium">Stadium</option>
          <option value="limited">Limited-time modes</option>
        </SelectField>
      </div>
      <p className="patches-note">This counts each hero's overall result per patch. It says how often Blizzard changed a hero, not how strong that hero is.</p>
      {history.status === 'error' && <StateBlock tone="error" title="Could not load hero history" actions={<button type="button" className="btn-plain" onClick={history.retry}>Try again</button>} />}
      {history.status === 'loading' && !history.data && <div className="skeleton" aria-hidden="true"><span /><span /><span /></div>}
      {history.data && rows.length === 0 && <StateBlock title="No hero results in this range">Try another season or format.</StateBlock>}
      {rows.length > 0 && (
        <>
          <div className="timeline__table-wrap">
            <table className="data-table repeat">
              <thead>
                <tr>
                  <th scope="col">Hero</th>
                  <th scope="col" className="num">Buffed</th>
                  <th scope="col" className="num">Nerfed</th>
                  <th scope="col" className="num">Mixed</th>
                  <th scope="col" className="num repeat__wide">Buff lines</th>
                  <th scope="col" className="num repeat__wide">Nerf lines</th>
                  <th scope="col">Current run</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, visible).map((row) => {
                  const hero = HERO_BY_ID[row.heroId];
                  return (
                    <tr key={row.heroId}>
                      <th scope="row">
                        <button
                          type="button"
                          className="repeat__hero"
                          aria-label={`Show ${hero?.name ?? row.heroId} in the balance timeline`}
                          onClick={() => {
                            update({ hero: row.heroId, series: '' });
                            document.getElementById('hero-timeline')?.scrollIntoView({ block: 'start' });
                          }}
                        >
                          <HeroPortrait id={row.heroId} name={hero?.name ?? row.heroId} role={hero?.role} className="repeat__portrait" />
                          {hero?.name ?? row.heroId}
                        </button>
                      </th>
                      <td className="num">{row.buffPatches}</td>
                      <td className="num">{row.nerfPatches}</td>
                      <td className="num">{row.mixedPatches}</td>
                      <td className="num repeat__wide">{row.buffLines}</td>
                      <td className="num repeat__wide">{row.nerfLines}</td>
                      <td>{row.streak && row.streak.length > 1 ? <span className={cn('repeat__streak')} data-direction={row.streak.direction}>{CLASS_LABEL[row.streak.direction]} {row.streak.length} in a row</span> : <span className="compare__none">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="patch-list__foot">
            <span>Showing {Math.min(visible, rows.length)} of {rows.length} heroes. Buffed, Nerfed and Mixed count patches.</span>
            {visible < rows.length && <button type="button" className="btn-plain" onClick={showMore}>Show more</button>}
          </div>
        </>
      )}
    </Panel>
  );
}

function HeroTimelinePanel({ state, update }: { state: HistoryState; update: (partial: Partial<HistoryState>) => void }) {
  const history = useAsync(loadHeroHistory, 'hero-history');
  const heroIds = useMemo(() => Object.keys(history.data?.heroes ?? {}).sort((a, b) => (HERO_BY_ID[a]?.name ?? a).localeCompare(HERO_BY_ID[b]?.name ?? b)), [history.data]);
  const patchIds = useMemo(() => [...new Set((history.data?.heroes[state.hero] ?? []).map((tally) => tally.patch))], [history.data, state.hero]);
  const files = useAsync<PatchFile[]>(() => loadPatches(patchIds), `${state.hero}:${patchIds.join(',')}`);
  const name = HERO_BY_ID[state.hero]?.name ?? state.hero;

  return (
    <Panel eyebrow="Over time" title="Hero balance timeline" className="patch-panel" id="hero-timeline">
      <div className="timeline__controls">
        <SelectField label="Hero" value={state.hero} onChange={(hero) => update({ hero, series: '' })}>
          {heroIds.map((id) => <option key={id} value={id}>{HERO_BY_ID[id]?.name ?? id}</option>)}
        </SelectField>
      </div>
      {(history.status === 'error' || files.status === 'error') && (
        <StateBlock tone="error" title="Could not load this hero's patches" actions={<button type="button" className="btn-plain" onClick={() => { history.retry(); files.retry(); }}>Try again</button>} />
      )}
      {(history.status === 'loading' || files.status === 'loading') && !files.data && <div className="skeleton" aria-hidden="true"><span /><span /><span /><span /></div>}
      {files.data && patchIds.length > 0 && (
        <AbilityTimeline patches={files.data} heroId={state.hero} heroName={name} seriesKey={state.series || null} onSeries={(series) => update({ series })} />
      )}
      <p className="patches-note">The chart only plots values Blizzard published. The stored record starts at Season 1 of 2026, so anything earlier is not shown.</p>
    </Panel>
  );
}

export function PatchHistory({ index, query, onQuery }: { index: PatchIndex; query: string; onQuery: (query: string) => void }) {
  const [state, setState] = useState(() => parseHistory(query, index));
  const written = useRef(query);

  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    setState(parseHistory(query, index));
  }, [query, index]);

  const update = (partial: Partial<HistoryState>) => {
    const next = { ...state, ...partial };
    const serialized = serializeHistory(next, index);
    written.current = serialized;
    onQuery(serialized);
    setState(next);
  };

  const latest = latestBalancePatch(index);

  return (
    <div className="patch-history">
      <header className="patch-history__intro">
        <span className="eyebrow">Patch history</span>
        <h1 className="patch-hero__title">History and comparison</h1>
        <p>{index.patches.length} official patches stored since {formatPatchDate(index.patches[index.patches.length - 1].date)}{latest ? `, latest balance changes ${formatPatchDate(latest.date)}` : ''}. {SCOPE_LABEL.stadium} and limited-time modes stay separate from standard play throughout.</p>
      </header>
      <div className="patch-history__grid">
        <PatchBrowser index={index} state={state} update={update} />
        <div className="patch-history__tools">
          <HeroTimelinePanel state={state} update={update} />
          <PatchCompare index={index} state={state} update={update} />
          <RepeatedPanel index={index} state={state} update={update} />
        </div>
      </div>
    </div>
  );
}
