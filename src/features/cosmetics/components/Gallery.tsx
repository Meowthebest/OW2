import { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, LayoutGrid, Rows3, RotateCcw, Search, SearchX, SlidersHorizontal, Sparkles } from 'lucide-react';
import { SelectField, StateBlock } from '../../../components/controls';
import { RoleIcon } from '../../../components/icons';
import { HEROES, ROLES, ROLE_LABEL, type Role } from '../../../data/heroes';
import { cn, formatInt } from '../../../lib/format';
import { navigate } from '../../../lib/router';
import { InfoTip } from '../../players/components/parts';
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, pageOf, parseFilters, serializeFilters, type AvailabilityFilter, type CosmeticFilters, type MineFilter, type PriceCurrency, type SortKey } from '../core';
import { COSMETIC_TYPES, type CatalogMeta, type CatalogRow, type CosmeticType, type Rarity } from '../core/types';
import { isSet } from '../core/collection';
import { useUrlState } from '../useUrlState';
import { useCollection } from '../useCollection';
import { Pagination } from './bits';
import { CosmeticCard, CosmeticListRow } from './cards';
import { TypeIcon } from './media';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'A to Z' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'price-low', label: 'Price, low to high' },
  { value: 'price-high', label: 'Price, high to low' },
  { value: 'last-seen', label: 'Last in shop' },
];

const ROSTER_BY_ROLE = ROLES.map((role) => ({ role, heroes: HEROES.filter((hero) => hero.role === role).sort((a, b) => a.name.localeCompare(b.name)) }));

export interface GalleryContext {
  rows: CatalogRow[];
  meta: CatalogMeta;
  seasonLabels: Map<string, string>;
  eventLabels: Map<string, string>;
}

/**
 * The searchable grid. The cosmetics page, a loot pool and a collection all use this, so filters behave the same everywhere.
 * `fixed` holds filters a page decides for itself, which then don't appear in its toolbar or its link.
 */
export function Gallery({ context, path, query, routeKey, fixed = {}, itemName = 'cosmetic', keepQuery = '' }: { context: GalleryContext; path: string; query: string; routeKey: unknown; fixed?: Partial<CosmeticFilters>; itemName?: string; keepQuery?: string }) {
  const { rows, meta, seasonLabels, eventLabels } = context;
  const serialize = (value: CosmeticFilters) => [keepQuery, serializeFilters(value)].filter(Boolean).join('&');
  const [filters, setFilters] = useUrlState(path, query, routeKey, parseFilters, serialize);
  const entries = useCollection();
  const [moreOpen, setMoreOpen] = useState(() => {
    const parsed = parseFilters(query);
    return parsed.role !== 'all' || parsed.battlePass || parsed.esports || parsed.limited || parsed.pool !== 'all' || parsed.event !== 'all' || parsed.season !== 'all' || parsed.mine !== 'all' || parsed.min !== null || parsed.max !== null;
  });
  const top = useRef<HTMLDivElement>(null);

  const effective = useMemo(() => ({ ...filters, ...fixed }), [filters, fixed]);

  const results = useMemo(
    () =>
      applyFilters(rows, effective, {
        isOwned: (id) => isSet(entries, 'owned', id),
        isWished: (id) => isSet(entries, 'wishlist', id),
        isFavorite: (id) => isSet(entries, 'favorite', id),
        eventLabels,
      }),
    [rows, effective, entries, eventLabels],
  );
  const paged = pageOf(results, filters.page);
  const change = (partial: Partial<CosmeticFilters>) => setFilters((current) => ({ ...current, page: 1, ...partial }));
  const reset = () => setFilters((current) => ({ ...DEFAULT_FILTERS, sort: current.sort, view: current.view }));
  const narrowing = activeFilterCount(filters);

  // Keep the first page of results in view when a filter or page changes while scrolled down.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const element = top.current;
    if (element && element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: 'start' });
  }, [filters.page]);

  const random = () => {
    const pool = results.length > 0 ? results : rows;
    if (pool.length === 0) return;
    navigate(`#/cosmetics/${pool[Math.floor(Math.random() * pool.length)].id}`);
  };

  const heroCount = new Map(meta.facets.heroes.map((facet) => [facet.id, facet.count]));
  const typeCount = new Map(meta.facets.types.map((facet) => [facet.id, facet.count]));
  const mythicCount = meta.facets.rarities.find((facet) => facet.id === 'mythic')?.count ?? 0;

  return (
    <div className="cx-gallery" ref={top}>
      <section className="cx-toolbar" aria-label="Search and filter">
        <div className="cx-toolbar__row">
          <label className="search-field cx-toolbar__search">
            <span className="sr-only">Search {itemName}s</span>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={filters.q} placeholder={`Search ${itemName}s`} autoComplete="off" onChange={(event) => change({ q: event.target.value })} />
          </label>
          <SelectField label="Rarity" hideLabel value={filters.rarity} onChange={(rarity) => change({ rarity: rarity as Rarity | 'all' })}>
            <option value="all">All rarities</option>
            {meta.facets.rarities.map((facet) => <option key={facet.id} value={facet.id}>{facet.label} ({formatInt(facet.count)})</option>)}
          </SelectField>
          <SelectField label="Hero" hideLabel value={filters.hero} onChange={(hero) => change({ hero })}>
            <option value="all">All heroes</option>
            {ROSTER_BY_ROLE.map(({ role, heroes }) => (
              <optgroup key={role} label={ROLE_LABEL[role]}>
                {heroes.map((hero) => <option key={hero.id} value={hero.id}>{hero.name} ({formatInt(heroCount.get(hero.id) ?? 0)})</option>)}
              </optgroup>
            ))}
          </SelectField>
          <SelectField label="Status" hideLabel value={filters.availability} onChange={(availability) => change({ availability: availability as AvailabilityFilter })}>
            <option value="all">Any status</option>
            <option value="in-shop">Currently in shop</option>
            <option value="previous">Previously in shop</option>
            <option value="never-seen">Never seen in shop</option>
            <option value="gallery">Hero Gallery (Credits)</option>
          </SelectField>
          <SelectField label="Sort by" hideLabel value={filters.sort} onChange={(sort) => change({ sort: sort as SortKey })}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
          </SelectField>
          <button type="button" className="cx-tool" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
            <SlidersHorizontal size={15} aria-hidden="true" /> More filters
          </button>
          <button type="button" className="cx-tool" onClick={random} title={`Open a random ${itemName} from these results`}>
            <Dices size={15} aria-hidden="true" /> Random
          </button>
          <div className="cx-view-toggle" role="group" aria-label="View">
            <button type="button" aria-pressed={filters.view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => setFilters((current) => ({ ...current, view: 'grid' }))}><LayoutGrid size={15} aria-hidden="true" /></button>
            <button type="button" aria-pressed={filters.view === 'list'} aria-label="List view" title="List view" onClick={() => setFilters((current) => ({ ...current, view: 'list' }))}><Rows3 size={15} aria-hidden="true" /></button>
          </div>
        </div>

        <div className="cx-chips" role="group" aria-label="Category">
          <button type="button" className={cn('cx-filter-chip', filters.type === 'all' && filters.rarity !== 'mythic' && 'is-active')} aria-pressed={filters.type === 'all' && filters.rarity !== 'mythic'} onClick={() => change({ type: 'all', rarity: filters.rarity === 'mythic' ? 'all' : filters.rarity })}>All</button>
          {COSMETIC_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              className={cn('cx-filter-chip', filters.type === type.id && 'is-active')}
              aria-pressed={filters.type === type.id}
              disabled={!typeCount.get(type.id)}
              title={typeCount.get(type.id) ? undefined : 'Nothing of this type has been imported yet'}
              onClick={() => change({ type: type.id as CosmeticType })}
            >
              <TypeIcon type={type.id} size={13} /> {type.label}
            </button>
          ))}
          <button type="button" className={cn('cx-filter-chip', filters.rarity === 'mythic' && 'is-active')} aria-pressed={filters.rarity === 'mythic'} disabled={mythicCount === 0} onClick={() => change({ rarity: filters.rarity === 'mythic' ? 'all' : 'mythic', type: 'all' })}>
            <Sparkles size={13} aria-hidden="true" /> Mythic
          </button>
        </div>

        {moreOpen && (
          <div className="cx-toolbar__more">
            <div className="cx-chips" role="group" aria-label="Hero role">
              <button type="button" className={cn('cx-filter-chip', filters.role === 'all' && 'is-active')} aria-pressed={filters.role === 'all'} onClick={() => change({ role: 'all' })}>All roles</button>
              {ROLES.map((role: Role) => (
                <button key={role} type="button" className={cn('cx-filter-chip', filters.role === role && 'is-active')} aria-pressed={filters.role === role} onClick={() => change({ role })}>
                  <RoleIcon role={role} size={13} /> {ROLE_LABEL[role]}
                </button>
              ))}
            </div>
            <div className="cx-chips" role="group" aria-label="Origin">
              <button type="button" className={cn('cx-filter-chip', filters.battlePass && 'is-active')} aria-pressed={filters.battlePass} onClick={() => change({ battlePass: !filters.battlePass })}>Battle Pass</button>
              <button type="button" className={cn('cx-filter-chip', filters.esports && 'is-active')} aria-pressed={filters.esports} onClick={() => change({ esports: !filters.esports })}>Esports</button>
              <button type="button" className={cn('cx-filter-chip', filters.limited && 'is-active')} aria-pressed={filters.limited} onClick={() => change({ limited: !filters.limited })}>Limited-time</button>
              <InfoTip label="these filters">They use what each source says about a cosmetic. A cosmetic with no recorded origin won't match.</InfoTip>
            </div>
            <div className="cx-toolbar__selects">
              {meta.facets.seasons.length > 0 && (
                <SelectField label="Season" value={filters.season} onChange={(season) => change({ season })}>
                  <option value="all">All seasons</option>
                  {[...meta.facets.seasons].reverse().map((facet) => <option key={facet.id} value={facet.id}>{seasonLabels.get(facet.id) ?? facet.label} ({formatInt(facet.count)})</option>)}
                </SelectField>
              )}
              {meta.facets.events.length > 0 && (
                <SelectField label="Event" value={filters.event} onChange={(event) => change({ event })}>
                  <option value="all">All events</option>
                  {meta.facets.events.map((facet) => <option key={facet.id} value={facet.id}>{facet.label} ({formatInt(facet.count)})</option>)}
                </SelectField>
              )}
              {meta.facets.pools.length > 0 && !fixed.pool && (
                <SelectField label="Loot pool" value={filters.pool} onChange={(pool) => change({ pool })}>
                  <option value="all">Any pool</option>
                  {meta.facets.pools.map((facet) => <option key={facet.id} value={facet.id}>{facet.label} ({formatInt(facet.count)})</option>)}
                </SelectField>
              )}
              <SelectField label="My collection" value={filters.mine} onChange={(mine) => change({ mine: mine as MineFilter })}>
                <option value="all">Everything</option>
                <option value="owned">Owned</option>
                <option value="unowned">Not owned</option>
                <option value="wishlist">Wishlist</option>
                <option value="favorites">Favorites</option>
              </SelectField>
              <fieldset className="cx-price-range">
                <legend>Price range</legend>
                <SelectField label="Currency" hideLabel value={filters.currency} onChange={(currency) => change({ currency: currency as PriceCurrency })}>
                  <option value="coins">Coins</option>
                  <option value="credits">Credits</option>
                </SelectField>
                <label><span className="sr-only">Lowest price</span><input type="number" min={0} inputMode="numeric" placeholder="Min" value={filters.min ?? ''} onChange={(event) => change({ min: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></label>
                <label><span className="sr-only">Highest price</span><input type="number" min={0} inputMode="numeric" placeholder="Max" value={filters.max ?? ''} onChange={(event) => change({ max: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></label>
              </fieldset>
            </div>
          </div>
        )}
      </section>

      <div className="cx-results-line">
        <p className="cx-results-count" role="status">
          <strong>{formatInt(results.length)}</strong> {results.length === 1 ? itemName : `${itemName}s`}
          {narrowing > 0 && <span> of {formatInt(rows.length)}</span>}
        </p>
        {narrowing > 0 && (
          <button type="button" className="cx-tool cx-tool--quiet" onClick={reset}><RotateCcw size={13} aria-hidden="true" /> Reset filters</button>
        )}
      </div>

      {results.length === 0 ? (
        <StateBlock icon={<SearchX size={24} />} title={`No ${itemName}s match`} actions={narrowing > 0 ? <button type="button" className="btn-plain" onClick={reset}><RotateCcw size={14} aria-hidden="true" /> Reset filters</button> : undefined}>
          {filters.mine !== 'all' ? 'Marks are made by you, on each cosmetic\'s card. Nothing here comes from your game account.' : 'Try fewer filters or a different search.'}
        </StateBlock>
      ) : filters.view === 'list' ? (
        <ul className="cx-list">
          {paged.items.map((row) => <CosmeticListRow key={row.id} row={row} seasonLabel={row.season ? seasonLabels.get(row.season) : null} />)}
        </ul>
      ) : (
        <div className="cx-grid">
          {paged.items.map((row) => <CosmeticCard key={row.id} row={row} seasonLabel={row.season ? seasonLabels.get(row.season) : null} />)}
        </div>
      )}

      <Pagination
        page={paged.page}
        pages={paged.pages}
        hrefFor={(page) => {
          const next = serialize({ ...filters, page });
          return `${path}${next ? `?${next}` : ''}`;
        }}
        onPage={(page) => setFilters((current) => ({ ...current, page }))}
      />
    </div>
  );
}
