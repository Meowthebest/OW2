import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileSearch, History, ListChecks, RotateCcw } from 'lucide-react';
import { StateBlock } from '../../components/controls';
import { RoleIcon } from '../../components/icons';
import { ROLE_LABEL, type Role } from '../../data/heroes';
import type { PatchRoute } from '../../lib/router';
import { cn } from '../../lib/format';
import { FilterBar } from './components/FilterBar';
import { HeroCard } from './components/HeroCard';
import { HeroDrawer } from './components/HeroDrawer';
import { PatchHeader } from './components/PatchHeader';
import { PatchHistory } from './components/PatchHistory';
import type { CardGroup, OtherItem, PatchFile, PatchIndex } from './core/types';
import { loadIndex, loadPatches, useAsync, usePaged } from './data';
import {
  buildCards,
  buildSections,
  DEFAULT_FILTERS,
  latestBalancePatch,
  parseDrawer,
  parseFilters,
  resultTotals,
  selectPatches,
  serializeFilters,
  type DrawerTarget,
  type HeroCardModel,
  type PatchFilters,
  type ResultTotals,
} from './filters';
import { formatPatchDate } from './format';

// Large enough that a normal patch, Stadium included, shows in full.
const PAGE_SIZE = 36;
const DEFAULT_TITLE = 'OW2 Hero Selector: Random Hero Picker & Career Stats';

const GROUP_HEADING: Record<CardGroup, { title: string; note: string | null }> = {
  standard: { title: 'Standard play', note: null },
  stadium: { title: 'Stadium', note: 'Stadium has its own balance. These do not apply to standard play.' },
  limited: { title: 'Limited-time modes', note: 'These only apply inside that mode, not to standard play.' },
};

const counted = (heroes: number, lines: number) => `${heroes} ${heroes === 1 ? 'hero' : 'heroes'} and ${lines} ${lines === 1 ? 'change' : 'changes'}`;

function describeTotals(totals: ResultTotals) {
  const parts = [
    totals.heroes > 0 ? `${counted(totals.heroes, totals.lines)} in standard play` : null,
    totals.stadiumLines > 0 ? `${counted(totals.stadiumHeroes, totals.stadiumLines)} in Stadium` : null,
    totals.limitedLines > 0 ? `${counted(totals.limitedHeroes, totals.limitedLines)} in limited-time modes` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(', ')}.` : 'No matching changes.';
}

function hrefFor(tab: PatchRoute['tab'], query: string) {
  return `#/patches${tab === 'history' ? '/history' : ''}${query ? `?${query}` : ''}`;
}

/** Updates the address bar without firing a route change, so typing in a filter never loses focus. */
function writeUrl(tab: PatchRoute['tab'], query: string, mode: 'replace' | 'push' = 'replace') {
  const url = `${window.location.pathname}${window.location.search}${hrefFor(tab, query)}`;
  try {
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  } catch {
    // Browsers limit how often the URL can change. The filters still apply, and the next change writes it.
  }
}

function roleGroups(cards: HeroCardModel[]) {
  const groups = new Map<Role | 'other', HeroCardModel[]>();
  for (const card of cards) {
    const key = card.role ?? 'other';
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.entries()];
}

function Results({ cards, filters, multiple, onOpen }: { cards: HeroCardModel[]; filters: PatchFilters; multiple: boolean; onOpen: (card: HeroCardModel) => void }) {
  const [visible, showMore] = usePaged(PAGE_SIZE, filters);
  const sections = useMemo(() => buildSections(cards.slice(0, visible), filters.sort, multiple), [cards, visible, filters.sort, multiple]);
  const byRole = filters.sort === 'newest';

  return (
    <>
      {sections.map((section) => {
        const heading = GROUP_HEADING[section.group];
        return (
          <section key={section.key} className="result-section" data-group={section.group}>
            <header className="result-section__head">
              <h2 className="result-section__title">
                {section.patch && <span className="result-section__date">{formatPatchDate(section.patch.date, 'short')}</span>}
                {heading.title}
              </h2>
              {heading.note && <p>{heading.note}</p>}
            </header>
            {byRole ? (
              roleGroups(section.cards).map(([role, list]) => (
                <div key={role} className="result-role">
                  <h3 className="result-role__title" data-role={role === 'other' ? undefined : role}>
                    {role === 'other' ? 'Other' : <><RoleIcon role={role} size={15} /> {ROLE_LABEL[role]}</>}
                    <span className="result-role__count">{list.length}</span>
                  </h3>
                  <div className="hero-grid">
                    {list.map((card) => <HeroCard key={card.key} card={card} showDate={false} onOpen={onOpen} />)}
                  </div>
                </div>
              ))
            ) : (
              <div className="hero-grid">
                {section.cards.map((card) => <HeroCard key={card.key} card={card} showDate={multiple} onOpen={onOpen} />)}
              </div>
            )}
          </section>
        );
      })}
      {cards.length > PAGE_SIZE && (
        <div className="patch-list__foot patch-list__foot--center">
          <span>Showing {Math.min(visible, cards.length)} of {cards.length} hero results</span>
          {visible < cards.length && <button type="button" className="btn-plain" onClick={showMore}>Show more</button>}
        </div>
      )}
    </>
  );
}

const OTHER_GROUPS: Array<{ key: string; title: string; test: (item: OtherItem) => boolean }> = [
  { key: 'events', title: 'Events', test: (item) => item.section === 'event' },
  { key: 'general', title: 'General updates', test: (item) => item.section === 'general' },
  { key: 'fixes', title: 'Other bug fixes', test: (item) => item.section === 'bugfix' },
];

/** Fixes with no written summary only have a place and a count to show, so each place gets one row. */
function combineFixes(items: OtherItem[]) {
  const rows = new Map<string, { key: string; group: string | null; title: string | null; summary: string | null; count: number }>();
  for (const item of items) {
    const key = item.summary ? item.id : `${item.group ?? ''}|${item.title ?? ''}`;
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { key, group: item.group, title: item.title, summary: item.summary, count: 1 });
  }
  return [...rows.values()];
}

/** Everything else in the patch. Hero bug fixes are on hero cards, and these keep their source link. */
function OtherUpdates({ patch, format }: { patch: PatchFile; format: PatchFilters['format'] }) {
  const items = patch.other.filter((item) => (format === 'stadium' ? /stadium/i.test(item.group ?? '') : true));
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const hidden = items.filter((item) => !item.summary).length;
  return (
    <section className="other-updates">
      <button type="button" className="other-updates__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ListChecks size={17} aria-hidden="true" />
        <span>Other updates and bug fixes in this patch</span>
        <span className="result-role__count">{items.length}</span>
        <ChevronDown size={16} aria-hidden="true" className={cn(open && 'is-flipped')} />
      </button>
      {open && (
        <div className="other-updates__body">
          {OTHER_GROUPS.map((group) => {
            const list = items.filter(group.test);
            if (list.length === 0) return null;
            return (
              <div key={group.key}>
                <h3>{group.title}</h3>
                <ul>
                  {(group.key === 'fixes' ? combineFixes(list) : list.map((item) => ({ key: item.id, group: null, title: item.title, summary: item.summary, count: 1 }))).map((row) => (
                    <li key={row.key}>
                      {row.group && <span className="change-tag">{row.group}</span>}
                      {row.title && <b>{row.title}</b>}
                      {row.summary ? <span>{row.summary}</span> : group.key === 'fixes' && <span>{row.count} {row.count === 1 ? 'fix' : 'fixes'}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {hidden > 0 && <p className="patches-note">Details for items without a summary are on <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Blizzard's page</a>.</p>}
        </div>
      )}
    </section>
  );
}

function AboutData({ index }: { index: PatchIndex }) {
  return (
    <details className="about-data">
      <summary><FileSearch size={16} aria-hidden="true" /> How this data is built and checked</summary>
      <ul>
        <li>Blizzard has no public patch notes API. A scheduled job reads the published notes at <a href={index.source} target="_blank" rel="noreferrer">overwatch.blizzard.com</a>, stores the results with this site, and keeps the last good copy if a read fails.</li>
        <li>Stored records hold facts: heroes, abilities, stat names and published numbers, each with a link to its source and a fingerprint of the original line. Blizzard's wording and developer comments stay on Blizzard's page, and any summary here is labeled as one.</li>
        <li>Percent differences are only calculated from two published values. A missing value stays missing.</li>
        <li>Rules classify lines by what a stat means, so a shorter cooldown counts as a buff. Anything ambiguous is marked Needs Review. Rule-classified patches can contain mistakes, and a reviewed patch says so at the top.</li>
        <li>Buff and nerf describe the direction of a change. They are not a claim about how strong a hero is. Lines marked Analysis are this site's reading.</li>
      </ul>
    </details>
  );
}

function ChangesTab({ index, query, routeKey, onQuery }: { index: PatchIndex; query: string; routeKey: unknown; onQuery: (query: string) => void }) {
  const [filters, setFilters] = useState(() => parseFilters(query));
  const [drawer, setDrawer] = useState<DrawerTarget | null>(() => parseDrawer(query));
  const written = useRef(query);
  const pushedDrawer = useRef(false);

  // The hash changed from outside: back, forward, a pasted link or a nav click.
  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    pushedDrawer.current = false;
    setFilters(parseFilters(query));
    setDrawer(parseDrawer(query));
    // routeKey is a new object on every hash change, even when the query repeats.
  }, [routeKey]);

  useEffect(() => {
    const next = serializeFilters(filters, drawer);
    onQuery(serializeFilters(filters));
    if (next === written.current) return undefined;
    const timer = window.setTimeout(() => {
      written.current = next;
      writeUrl('changes', next);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [filters, drawer]);

  const openDrawer = (target: DrawerTarget) => {
    const next = serializeFilters(filters, target);
    written.current = next;
    pushedDrawer.current = true;
    writeUrl('changes', next, 'push');
    setDrawer(target);
  };

  const closeDrawer = () => {
    const next = serializeFilters(filters);
    written.current = next;
    setDrawer(null);
    if (pushedDrawer.current) {
      pushedDrawer.current = false;
      window.history.back();
    } else {
      writeUrl('changes', next);
    }
  };

  const change = (partial: Partial<PatchFilters>) => setFilters((current) => ({ ...current, ...partial }));
  const selected = useMemo(() => selectPatches(index, filters), [index, filters.patch, filters.season]);
  const ids = selected.map((patch) => patch.id);
  const files = useAsync<PatchFile[]>(() => loadPatches(ids), ids.join(',') || 'none');
  const cards = useMemo(() => (files.data ? buildCards(files.data, filters) : []), [files.data, filters]);
  const totals = useMemo(() => resultTotals(cards), [cards]);

  const latest = latestBalancePatch(index);
  const headerPatch = selected.length === 1 ? selected[0] : latest;
  const multiple = selected.length > 1;
  const onlyPatch = selected.length === 1 ? files.data?.find((file) => file.id === selected[0].id) ?? null : null;
  const narrowed = filters.hero || filters.ability || filters.role !== 'all' || filters.kind !== 'all' || filters.stat !== 'all';
  const showOther = onlyPatch && !narrowed && (filters.balance === 'all' || filters.balance === 'bugfix') && (filters.format === 'all' || filters.format === '5v5' || filters.format === 'stadium');
  const queueSpecific = files.data?.some((patch) => patch.changes.some((line) => line.queue !== 'all')) ?? false;
  const busy = files.status === 'loading';

  return (
    <>
      {headerPatch ? (
        <PatchHeader
          patch={headerPatch}
          index={index}
          isLatest={headerPatch.id === latest?.id}
          balance={filters.balance}
          onPickBalance={(balance) => change({ balance })}
          newer={filters.patch === 'latest' && filters.season === 'all' && index.patches[0] && index.patches[0].id !== latest?.id ? index.patches[0] : null}
        />
      ) : (
        <StateBlock title="No patches stored yet">The first import has not run.</StateBlock>
      )}

      <FilterBar filters={filters} index={index} onChange={change} onReset={() => setFilters(DEFAULT_FILTERS)} />

      <div className="patch-results" aria-busy={busy}>
        <p className="patch-results__summary" role="status">
          {multiple && <>{selected.length} patches selected. </>}
          {describeTotals(totals)}
        </p>

        {filters.queue !== 'all' && !queueSpecific && (
          <p className="patches-note">No hero change in this selection is listed for only one queue, so these apply to Competitive and Quick Play alike.</p>
        )}

        {files.status === 'error' && (
          <StateBlock tone="error" title="Could not load these patches" actions={<button type="button" className="btn-plain" onClick={files.retry}>Try again</button>}>
            The stored patch files did not load. Check your connection and try again.
          </StateBlock>
        )}

        {busy && !files.data && (
          <div className="hero-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index_) => <div key={index_} className="hero-card hero-card--skeleton"><div className="skeleton"><span /><span /><span /></div></div>)}
          </div>
        )}

        {files.data && cards.length === 0 && files.status !== 'error' && !busy && (
          <StateBlock
            icon={<FileSearch size={22} />}
            title="No changes match these filters"
            actions={<button type="button" className="btn-plain" onClick={() => setFilters(DEFAULT_FILTERS)}><RotateCcw size={14} aria-hidden="true" /> Reset filters</button>}
          >
            Try fewer filters, or choose All patches to search further back.
          </StateBlock>
        )}

        {cards.length > 0 && <Results cards={cards} filters={filters} multiple={multiple} onOpen={(card) => openDrawer({ heroId: card.heroId, patchId: card.patch.id })} />}

        {showOther && onlyPatch && <OtherUpdates key={onlyPatch.id} patch={onlyPatch} format={filters.format} />}
      </div>

      <AboutData index={index} />

      {drawer && (
        <HeroDrawer key={drawer.heroId} target={drawer} index={index} onClose={closeDrawer} onSelectPatch={(patchId) => setDrawer({ heroId: drawer.heroId, patchId })} />
      )}
    </>
  );
}

export function PatchNotesPage({ route }: { route: PatchRoute }) {
  const index = useAsync(loadIndex, 'index');
  const changesQuery = useRef(route.tab === 'changes' ? route.query : '');

  useEffect(() => {
    document.title = 'Patch Notes and Balance Tracker | OW2 Hero Selector';
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.tab]);

  const tabs = (
    <nav className="patch-tabs" aria-label="Patch notes sections">
      <a href={hrefFor('changes', changesQuery.current)} className={cn('patch-tabs__link', route.tab === 'changes' && 'is-active')} aria-current={route.tab === 'changes' ? 'page' : undefined}>
        <ListChecks size={16} aria-hidden="true" /> Balance changes
      </a>
      <a href="#/patches/history" className={cn('patch-tabs__link', route.tab === 'history' && 'is-active')} aria-current={route.tab === 'history' ? 'page' : undefined}>
        <History size={16} aria-hidden="true" /> History and compare
      </a>
    </nav>
  );

  return (
    <div className="page patches">
      {tabs}
      {index.status === 'error' && !index.data && (
        <StateBlock tone="error" title="Could not load patch data" actions={<button type="button" className="btn-plain" onClick={index.retry}>Try again</button>}>
          The stored patch index did not load. Check your connection and try again.
        </StateBlock>
      )}
      {index.status === 'loading' && !index.data && (
        <div className="patch-loading" aria-label="Loading patch data">
          <div className="skeleton skeleton--page" aria-hidden="true"><span /></div>
          <div className="hero-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, item) => <div key={item} className="hero-card hero-card--skeleton"><div className="skeleton"><span /><span /><span /></div></div>)}
          </div>
        </div>
      )}
      {index.data && (route.tab === 'history' ? (
        <PatchHistory index={index.data} query={route.query} onQuery={(query) => writeUrl('history', query)} />
      ) : (
        <ChangesTab index={index.data} query={route.query} routeKey={route} onQuery={(query) => { changesQuery.current = query; }} />
      ))}
    </div>
  );
}
