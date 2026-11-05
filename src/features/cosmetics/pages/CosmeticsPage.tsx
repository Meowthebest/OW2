import { useMemo, useState } from 'react';
import { Bell, BellOff, Boxes, CalendarClock, ExternalLink, History, Package, Sparkles } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { HeroPortrait } from '../../../components/media';
import { formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { isSet } from '../core/collection';
import { groupStays } from '../core/shop';
import { normalizeText } from '../core/text';
import type { Bundle, CatalogMeta, CatalogRow, CosmeticDetail, LootPool, Season, ShopStay } from '../core/types';
import { loadBundles, loadCatalog, loadCosmetic, loadEvents, loadMeta, loadPools, loadSeasons } from '../data';
import { AvailabilityPill, BackLink, Collapsible, DataState, GridSkeleton, ItemshopCredit, Note, PageHeader, PriceList, RarityTag, SourceList, TrackButtons, usePageTitle } from '../components/bits';
import { BundleCard, CosmeticCard } from '../components/cards';
import { Gallery, type GalleryContext } from '../components/Gallery';
import { Thumb, ZoomableImage } from '../components/media';
import { dayText, heroById, heroLabel, TAG_LABEL, typeSingular } from '../labels';
import { toggleMark, useCollection } from '../useCollection';

export function useGalleryContext() {
  return useAsync<GalleryContext>(async () => {
    const [rows, meta, seasons, events] = await Promise.all([loadCatalog(), loadMeta(), loadSeasons(), loadEvents()]);
    return {
      rows,
      meta,
      seasonLabels: new Map(seasons.map((season: Season) => [season.id, season.label])),
      eventLabels: new Map(events.map((event) => [event.id, event.label])),
    };
  }, 'gallery');
}

export function CatalogueCredits() {
  const meta = useAsync(loadMeta, 'meta');
  const wiki = meta.data?.sources.find((source) => source.id === 'wiki');
  return (
    <div className="cx-credits">
      <ItemshopCredit />
      {wiki && (
        <p className="cx-credit">
          Catalogue details adapted from the <a href="https://overwatch.wiki/" target="_blank" rel="noreferrer">Overwatch Wiki</a> under <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 3.0</a>, last imported {dayText(wiki.lastSuccess)}.
        </p>
      )}
    </div>
  );
}

/** Says plainly what the catalogue covers until the wider import is in, so a short list doesn't read as the whole game. */
export function CatalogueScope({ children }: { children?: React.ReactNode }) {
  const meta = useAsync(loadMeta, 'meta');
  if (!meta.data || meta.data.sources.some((source) => source.id === 'wiki')) return null;
  return <Note>{children ?? `For now, the catalogue holds what the shop data has listed${meta.data.shopHistoryFrom ? ` since ${dayText(meta.data.shopHistoryFrom)}` : ''}. Cosmetics not sold since then aren't here yet.`}</Note>;
}

export function CosmeticsPage({ query, routeKey }: { query: string; routeKey: unknown }) {
  usePageTitle('Cosmetics');
  const data = useGalleryContext();
  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Cosmetics" title="Cosmetics" intro="Browse Overwatch cosmetics, see where each one comes from, and track your own collection." />
      <CatalogueScope />
      {data.data ? (
        <>
          <Gallery context={data.data} path="#/cosmetics" query={query} routeKey={routeKey} />
          <CatalogueCredits />
        </>
      ) : (
        <DataState status={data.status} error={data.error} retry={data.retry} what="cosmetics" />
      )}
    </div>
  );
}

/** A small timeline of a cosmetic's stays in the shop, with the table below as its full record. */
function StayTimeline({ stays }: { stays: ShopStay[] }) {
  const dated = stays.filter((stay) => stay.start);
  if (dated.length < 3) return null;
  const today = Date.now();
  const spans = dated.map((stay) => ({ start: Date.parse(stay.start!), end: stay.end ? Date.parse(stay.end) : today, stay }));
  const low = Math.min(...spans.map((span) => span.start));
  const high = Math.max(...spans.map((span) => span.end), low + 86400000);
  const x = (time: number) => ((time - low) / (high - low)) * 100;
  return (
    <figure className="cx-timeline">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`Shop appearances from ${dayText(new Date(low).toISOString())} to ${dayText(new Date(high).toISOString())}`}>
        <line x1="0" x2="100" y1="5" y2="5" className="cx-timeline__axis" vectorEffect="non-scaling-stroke" />
        {spans.map((span, index) => (
          <rect key={index} x={x(span.start)} width={Math.max(0.8, x(span.end) - x(span.start))} y="2" height="6" rx="0.5" className="cx-timeline__bar">
            <title>{`${dayText(span.stay.start)} to ${span.stay.end ? dayText(span.stay.end) : 'now'}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption><span>{dayText(new Date(low).toISOString())}</span><span>{dayText(new Date(high).toISOString())}</span></figcaption>
    </figure>
  );
}

function ShopHistory({ detail, meta }: { detail: CosmeticDetail; meta: CatalogMeta | undefined }) {
  const rows = useMemo(() => groupStays(detail.stays), [detail.stays]);
  return (
    <Collapsible title="Shop history" icon={<History size={15} aria-hidden="true" />} count={rows.length} defaultOpen={rows.length > 0 && rows.length <= 6}>
      {detail.stays.length === 0 ? (
        <p className="cx-muted">No shop appearance recorded{meta?.shopHistoryFrom ? ` since ${dayText(meta.shopHistoryFrom)}` : ''}.</p>
      ) : (
        <>
          <StayTimeline stays={detail.stays} />
          <div className="cx-table-wrap">
            <table className="data-table cx-table">
              <thead>
                <tr><th scope="col">From</th><th scope="col">Until</th><th scope="col" className="num">Price</th><th scope="col">Sold as</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.start}|${row.end}`}>
                    <td>{row.start ? dayText(row.start) : 'Not recorded'}</td>
                    <td>{row.end ? dayText(row.end) : 'Still listed'}</td>
                    <td className="num">{row.price !== null ? `${formatInt(row.price)}${row.currency ? ` ${row.currency}` : ''}` : '—'}</td>
                    <td>
                      {row.bundles.length > 0 ? (
                        <ul className="cx-plain-list">
                          {row.bundles.map((bundle) => (
                            <li key={bundle.name}>
                              In {bundle.id ? <a className="text-link" href={`#/bundles/${bundle.id}`}>{bundle.name}</a> : bundle.name}
                              {bundle.price !== null && ` (${formatInt(bundle.price)}${row.currency ? ` ${row.currency}` : ''} for the bundle)`}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        row.section ?? 'On its own'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {meta?.shopHistoryFrom && <p className="cx-muted cx-muted--small">Recorded since {dayText(meta.shopHistoryFrom)}. Earlier appearances aren't included.</p>}
    </Collapsible>
  );
}

function RelatedRow({ title, rows, seasonLabels, moreHref }: { title: string; rows: CatalogRow[]; seasonLabels: Map<string, string>; moreHref?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="cx-related">
      <header className="cx-related__head">
        <h2 className="cx-section-title">{title}</h2>
        {moreHref && <a className="text-link" href={moreHref}>See all</a>}
      </header>
      <div className="cx-grid cx-grid--dense">
        {rows.map((row) => <CosmeticCard key={row.id} row={row} seasonLabel={row.season ? seasonLabels.get(row.season) : null} />)}
      </div>
    </section>
  );
}

function RelatedItems({ detail, context, bundles }: { detail: CosmeticDetail; context: GalleryContext; bundles: Bundle[] }) {
  const byId = useMemo(() => new Map(context.rows.map((row) => [row.id, row])), [context.rows]);
  const inBundles = bundles.filter((bundle) => detail.bundles.includes(bundle.id));
  const sameCollection = useMemo(() => {
    const ids = new Set<string>();
    for (const bundle of inBundles) for (const item of bundle.items) if (item.id && item.id !== detail.id) ids.add(item.id);
    // Sprays, icons and name cards often share a skin's name, with no bundle linking them.
    const name = normalizeText(detail.name);
    if (name.length >= 4) for (const row of context.rows) if (row.id !== detail.id && normalizeText(row.name) === name) ids.add(row.id);
    return [...ids].map((id) => byId.get(id)).filter((row): row is CatalogRow => Boolean(row)).slice(0, 12);
  }, [detail.id, detail.name, inBundles, context.rows, byId]);
  const taken = new Set([detail.id, ...sameCollection.map((row) => row.id)]);
  const similar = detail.hero ? context.rows.filter((row) => row.hero === detail.hero && row.type === detail.type && !taken.has(row.id)).sort((a, b) => b.order - a.order).slice(0, 6) : [];
  similar.forEach((row) => taken.add(row.id));
  const sameEvent = detail.event ? context.rows.filter((row) => row.event === detail.event && !taken.has(row.id)).sort((a, b) => b.order - a.order).slice(0, 6) : [];

  return (
    <>
      {inBundles.length > 0 && (
        <section className="cx-related">
          <header className="cx-related__head"><h2 className="cx-section-title">Included in these bundles</h2></header>
          <div className="cx-grid cx-grid--wide">{inBundles.map((bundle) => <BundleCard key={bundle.id} bundle={bundle} />)}</div>
        </section>
      )}
      <RelatedRow title="From the same collection" rows={sameCollection} seasonLabels={context.seasonLabels} />
      <RelatedRow title={`More ${typeSingular(detail.type).toLowerCase()}s for ${heroLabel(detail.hero)}`} rows={similar} seasonLabels={context.seasonLabels} moreHref={detail.hero ? `#/cosmetics?hero=${detail.hero}&type=${detail.type}` : undefined} />
      <RelatedRow title={`Also from ${detail.event ? context.eventLabels.get(detail.event) ?? 'this event' : 'this event'}`} rows={sameEvent} seasonLabels={context.seasonLabels} moreHref={detail.event ? `#/cosmetics?event=${detail.event}` : undefined} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cx-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function NotifyButton({ detail }: { detail: CosmeticDetail }) {
  const entries = useCollection();
  const on = isSet(entries, 'notify', detail.id);
  return (
    <button type="button" className="cx-tool" aria-pressed={on} onClick={() => toggleMark('notify', detail.id)}>
      {on ? <BellOff size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
      {on ? 'Stop alerting me' : 'Alert me when it\'s in the shop'}
    </button>
  );
}

export function CosmeticDetailPage({ id }: { id: string }) {
  const item = useAsync(() => loadCosmetic(id), id);
  const context = useGalleryContext();
  const bundles = useAsync(loadBundles, 'bundles');
  const pools = useAsync(loadPools, 'pools');
  const [shown, setShown] = useState(0);
  const detail = item.data && item.data.id === id ? item.data : null;
  usePageTitle(detail ? detail.name : 'Cosmetic');

  if (item.status === 'loading' || (item.status === 'ready' && item.data && item.data.id !== id)) {
    return (
      <div className="page cx-page">
        <GridSkeleton count={2} tall />
      </div>
    );
  }
  if (item.status === 'error') {
    return (
      <div className="page cx-page">
        <BackLink href="#/cosmetics">All cosmetics</BackLink>
        <DataState status="error" error={item.error} retry={item.retry} what="this cosmetic" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page cx-page">
        <BackLink href="#/cosmetics">All cosmetics</BackLink>
        <StateBlock icon={<Package size={24} />} title="This cosmetic isn't in the catalogue" actions={<a className="btn-plain" href="#/cosmetics">Browse cosmetics</a>}>
          The link may be old, or the item may have been renamed.
        </StateBlock>
      </div>
    );
  }

  const hero = heroById(detail.hero);
  const seasonLabel = detail.season ? context.data?.seasonLabels.get(detail.season) ?? detail.season : null;
  const eventLabel = detail.event ? context.data?.eventLabels.get(detail.event) ?? detail.event : null;
  const imageList = detail.images.length > 0 ? detail.images : [];
  const current = imageList[Math.min(shown, imageList.length - 1)] ?? null;
  const poolList = (pools.data ?? []).filter((pool: LootPool) => detail.pools.includes(pool.slug));
  const activeBundles = (bundles.data ?? []).filter((bundle) => bundle.status === 'active' && detail.bundles.includes(bundle.id));
  const lastStay = detail.stays[0] ?? null;

  return (
    <div className="page cx-page">
      <BackLink href="#/cosmetics">All cosmetics</BackLink>
      <div className="cx-detail" data-rarity={detail.rarity ?? 'none'}>
        <section className="cx-detail__preview" aria-label="Preview">
          <div className="cx-detail__stage">
            <ZoomableImage src={current} alt={detail.name} type={detail.type} text={detail.type === 'player-title' || detail.type === 'voice-line' ? detail.name : undefined} />
          </div>
          {imageList.length > 1 && (
            <div className="cx-detail__gallery" role="group" aria-label="More images">
              {imageList.map((image, index) => (
                <button key={image} type="button" aria-label={`Image ${index + 1}`} aria-pressed={index === shown} onClick={() => setShown(index)}>
                  <Thumb src={image} width={140} />
                </button>
              ))}
            </div>
          )}
          <TrackButtons id={detail.id} name={detail.name} labels />
          <NotifyButton detail={detail} />
          <p className="cx-muted cx-muted--small">These marks are yours to set. This site can't see what you own in the game.</p>
        </section>

        <div className="cx-detail__info">
          <header className="cx-detail__head">
            <p className="cx-detail__eyebrow">{hero && <span className="cx-detail__portrait"><HeroPortrait id={hero.id} name={hero.name} role={hero.role} /></span>} {hero ? hero.name : 'Any hero'}</p>
            <h1 className="cx-detail__name">{detail.name}</h1>
            <p className="cx-detail__badges">
              <RarityTag rarity={detail.rarity} />
              <span className="cx-chip">{typeSingular(detail.type)}</span>
              <AvailabilityPill availability={detail.availability} />
              {detail.tags.filter((tag) => tag !== 'shop').map((tag) => <span key={tag} className="cx-chip">{TAG_LABEL[tag]}</span>)}
            </p>
          </header>

          {detail.description && <p className="cx-detail__description">{detail.description}</p>}

          <dl className="cx-facts">
            <Fact label="Type">{typeSingular(detail.type)}</Fact>
            {detail.rarity && <Fact label="Rarity"><RarityTag rarity={detail.rarity} /></Fact>}
            <Fact label="Hero">{hero ? <a className="text-link" href={`#/cosmetics?hero=${hero.id}`}>{hero.name}</a> : 'Any hero'}</Fact>
            {seasonLabel && <Fact label="Season introduced"><a className="text-link" href={`#/cosmetics?season=${detail.season}`}>{seasonLabel}</a></Fact>}
            {eventLabel && <Fact label="Event or release"><a className="text-link" href={`#/cosmetics?event=${detail.event}`}>{eventLabel}</a></Fact>}
            {detail.prices.length > 0 && <Fact label="Known price"><PriceList prices={detail.prices} /></Fact>}
            {detail.prices.length === 0 && detail.stays.length > 0 && detail.stays.every((stay) => stay.bundle) && <Fact label="Known price">Only recorded inside bundles, with no price of its own</Fact>}
            {detail.productIds.length > 0 && <Fact label={detail.productIds.length === 1 ? 'Product ID' : 'Product IDs'}><span className="cx-mono">{detail.productIds.join(', ')}</span></Fact>}
            {detail.acquisition.length > 0 && (
              <Fact label="How to get it">
                <ul className="cx-plain-list">{detail.acquisition.map((line) => <li key={line}>{line}</li>)}</ul>
              </Fact>
            )}
            {poolList.length > 0 && (
              <Fact label="Loot pools">
                <span className="cx-inline-links">{poolList.map((pool) => <a key={pool.slug} className="text-link" href={`#/loot-pools/${pool.slug}`}>{pool.name}</a>)}</span>
              </Fact>
            )}
            <Fact label="Shop status">
              {detail.availability === 'in-shop' ? (activeBundles.length > 0 ? `In the shop, in ${activeBundles.length === 1 ? 'a bundle' : `${activeBundles.length} bundles`}` : 'In the shop') : 'Not in the most recent shop data'}
            </Fact>
            <Fact label="Last seen in shop">{detail.lastSeen ? dayText(detail.lastSeen) : 'Not recorded'}</Fact>
            <Fact label="Shop appearances">{detail.seen > 0 ? formatInt(detail.seen) : 'None recorded'}</Fact>
          </dl>

          {detail.availability === 'in-shop' && detail.storeUrl && (
            <a className="btn btn--ghost cx-buy" href={detail.storeUrl} target="_blank" rel="noreferrer">
              <span>Buy on Battle.net <ExternalLink size={14} aria-hidden="true" /></span>
            </a>
          )}
          {lastStay?.price !== undefined && lastStay?.price !== null && <Note>The price shown is from the most recent recorded listing. Check the game before you buy.</Note>}

          <ShopHistory detail={detail} meta={context.data?.meta} />

          {detail.mythic && (
            <a className="cx-callout" href={`#/hub/mythics/${detail.mythic}`}><Sparkles size={16} aria-hidden="true" /> See this mythic's customization</a>
          )}

          <Collapsible title="Sources" icon={<CalendarClock size={15} aria-hidden="true" />} count={detail.sources.length} defaultOpen>
            <SourceList sources={detail.sources} />
          </Collapsible>
        </div>
      </div>

      {context.data && <RelatedItems detail={detail} context={context.data} bundles={bundles.data ?? []} />}
      {detail.bundles.length > 0 && !bundles.data && bundles.status === 'loading' && <div className="cx-muted"><Boxes size={14} aria-hidden="true" /> Loading bundles…</div>}
      <CatalogueCredits />
    </div>
  );
}
