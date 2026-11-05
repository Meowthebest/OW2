import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock, ExternalLink, History, Layers, Radio, RotateCcw, Search, SearchX, Store, TriangleAlert } from 'lucide-react';
import { SelectField, StateBlock } from '../../../components/controls';
import { HeroPortrait } from '../../../components/media';
import { HEROES, ROLES, ROLE_LABEL } from '../../../data/heroes';
import { cn, formatDateTime, formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { diffListings, matchesShopGroup, matchesShopItem, sellableListings, SHOP_GROUPS, shopFingerprint, shopItemGroups, type ShopGroup, type ShopItemFilters, type ShopListing, type ShopSection, type ShopSnapshot } from '../core/shop';
import { COSMETIC_TYPES, type CosmeticType, type RotationSummary } from '../core/types';
import { loadLiveShop, loadRecordedShop, loadRotationMonth, loadRotations, useClock, type RecordedChange, type RecordedShop } from '../data';
import { Collapsible, Countdown, DataState, GridSkeleton, ItemshopCredit, Note, PageHeader, RarityTag, ReadTime, usePageTitle } from '../components/bits';
import { BundleItemCard } from '../components/cards';
import { Thumb, TypeIcon } from '../components/media';
import { dayText, heroById, sourcePriceText, typeLabel } from '../labels';
import { useUrlState } from '../useUrlState';

const LIVE_REFRESH_MS = 5 * 60 * 1000;

function listingHref(listing: ShopListing) {
  if (listing.kind === 'bundle') {
    const product = /^ow:bundle:(\d+)$/.exec(listing.key);
    return product ? `#/bundles/${product[1]}` : null;
  }
  return listing.cosmeticId ? `#/cosmetics/${listing.cosmeticId}` : null;
}

function ShopCard({ listing, section }: { listing: ShopListing; section: ShopSection }) {
  const details = listingHref(listing);
  // A single cosmetic goes straight to its page in the store. A bundle opens here first, to show what's inside.
  const toStore = listing.kind === 'cosmetic' ? listing.url : null;
  const hero = heroById(listing.hero);
  const until = listing.until ?? section.endsAt;
  const count = Math.max(listing.statedCount ?? 0, listing.contents.length);
  const body = (
    <>
      <div className="cx-bundle__media">
        <Thumb src={listing.image} alt="" width={640} fit="cover" type={listing.type} />
        {listing.badge && <span className="cx-pill" data-tone="accent" title="The store's own tag">{listing.badge}</span>}
        {hero && <span className="cx-hero-chip" title={hero.name}><HeroPortrait id={hero.id} name={hero.name} role={hero.role} /></span>}
      </div>
      <div className="cx-bundle__body">
        <h3 className="cx-bundle__name">{listing.name}</h3>
        <p className="cx-bundle__line">
          <span className="cx-price">{sourcePriceText(listing.amount, listing.currency, listing.priceLabel)}</span>
          {listing.kind === 'bundle' && count > 0 && <span className="cx-bundle__count"><Layers size={13} aria-hidden="true" /> {count} {count === 1 ? 'item' : 'items'}</span>}
          {listing.kind === 'cosmetic' && listing.type && <span className="cx-bundle__count"><TypeIcon type={listing.type} size={13} /> {hero?.name ?? 'Any hero'}</span>}
        </p>
        <p className="cx-bundle__line cx-bundle__line--quiet">
          {until ? <Countdown until={until} /> : <span>No end date from the source</span>}
          <RarityTag rarity={listing.rarity} />
        </p>
      </div>
    </>
  );
  return (
    <article className="cx-bundle cx-shop-card" data-rarity={listing.rarity ?? 'none'}>
      {toStore ? (
        <a className="cx-bundle__link" href={toStore} target="_blank" rel="noreferrer">{body}</a>
      ) : details ? (
        <a className="cx-bundle__link" href={details}>{body}</a>
      ) : (
        <div className="cx-bundle__link">{body}</div>
      )}
      {listing.soldOut && <p className="cx-shop-card__note">Listed as sold out</p>}
      {listing.url && (
        <div className="cx-shop-card__actions">
          <a className="cx-shop-card__buy" href={listing.url} target="_blank" rel="noreferrer">
            Buy on Battle.net <ExternalLink size={13} aria-hidden="true" />
          </a>
          {toStore && details && <a className="cx-shop-card__buy cx-shop-card__more" href={details} aria-label={`Details for ${listing.name}`}>Details</a>}
        </div>
      )}
    </article>
  );
}

const ROSTER_BY_ROLE = ROLES.map((role) => ({ role, heroes: HEROES.filter((hero) => hero.role === role).sort((a, b) => a.name.localeCompare(b.name)) }));

/** Everything that can be bought by itself, including what only shows up inside bundles. */
function ShopItems({ sections, known, filters, onChange }: { sections: ShopSection[]; known: RecordedShop['items']; filters: ShopItemFilters; onChange: (change: Partial<ShopItemFilters>) => void }) {
  const groups = useMemo(
    () =>
      shopItemGroups(sections).map(({ section, items }) => ({
        section,
        items: items.map((item) => {
          const facts = known?.[item.key];
          return facts ? { ...item, id: facts.id, prices: item.prices.length > 0 ? item.prices : facts.prices } : item;
        }),
      })),
    [sections, known],
  );
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const heroesHere = new Set(items.map((item) => item.hero));
  if (filters.hero !== 'all') heroesHere.add(filters.hero);
  const roster = ROSTER_BY_ROLE.map(({ role, heroes }) => ({ role, heroes: heroes.filter((hero) => heroesHere.has(hero.id)) })).filter(({ heroes }) => heroes.length > 0);
  // Counts follow the search and hero, so a type never promises more than picking it would show.
  const countByType = new Map<string, number>();
  for (const item of items) {
    if (matchesShopItem(item, { ...filters, type: 'all' })) countByType.set(item.type, (countByType.get(item.type) ?? 0) + 1);
  }
  const allCount = [...countByType.values()].reduce((sum, count) => sum + count, 0);
  const types = COSMETIC_TYPES.filter((type) => countByType.has(type.id) || filters.type === type.id);
  const shown = groups.map(({ section, items: list }) => ({ section, items: list.filter((item) => matchesShopItem(item, filters)) })).filter((group) => group.items.length > 0);
  const total = shown.reduce((sum, group) => sum + group.items.length, 0);
  const narrowed = filters.q !== '' || filters.hero !== 'all' || filters.type !== 'all';

  return (
    <>
      <section className="cx-toolbar" aria-label="Search and filter items">
        <div className="cx-toolbar__row">
          <label className="search-field cx-toolbar__search">
            <span className="sr-only">Search items by name, hero or bundle</span>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={filters.q} placeholder="Search by item, hero or bundle" autoComplete="off" onChange={(event) => onChange({ q: event.target.value })} />
          </label>
          <SelectField label="Hero" hideLabel value={filters.hero} onChange={(hero) => onChange({ hero })}>
            <option value="all">All heroes</option>
            {roster.map(({ role, heroes }) => (
              <optgroup key={role} label={ROLE_LABEL[role]}>
                {heroes.map((hero) => <option key={hero.id} value={hero.id}>{hero.name}</option>)}
              </optgroup>
            ))}
          </SelectField>
        </div>
        <div className="cx-chips" role="group" aria-label="Item type">
          <button type="button" className={cn('cx-filter-chip', filters.type === 'all' && 'is-active')} aria-pressed={filters.type === 'all'} onClick={() => onChange({ type: 'all' })}>
            All <span className="cx-filter-chip__count">{formatInt(allCount)}</span>
          </button>
          {types.map((type) => (
            <button key={type.id} type="button" className={cn('cx-filter-chip', filters.type === type.id && 'is-active')} aria-pressed={filters.type === type.id} onClick={() => onChange({ type: type.id })}>
              <TypeIcon type={type.id} size={13} /> {typeLabel(type.id)} <span className="cx-filter-chip__count">{formatInt(countByType.get(type.id) ?? 0)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="cx-results-line">
        <p className="cx-results-count" role="status"><strong>{formatInt(total)}</strong> {total === 1 ? 'item you can buy on its own' : 'items you can buy on their own'}</p>
        {narrowed && <button type="button" className="cx-tool cx-tool--quiet" onClick={() => onChange({ q: '', hero: 'all', type: 'all' })}><RotateCcw size={13} aria-hidden="true" /> Reset</button>}
      </div>
      <p className="cx-muted cx-muted--small">Click an item to open its page on Battle.net and buy just that item. Where no price shows here, the store has it.</p>

      {total === 0 ? (
        <StateBlock icon={<SearchX size={24} />} title="No items match">Try a different search or fewer filters.</StateBlock>
      ) : (
        shown.map(({ section, items: list }) => (
          <section key={section.title} className="cx-shop-section">
            <header className="cx-shop-section__head">
              <h2 className="cx-section-title">{section.title}</h2>
              <span className="cx-filter-chip__count">{list.length}</span>
              {section.endsAt && <Countdown until={section.endsAt} />}
            </header>
            <div className="cx-grid">
              {list.map((item) => <BundleItemCard key={item.key} item={item} buyFirst />)}
            </div>
          </section>
        ))
      )}
    </>
  );
}

function ChangeList({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: RecordedChange[]; empty: string }) {
  return (
    <div className="cx-change">
      <h3 className="cx-change__title">{icon} {title} <span className="cx-filter-chip__count">{items.length}</span></h3>
      {items.length === 0 ? (
        <p className="cx-muted">{empty}</p>
      ) : (
        <ul className="cx-change__list">
          {items.slice(0, 30).map((item) => (
            <li key={item.key}>
              <span className="cx-change__thumb"><Thumb src={item.image} width={96} /></span>
              {item.href ? <a href={item.href}>{item.name}</a> : <span>{item.name}</span>}
              {item.amount !== null && <span className="cx-muted">{sourcePriceText(item.amount, item.currency)}</span>}
            </li>
          ))}
          {items.length > 30 && <li className="cx-muted">and {items.length - 30} more</li>}
        </ul>
      )}
    </div>
  );
}

function PastShop({ rotation }: { rotation: RotationSummary }) {
  const month = rotation.at.slice(0, 7);
  const file = useAsync(() => loadRotationMonth(month), month);
  const detail = file.data?.find((item) => item.id === rotation.id);
  if (!detail) return <DataState status={file.status === 'ready' ? 'error' : file.status} error={file.error} retry={file.retry} what="this shop" skeleton={<GridSkeleton count={4} />} />;
  return (
    <div className="cx-past">
      {detail.sections.map((section) => (
        <div key={section.title} className="cx-past__section">
          <h4 className="cx-past__title">{section.title} <span className="cx-filter-chip__count">{section.listings.length}</span></h4>
          <ul className="cx-past__list">
            {section.listings.map((listing) => (
              <li key={listing.key}>
                {listing.href ? <a href={listing.href}>{listing.name}</a> : <span>{listing.name}</span>}
                <span className="cx-muted">{sourcePriceText(listing.amount, listing.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PastShops({ historyNote }: { historyNote: string | null }) {
  const rotations = useAsync(loadRotations, 'rotations');
  const [open, setOpen] = useState<string | null>(null);
  const list = rotations.data ?? [];
  return (
    <Collapsible title="Past shops" icon={<History size={15} aria-hidden="true" />} count={list.length}>
      {rotations.status === 'error' && <DataState status="error" error={rotations.error} retry={rotations.retry} what="past shops" />}
      {list.length > 0 && (
        <ul className="cx-rotations">
          {list.slice(0, 200).map((rotation) => (
            <li key={rotation.id}>
              <button type="button" aria-expanded={open === rotation.id} onClick={() => setOpen(open === rotation.id ? null : rotation.id)}>
                <span className="cx-rotations__date">{dayText(rotation.at)}</span>
                <span>{formatInt(rotation.count)} listings</span>
                <span className="cx-rotations__changes"><span data-tone="good">+{rotation.added}</span> <span data-tone="muted">−{rotation.removed}</span></span>
              </button>
              {open === rotation.id && <PastShop rotation={rotation} />}
            </li>
          ))}
        </ul>
      )}
      {historyNote && <p className="cx-muted cx-muted--small">{historyNote}</p>}
    </Collapsible>
  );
}

/** Which order to show sections in: rotating sections with an end time first, since that's what changes. */
function sectionOrder(sections: ShopSection[]) {
  return [...sections].sort((a, b) => Number(Boolean(b.endsAt)) - Number(Boolean(a.endsAt)) || (a.endsAt ?? '').localeCompare(b.endsAt ?? ''));
}

function changesAgainst(current: ShopSnapshot, recorded: RecordedShop | null): RecordedShop['changes'] {
  if (!recorded) return null;
  if (shopFingerprint(current) === shopFingerprint(recorded.snapshot)) return recorded.changes;
  // The store has moved on since the last recording, so compare with that.
  const before = sellableListings(recorded.snapshot);
  const after = sellableListings(current);
  const { added, removed } = diffListings(after, before);
  const describe = (listing: ShopListing): RecordedChange => ({ key: listing.key, name: listing.name, image: listing.image, amount: listing.amount, currency: listing.currency, bundle: listing.kind === 'bundle', href: listingHref(listing) });
  const byKey = (list: ShopListing[]) => new Map(list.map((listing) => [listing.key, listing]));
  const afterMap = byKey(after);
  const beforeMap = byKey(before);
  return { previousAt: recorded.rotation.at, added: added.map((key) => describe(afterMap.get(key)!)), removed: removed.map((key) => describe(beforeMap.get(key)!)) };
}

interface ShopView extends ShopItemFilters {
  group: ShopGroup;
}

const parseView = (query: string): ShopView => {
  const params = new URLSearchParams(query);
  const group = params.get('show');
  const hero = params.get('hero');
  const type = params.get('type');
  return {
    group: SHOP_GROUPS.some((option) => option.id === group) ? (group as ShopGroup) : 'all',
    q: params.get('q') ?? '',
    hero: HEROES.some((option) => option.id === hero) ? hero! : 'all',
    type: COSMETIC_TYPES.some((option) => option.id === type) ? (type as CosmeticType) : 'all',
  };
};
const serializeView = ({ group, q, hero, type }: ShopView) => {
  if (group === 'all') return '';
  const params = new URLSearchParams({ show: group });
  if (group === 'cosmetics') {
    if (q) params.set('q', q);
    if (hero !== 'all') params.set('hero', hero);
    if (type !== 'all') params.set('type', type);
  }
  return params.toString();
};

export function ShopPage({ query, routeKey }: { query: string; routeKey: unknown }) {
  usePageTitle('Shop');
  const recorded = useAsync(loadRecordedShop, 'recorded-shop');
  const [live, setLive] = useState<ShopSnapshot | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);
  const [view, setView] = useUrlState('#/shop', query, routeKey, parseView, serializeView);
  const { group } = view;
  const now = useClock(30000);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const read = () => {
      loadLiveShop(controller.signal).then(
        (snapshot) => {
          setLive(snapshot);
          setLiveFailed(false);
        },
        () => {
          if (!controller.signal.aborted) setLiveFailed(true);
        },
      );
    };
    read();
    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') read();
    }, LIVE_REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const snapshot = live ?? recorded.data?.snapshot ?? null;
  const changes = useMemo(() => (snapshot ? changesAgainst(snapshot, recorded.data ?? null) : null), [snapshot, recorded.data]);
  const sections = useMemo(() => (snapshot ? sectionOrder(snapshot.sections) : []), [snapshot]);

  const loading = !snapshot && (recorded.status === 'loading' || (!live && !liveFailed));
  const expired = snapshot?.expiresAt ? Date.parse(snapshot.expiresAt) < now : false;

  return (
    <div className="page cx-page">
      <PageHeader
        eyebrow="Cosmetics"
        title="Shop"
        intro="What's on sale in Overwatch right now, read from itemshop.gg. You buy through Battle.net or in the game. Nothing is sold here."
        actions={
          snapshot && (
            <div className="cx-shop-status">
              <span className="cx-pill" data-tone={live && !live.stale ? 'good' : 'warn'}>
                {live && !live.stale ? <Radio size={12} aria-hidden="true" /> : <TriangleAlert size={12} aria-hidden="true" />}
                {live && !live.stale ? 'Live' : 'Last recorded'}
              </span>
              {snapshot.updatedAt && <span className="cx-shop-status__time" title={formatDateTime(Date.parse(snapshot.updatedAt))}><Clock size={13} aria-hidden="true" /> Store read <ReadTime at={snapshot.updatedAt} /></span>}
            </div>
          )
        }
      />

      {live?.stale && <Note>itemshop.gg couldn't read the store just now, so this is its last good copy.</Note>}
      {!live && liveFailed && snapshot && <Note>Couldn't reach itemshop.gg just now, so this is the shop as last recorded by this site.</Note>}
      {!live && expired && <Note>The shop may have changed since this copy was made.</Note>}

      {loading ? (
        <GridSkeleton tall />
      ) : !snapshot ? (
        <StateBlock icon={<Store size={24} />} tone={liveFailed ? 'warn' : undefined} title="The shop isn't available right now">
          Nothing has been recorded yet and itemshop.gg couldn't be reached. Prices are never guessed, so nothing is shown.
        </StateBlock>
      ) : (
        <>
          <div className="cx-chips cx-chips--scroll" role="group" aria-label="What to show">
            {SHOP_GROUPS.map((option) => (
              <button key={option.id} type="button" title={option.hint} className={cn('cx-filter-chip', group === option.id && 'is-active')} aria-pressed={group === option.id} onClick={() => setView((current) => ({ ...current, group: option.id }))}>
                {option.label}
              </button>
            ))}
          </div>

          {group === 'cosmetics' && <ShopItems sections={sections} known={recorded.data?.items} filters={view} onChange={(change) => setView((current) => ({ ...current, ...change }))} />}

          {group !== 'cosmetics' && sections.map((section) => {
            const listings = section.listings.filter((listing) => matchesShopGroup(listing, section, group));
            if (listings.length === 0) return null;
            return (
              <section key={section.title} className="cx-shop-section">
                <header className="cx-shop-section__head">
                  <h2 className="cx-section-title">{section.title}</h2>
                  <span className="cx-filter-chip__count">{listings.length}</span>
                  {section.upcoming && <span className="cx-pill" data-tone="info">Coming soon</span>}
                  {section.endsAt && <Countdown until={section.endsAt} />}
                </header>
                <div className="cx-grid cx-grid--wide">
                  {listings.map((listing) => <ShopCard key={`${section.title}-${listing.key}`} listing={listing} section={section} />)}
                </div>
              </section>
            );
          })}

          <section className="cx-shop-changes" aria-label="Changes since the last recorded shop">
            <h2 className="cx-section-title">Since the last recorded shop</h2>
            {changes ? (
              <>
                <p className="cx-muted cx-muted--small">Compared with the shop recorded on {dayText(changes.previousAt)}.</p>
                <div className="cx-change-grid">
                  <ChangeList title="New" icon={<ArrowUpRight size={15} aria-hidden="true" />} items={changes.added} empty="Nothing new." />
                  <ChangeList title="Gone" icon={<ArrowDownRight size={15} aria-hidden="true" />} items={changes.removed} empty="Nothing has left." />
                </div>
              </>
            ) : (
              <p className="cx-muted">This is the first shop recorded, so there's nothing to compare it with yet.</p>
            )}
          </section>

          <PastShops historyNote={recorded.data ? null : 'Past shops appear here once the first one is recorded.'} />
        </>
      )}
      <ItemshopCredit />
    </div>
  );
}
