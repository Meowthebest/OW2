import { Layers, Package, ShoppingBag } from 'lucide-react';
import { HeroPortrait } from '../../../components/media';
import { cn } from '../../../lib/format';
import { isSet, bundleProgress } from '../core/collection';
import { HERO_BOUND_TYPES } from '../core/shop';
import type { Bundle, BundleItem, CatalogRow } from '../core/types';
import { dayText, heroById, heroLabel, sourcePriceText, TAG_LABEL, typeSingular } from '../labels';
import { useCollection } from '../useCollection';
import { AvailabilityPill, Countdown, PriceList, RarityTag, TrackButtons } from './bits';
import { Thumb, TypeIcon } from './media';

const textOnly = (row: Pick<CatalogRow, 'type' | 'name'>) => (row.type === 'player-title' || row.type === 'voice-line' ? row.name : undefined);

function HeroChip({ hero }: { hero: string | null }) {
  const info = heroById(hero);
  if (!info) return null;
  return (
    <span className="cx-hero-chip" title={info.name}>
      <HeroPortrait id={info.id} name={info.name} role={info.role} />
    </span>
  );
}

/** A compact gallery card. Every card has the same height, whatever its name or how much is known about it. */
export function CosmeticCard({ row, seasonLabel }: { row: CatalogRow; seasonLabel?: string | null }) {
  const entries = useCollection();
  const owned = isSet(entries, 'owned', row.id);
  const tags = row.tags.filter((tag) => tag !== 'gallery').slice(0, 2);
  return (
    <article className={cn('cx-card', owned && 'is-owned')} data-rarity={row.rarity ?? 'none'}>
      <a className="cx-card__link" href={`#/cosmetics/${row.id}`}>
        <div className="cx-card__media">
          <Thumb src={row.image} alt="" width={360} type={row.type} text={textOnly(row)} />
          <HeroChip hero={row.hero} />
          <AvailabilityPill availability={row.availability} />
        </div>
        <div className="cx-card__body">
          <p className="cx-card__kind">
            <span><TypeIcon type={row.type} size={12} /> {typeSingular(row.type)}</span>
            <RarityTag rarity={row.rarity} />
          </p>
          <h3 className="cx-card__name">{row.name}</h3>
          <p className="cx-card__hero">{row.hero ? heroLabel(row.hero) : 'Any hero'}</p>
          <div className="cx-card__foot">
            <PriceList prices={row.prices} limit={1} />
            {(tags.length > 0 || seasonLabel) && (
              <span className="cx-card__tags">
                {tags.map((tag) => <span key={tag} className="cx-chip">{TAG_LABEL[tag]}</span>)}
                {seasonLabel && <span className="cx-chip">{seasonLabel}</span>}
              </span>
            )}
          </div>
        </div>
      </a>
      <TrackButtons id={row.id} name={row.name} />
    </article>
  );
}

/** The same record as a table-like row, for the list view. */
export function CosmeticListRow({ row, seasonLabel }: { row: CatalogRow; seasonLabel?: string | null }) {
  const entries = useCollection();
  const owned = isSet(entries, 'owned', row.id);
  return (
    <li className={cn('cx-row', owned && 'is-owned')} data-rarity={row.rarity ?? 'none'}>
      <a className="cx-row__link" href={`#/cosmetics/${row.id}`}>
        <span className="cx-row__media"><Thumb src={row.image} alt="" width={120} type={row.type} /></span>
        <span className="cx-row__main">
          <span className="cx-row__name">{row.name}</span>
          <span className="cx-row__sub">{typeSingular(row.type)} · {row.hero ? heroLabel(row.hero) : 'Any hero'}{seasonLabel ? ` · ${seasonLabel}` : ''}</span>
        </span>
        <span className="cx-row__rarity"><RarityTag rarity={row.rarity} /></span>
        <span className="cx-row__price"><PriceList prices={row.prices} limit={1} /></span>
        <span className="cx-row__status"><AvailabilityPill availability={row.availability} /></span>
        <span className="cx-row__seen">{row.lastSeen ? `Seen ${dayText(row.lastSeen)}` : ''}</span>
      </a>
      <TrackButtons id={row.id} name={row.name} />
    </li>
  );
}

export function BundleCard({ bundle }: { bundle: Bundle }) {
  const entries = useCollection();
  const tracked = bundleProgress(bundle, entries);
  const count = Math.max(bundle.statedCount ?? 0, bundle.items.length);
  return (
    <article className="cx-bundle" data-rarity={bundle.rarity ?? 'none'}>
      <a className="cx-bundle__link" href={`#/bundles/${bundle.id}`}>
        <div className="cx-bundle__media">
          <Thumb src={bundle.image} alt="" width={640} fit="cover" />
          {bundle.status === 'active' ? (
            <span className="cx-pill" data-tone="good"><ShoppingBag size={12} aria-hidden="true" /> In shop</span>
          ) : (
            <span className="cx-pill" data-tone="muted">Not in shop</span>
          )}
        </div>
        <div className="cx-bundle__body">
          <h3 className="cx-bundle__name">{bundle.name}</h3>
          <p className="cx-bundle__line">
            {bundle.price && <span className="cx-price">{sourcePriceText(bundle.price.amount, bundle.price.currency, bundle.price.label)}</span>}
            {count > 0 && <span className="cx-bundle__count"><Layers size={13} aria-hidden="true" /> {count} {count === 1 ? 'item' : 'items'}</span>}
          </p>
          <p className="cx-bundle__line cx-bundle__line--quiet">
            {bundle.status === 'active' && bundle.until ? <Countdown until={bundle.until} /> : bundle.lastSeen ? <span>Last seen {dayText(bundle.lastSeen)}</span> : <span />}
            {tracked.total > 0 && tracked.done > 0 && <span className="cx-bundle__owned">{tracked.done} / {tracked.total} owned</span>}
          </p>
        </div>
      </a>
    </article>
  );
}

/** A bundle's item. Something that isn't a cosmetic, such as coins or tier skips, has no page to open. */
export function BundleItemCard({ item, bundleName }: { item: BundleItem; bundleName: string }) {
  const inner = (
    <>
      <div className="cx-card__media">
        <Thumb src={item.image} alt="" width={360} type={item.type} text={item.type === 'player-title' || item.type === 'voice-line' ? item.name : undefined} />
        <HeroChip hero={item.hero} />
      </div>
      <div className="cx-card__body">
        <p className="cx-card__kind">
          <span>{item.type ? <><TypeIcon type={item.type} size={12} /> {typeSingular(item.type)}</> : <><Package size={12} aria-hidden="true" /> Also included</>}</span>
          <RarityTag rarity={item.rarity} />
        </p>
        <h3 className="cx-card__name">{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</h3>
        <p className="cx-card__hero">{item.hero ? heroLabel(item.hero) : item.type ? (HERO_BOUND_TYPES.has(item.type) ? 'Hero not stated' : 'Any hero') : ' '}</p>
        <div className="cx-card__foot"><PriceList prices={item.prices} limit={1} /></div>
      </div>
    </>
  );
  return (
    <article className="cx-card" data-rarity={item.rarity ?? 'none'}>
      {item.id ? <a className="cx-card__link" href={`#/cosmetics/${item.id}`}>{inner}</a> : <div className="cx-card__link">{inner}</div>}
      {item.id && <TrackButtons id={item.id} name={`${item.name} from ${bundleName}`} />}
    </article>
  );
}
