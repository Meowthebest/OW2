import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, ExternalLink, Package, RotateCcw, Search, SearchX, Undo2 } from 'lucide-react';
import { SelectField, StateBlock } from '../../../components/controls';
import { HEROES, ROLES, ROLE_LABEL } from '../../../data/heroes';
import { cn, formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { applyBundleFilters, BUNDLE_PAGE_SIZE, DEFAULT_BUNDLE_FILTERS, parseBundleFilters, serializeBundleFilters, type BundleFilters, type BundleSort, type BundleStatusFilter } from '../core/bundles';
import { bundleProgress } from '../core/collection';
import { pageOf } from '../core/filters';
import { COSMETIC_TYPES, type Bundle, type CosmeticType } from '../core/types';
import { loadBundles, loadMeta, loadSeasons } from '../data';
import { BackLink, Countdown, DataState, GridSkeleton, ItemshopCredit, Note, PageHeader, Pagination, RarityTag, usePageTitle } from '../components/bits';
import { BundleCard, BundleItemCard } from '../components/cards';
import { TypeIcon, ZoomableImage } from '../components/media';
import { dayText, sourcePriceText, typeLabel } from '../labels';
import { setMarks, useCollection } from '../useCollection';
import { useUrlState } from '../useUrlState';

const STATUS_TABS: Array<{ id: BundleStatusFilter; label: string }> = [
  { id: 'active', label: 'In shop now' },
  { id: 'previous', label: 'Previously available' },
  { id: 'all', label: 'All bundles' },
];

const ROSTER_BY_ROLE = ROLES.map((role) => ({ role, heroes: HEROES.filter((hero) => hero.role === role).sort((a, b) => a.name.localeCompare(b.name)) }));

function BundleBrowser({ bundles, query, routeKey }: { bundles: Bundle[]; query: string; routeKey: unknown }) {
  const [filters, setFilters] = useUrlState('#/bundles', query, routeKey, parseBundleFilters, serializeBundleFilters);
  const seasons = useAsync(loadSeasons, 'seasons');
  const change = (partial: Partial<BundleFilters>) => setFilters((current) => ({ ...current, page: 1, ...partial }));
  const results = useMemo(() => applyBundleFilters(bundles, filters), [bundles, filters]);
  const paged = pageOf(results, filters.page, BUNDLE_PAGE_SIZE);
  const top = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (top.current && top.current.getBoundingClientRect().top < 0) top.current.scrollIntoView({ block: 'start' });
  }, [filters.page]);

  const statusCount = (status: BundleStatusFilter) => (status === 'all' ? bundles.length : bundles.filter((bundle) => bundle.status === status).length);
  const seasonIds = new Set(bundles.map((bundle) => bundle.season).filter(Boolean));
  const usedSeasons = (seasons.data ?? []).filter((season) => seasonIds.has(season.id));
  const narrowed = filters.q !== '' || filters.hero !== 'all' || filters.season !== 'all' || filters.type !== 'all' || filters.min !== null || filters.max !== null;

  return (
    <div className="cx-gallery" ref={top}>
      <section className="cx-toolbar" aria-label="Search and filter bundles">
        <div className="cx-chips" role="group" aria-label="Availability">
          {STATUS_TABS.map((tab) => (
            <button key={tab.id} type="button" className={cn('cx-filter-chip', filters.status === tab.id && 'is-active')} aria-pressed={filters.status === tab.id} onClick={() => change({ status: tab.id })}>
              {tab.label} <span className="cx-filter-chip__count">{formatInt(statusCount(tab.id))}</span>
            </button>
          ))}
        </div>
        <div className="cx-toolbar__row">
          <label className="search-field cx-toolbar__search">
            <span className="sr-only">Search bundles by name</span>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={filters.q} placeholder="Search by bundle name" autoComplete="off" onChange={(event) => change({ q: event.target.value })} />
          </label>
          <SelectField label="Hero" hideLabel value={filters.hero} onChange={(hero) => change({ hero })}>
            <option value="all">All heroes</option>
            {ROSTER_BY_ROLE.map(({ role, heroes }) => (
              <optgroup key={role} label={ROLE_LABEL[role]}>
                {heroes.map((hero) => <option key={hero.id} value={hero.id}>{hero.name}</option>)}
              </optgroup>
            ))}
          </SelectField>
          <SelectField label="Item category" hideLabel value={filters.type} onChange={(type) => change({ type: type as CosmeticType | 'all' })}>
            <option value="all">Any item type</option>
            {COSMETIC_TYPES.map((type) => <option key={type.id} value={type.id}>Has {type.label.toLowerCase()}</option>)}
          </SelectField>
          {usedSeasons.length > 0 && (
            <SelectField label="Season" hideLabel value={filters.season} onChange={(season) => change({ season })}>
              <option value="all">All seasons</option>
              {usedSeasons.map((season) => <option key={season.id} value={season.id}>{season.label}</option>)}
            </SelectField>
          )}
          <SelectField label="Sort by" hideLabel value={filters.sort} onChange={(sort) => change({ sort: sort as BundleSort })}>
            <option value="newest">Sort: Newest</option>
            <option value="name">Sort: A to Z</option>
            <option value="price-low">Sort: Price, low to high</option>
            <option value="price-high">Sort: Price, high to low</option>
            <option value="items">Sort: Most items</option>
          </SelectField>
          <fieldset className="cx-price-range">
            <legend className="sr-only">Price range in Coins</legend>
            <label><span className="sr-only">Lowest price in Coins</span><input type="number" min={0} inputMode="numeric" placeholder="Min Coins" value={filters.min ?? ''} onChange={(event) => change({ min: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></label>
            <label><span className="sr-only">Highest price in Coins</span><input type="number" min={0} inputMode="numeric" placeholder="Max Coins" value={filters.max ?? ''} onChange={(event) => change({ max: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></label>
          </fieldset>
        </div>
      </section>

      <div className="cx-results-line">
        <p className="cx-results-count" role="status"><strong>{formatInt(results.length)}</strong> {results.length === 1 ? 'bundle' : 'bundles'}</p>
        {narrowed && <button type="button" className="cx-tool cx-tool--quiet" onClick={() => setFilters((current) => ({ ...DEFAULT_BUNDLE_FILTERS, status: current.status, sort: current.sort }))}><RotateCcw size={13} aria-hidden="true" /> Reset filters</button>}
      </div>

      {results.length === 0 ? (
        <StateBlock icon={<SearchX size={24} />} title="No bundles match">
          {filters.status === 'previous' && bundles.every((bundle) => bundle.status === 'active') ? 'Recording only started recently, so no bundle has left the shop yet.' : 'Try fewer filters or a different search.'}
        </StateBlock>
      ) : (
        <div className="cx-grid cx-grid--wide">{paged.items.map((bundle) => <BundleCard key={bundle.id} bundle={bundle} />)}</div>
      )}
      <Pagination
        page={paged.page}
        pages={paged.pages}
        hrefFor={(page) => {
          const next = serializeBundleFilters({ ...filters, page });
          return `#/bundles${next ? `?${next}` : ''}`;
        }}
        onPage={(page) => setFilters((current) => ({ ...current, page }))}
      />
    </div>
  );
}

export function BundlesPage({ query, routeKey }: { query: string; routeKey: unknown }) {
  usePageTitle('Bundles');
  const bundles = useAsync(loadBundles, 'bundles');
  const meta = useAsync(loadMeta, 'meta');
  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Cosmetics" title="Bundles" intro="Every bundle the shop data has listed, with prices, contents and your own progress on each one." />
      {bundles.data ? <BundleBrowser bundles={bundles.data} query={query} routeKey={routeKey} /> : <DataState status={bundles.status} error={bundles.error} retry={bundles.retry} what="bundles" skeleton={<GridSkeleton tall />} />}
      {meta.data?.shopHistoryFrom && !meta.data.shopHistoryComplete && <Note>Shop records start on {dayText(meta.data.shopHistoryFrom)}, so older bundles appear only if they return.</Note>}
      <ItemshopCredit />
    </div>
  );
}

export function BundleDetailPage({ id }: { id: string }) {
  const bundles = useAsync(loadBundles, 'bundles');
  const entries = useCollection();
  const [type, setType] = useState<CosmeticType | 'all'>('all');
  const bundle = bundles.data?.find((item) => item.id === id) ?? null;
  usePageTitle(bundle ? bundle.name : 'Bundle');

  if (!bundles.data) {
    return (
      <div className="page cx-page">
        <BackLink href="#/bundles">All bundles</BackLink>
        <DataState status={bundles.status} error={bundles.error} retry={bundles.retry} what="this bundle" skeleton={<GridSkeleton count={8} />} />
      </div>
    );
  }
  if (!bundle) {
    return (
      <div className="page cx-page">
        <BackLink href="#/bundles">All bundles</BackLink>
        <StateBlock icon={<Package size={24} />} title="This bundle isn't in the catalogue" actions={<a className="btn-plain" href="#/bundles">Browse bundles</a>}>
          The link may be old, or the bundle may be new since the catalogue was last built.
        </StateBlock>
      </div>
    );
  }

  const tracked = bundleProgress(bundle, entries);
  const cosmeticIds = bundle.items.flatMap((item) => (item.id ? [item.id] : []));
  const types = COSMETIC_TYPES.filter((option) => bundle.types.includes(option.id));
  const shownItems = type === 'all' ? bundle.items : bundle.items.filter((item) => item.type === type);
  const count = Math.max(bundle.statedCount ?? 0, bundle.items.length);

  return (
    <div className="page cx-page">
      <BackLink href="#/bundles">All bundles</BackLink>
      <section className="cx-bundle-hero" data-rarity={bundle.rarity ?? 'none'}>
        <div className="cx-bundle-hero__art">
          <ZoomableImage src={bundle.image} alt={bundle.name} width={1000} />
        </div>
        <div className="cx-bundle-hero__info">
          <p className="cx-detail__badges">
            {bundle.status === 'active' ? <span className="cx-pill" data-tone="good">In shop now</span> : <span className="cx-pill" data-tone="muted">Not in shop</span>}
            <RarityTag rarity={bundle.rarity} />
            {bundle.badge && <span className="cx-chip cx-chip--accent" title="The store's own tag">{bundle.badge}</span>}
          </p>
          <h1 className="cx-detail__name">{bundle.name}</h1>
          <p className="cx-bundle-hero__price">{bundle.price ? sourcePriceText(bundle.price.amount, bundle.price.currency, bundle.price.label) : 'Price not recorded'}</p>
          <dl className="cx-facts cx-facts--inline">
            <div className="cx-fact"><dt>Items</dt><dd>{count > 0 ? formatInt(count) : 'Not listed'}</dd></div>
            {bundle.productId && <div className="cx-fact"><dt>Product ID</dt><dd className="cx-mono">{bundle.productId}</dd></div>}
            {bundle.firstSeen && <div className="cx-fact"><dt>First recorded</dt><dd>{dayText(bundle.firstSeen)}</dd></div>}
            {bundle.status === 'active' && bundle.until && <div className="cx-fact"><dt>Availability</dt><dd><Countdown until={bundle.until} /></dd></div>}
            {bundle.status !== 'active' && bundle.lastSeen && <div className="cx-fact"><dt>Last recorded</dt><dd>{dayText(bundle.lastSeen)}</dd></div>}
            {bundle.section && <div className="cx-fact"><dt>Shop section</dt><dd>{bundle.section}</dd></div>}
          </dl>
          <div className="cx-bundle-hero__actions">
            {bundle.status === 'active' && bundle.url && (
              <a className="btn btn--ghost cx-buy" href={bundle.url} target="_blank" rel="noreferrer"><span>Buy on Battle.net <ExternalLink size={14} aria-hidden="true" /></span></a>
            )}
          </div>

          {tracked.total > 0 && (
            <div className="cx-tracker">
              <p className="cx-tracker__label"><strong>Collection: {tracked.done} / {tracked.total}</strong> items owned</p>
              <div className="cx-meter" role="progressbar" aria-label="Items marked as owned" aria-valuemin={0} aria-valuemax={tracked.total} aria-valuenow={tracked.done}><span style={{ width: `${tracked.percent}%` }} /></div>
              <p className="cx-muted cx-muted--small">Counts the items you've marked. It doesn't mean you bought this bundle.</p>
              <div className="cx-tracker__actions">
                <button type="button" className="cx-tool" disabled={tracked.done === tracked.total} onClick={() => setMarks('owned', cosmeticIds, true)}><CheckCheck size={14} aria-hidden="true" /> Mark all owned</button>
                <button type="button" className="cx-tool" disabled={tracked.done === 0} onClick={() => setMarks('owned', cosmeticIds, false)}><Undo2 size={14} aria-hidden="true" /> Clear marks</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {bundle.statedCount !== null && bundle.items.length > 0 && bundle.statedCount !== bundle.items.length && <Note>The store says {bundle.statedCount} items, and its data lists {bundle.items.length}.</Note>}
      {bundle.items.length === 0 && <Note>The source doesn't list what's inside this bundle.</Note>}

      {bundle.items.length > 0 && (
        <section className="cx-related">
          <header className="cx-related__head"><h2 className="cx-section-title">What's included</h2></header>
          {types.length > 1 && (
            <div className="cx-chips" role="group" aria-label="Item category">
              <button type="button" className={cn('cx-filter-chip', type === 'all' && 'is-active')} aria-pressed={type === 'all'} onClick={() => setType('all')}>All <span className="cx-filter-chip__count">{bundle.items.length}</span></button>
              {types.map((option) => (
                <button key={option.id} type="button" className={cn('cx-filter-chip', type === option.id && 'is-active')} aria-pressed={type === option.id} onClick={() => setType(option.id)}>
                  <TypeIcon type={option.id} size={13} /> {typeLabel(option.id)} <span className="cx-filter-chip__count">{bundle.items.filter((item) => item.type === option.id).length}</span>
                </button>
              ))}
            </div>
          )}
          <div className="cx-grid">{shownItems.map((item, index) => <BundleItemCard key={`${item.id ?? item.name}-${index}`} item={item} bundleName={bundle.name} />)}</div>
        </section>
      )}
      <ItemshopCredit />
    </div>
  );
}
