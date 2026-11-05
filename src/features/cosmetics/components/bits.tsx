import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDashed, Clock, Database, ExternalLink, Heart, Info, Star, Store } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { cn, formatDateTime, formatRelative } from '../../../lib/format';
import { MissingDataError, useClock } from '../data';
import { formatCountdown, pageNumbers, secondsUntil } from '../core';
import { isSet } from '../core/collection';
import type { Availability, Price, Rarity, SourceRef } from '../core/types';
import { dayText, priceText, rarityLabel } from '../labels';
import { toggleMark, useCollection } from '../useCollection';

export function RarityTag({ rarity }: { rarity: Rarity | null | undefined }) {
  if (!rarity) return null;
  return <span className="cx-rarity" data-rarity={rarity}>{rarityLabel(rarity)}</span>;
}

const AVAILABILITY: Record<Availability, { label: string; hint: string; tone: 'good' | 'info' | 'muted' }> = {
  'in-shop': { label: 'In shop', hint: 'Listed in the most recent shop data, on its own or inside a bundle.', tone: 'good' },
  upcoming: { label: 'Coming soon', hint: 'Scheduled by the store but not on sale yet.', tone: 'info' },
  gallery: { label: 'Hero Gallery', hint: 'The source lists a Credits price, which means it can be unlocked in the Hero Gallery.', tone: 'info' },
  'not-listed': { label: 'Not in shop', hint: 'Not in the most recent shop data. It may still be available another way.', tone: 'muted' },
};

export function AvailabilityPill({ availability }: { availability: Availability }) {
  const info = AVAILABILITY[availability];
  return (
    <span className="cx-pill" data-tone={info.tone} title={info.hint}>
      {availability === 'in-shop' ? <Store size={12} aria-hidden="true" /> : <CircleDashed size={12} aria-hidden="true" />}
      {info.label}
    </span>
  );
}

export function PriceList({ prices, limit }: { prices: Price[]; limit?: number }) {
  if (prices.length === 0) return null;
  const shown = limit ? prices.slice(0, limit) : prices;
  return (
    <span className="cx-prices">
      {shown.map((price) => <span key={price.currency} className="cx-price" data-currency={price.currency}>{priceText(price)}</span>)}
    </span>
  );
}

/** The favorite, wishlist and owned marks. All of them are manual and saved by the visitor. */
export function TrackButtons({ id, name, labels = false, lead }: { id: string; name: string; labels?: boolean; lead?: React.ReactNode }) {
  const entries = useCollection();
  const favorite = isSet(entries, 'favorite', id);
  const wished = isSet(entries, 'wishlist', id);
  const owned = isSet(entries, 'owned', id);
  const marks = (
    <>
      <button type="button" className={cn('cx-track__button', favorite && 'is-on')} data-mark="favorite" aria-pressed={favorite} aria-label={`Favorite ${name}`} title="Favorite" onClick={() => toggleMark('favorite', id)}>
        <Heart size={labels ? 16 : 15} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
        {labels && <span>Favorite</span>}
      </button>
      <button type="button" className={cn('cx-track__button', wished && 'is-on')} data-mark="wishlist" aria-pressed={wished} aria-label={`Add ${name} to wishlist`} title="Wishlist" onClick={() => toggleMark('wishlist', id)}>
        <Star size={labels ? 16 : 15} aria-hidden="true" fill={wished ? 'currentColor' : 'none'} />
        {labels && <span>Wishlist</span>}
      </button>
      <button type="button" className={cn('cx-track__button', owned && 'is-on')} data-mark="owned" aria-pressed={owned} aria-label={`Mark ${name} as owned`} title="Mark as owned" onClick={() => toggleMark('owned', id)}>
        <Check size={labels ? 16 : 15} aria-hidden="true" strokeWidth={owned ? 3 : 2} />
        {labels && <span>{owned ? 'Owned' : 'Mark as owned'}</span>}
      </button>
    </>
  );
  return (
    <div className={cn('cx-track', labels && 'cx-track--labels', Boolean(lead) && 'cx-track--lead')}>
      {lead ? <>{lead}<span className="cx-track__marks">{marks}</span></> : marks}
    </div>
  );
}

export function Pagination({ page, pages, hrefFor, onPage }: { page: number; pages: number; hrefFor?: (page: number) => string; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  const go = (target: number) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    onPage(target);
  };
  const href = (target: number) => hrefFor?.(target) ?? '#';
  return (
    <nav className="cx-pagination" aria-label="Pages">
      {page > 1 ? (
        <a className="cx-pagination__item" href={href(page - 1)} onClick={go(page - 1)} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></a>
      ) : (
        <span className="cx-pagination__item is-disabled" aria-hidden="true"><ChevronLeft size={16} /></span>
      )}
      {pageNumbers(page, pages).map((value, index) =>
        value === null ? (
          <span key={`gap-${index}`} className="cx-pagination__gap" aria-hidden="true">…</span>
        ) : (
          <a key={value} className={cn('cx-pagination__item', value === page && 'is-active')} href={href(value)} onClick={go(value)} aria-current={value === page ? 'page' : undefined} aria-label={`Page ${value}`}>{value}</a>
        ),
      )}
      {page < pages ? (
        <a className="cx-pagination__item" href={href(page + 1)} onClick={go(page + 1)} aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></a>
      ) : (
        <span className="cx-pagination__item is-disabled" aria-hidden="true"><ChevronRight size={16} /></span>
      )}
    </nav>
  );
}

/** A live countdown. Only used with an end time the source supplied. */
export function Countdown({ until, prefix = 'Ends in' }: { until: string | null | undefined; prefix?: string }) {
  const now = useClock(30000);
  const seconds = secondsUntil(until ?? null, now);
  if (seconds === null) return null;
  return (
    <span className="cx-countdown" title={`Ends ${formatDateTime(Date.parse(until!))}`}>
      <Clock size={13} aria-hidden="true" />
      {seconds > 0 ? `${prefix} ${formatCountdown(seconds)}` : 'Ended'}
    </span>
  );
}

export function Collapsible({ title, icon, count, defaultOpen = false, children }: { title: string; icon?: ReactNode; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={cn('cx-collapse', open && 'is-open')}>
      <h3 className="cx-collapse__heading">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
          {icon}
          <span className="cx-collapse__title">{title}</span>
          {count !== undefined && <span className="cx-collapse__count">{count}</span>}
          <ChevronDown size={16} aria-hidden="true" className="cx-collapse__chevron" />
        </button>
      </h3>
      <div id={id} hidden={!open} className="cx-collapse__body">{open && children}</div>
    </section>
  );
}

/** Where a record came from and when it was last confirmed. */
export function SourceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="cx-sources">
      {sources.map((source) => (
        <li key={`${source.source}-${source.url}`}>
          <BadgeCheck size={14} aria-hidden="true" />
          <span>
            {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={11} aria-hidden="true" /></a> : source.title}
            {source.checkedAt && <span className="cx-sources__when"> · checked {dayText(source.checkedAt)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The link itemshop.gg asks for wherever its data appears. */
export function ItemshopCredit({ className }: { className?: string }) {
  return (
    <p className={cn('cx-credit', className)}>
      <Database size={13} aria-hidden="true" />
      <a href="https://itemshop.gg/overwatch" target="_blank" rel="noreferrer">Data from itemshop.gg</a>
    </p>
  );
}

export function PageHeader({ eyebrow, title, intro, actions, children }: { eyebrow?: string; title: string; intro?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="cx-page-head">
      <div className="cx-page-head__text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="cx-page-head__title">{title}</h1>
        {intro && <p className="cx-page-head__intro">{intro}</p>}
      </div>
      {actions && <div className="cx-page-head__actions">{actions}</div>}
      {children}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="cx-back" href={href}><ArrowLeft size={15} aria-hidden="true" /> {children}</a>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="cx-note"><Info size={14} aria-hidden="true" /><span>{children}</span></p>;
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | OW2 Hero Selector`;
  }, [title]);
}

export function GridSkeleton({ count = 12, tall = false }: { count?: number; tall?: boolean }) {
  return (
    <div className={cn('cx-grid', tall && 'cx-grid--wide')} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <div key={index} className="cx-skeleton-card" />)}
    </div>
  );
}

/** One way of showing "still loading", "nothing published" and "couldn't load" across every page. */
export function DataState({ status, error, retry, skeleton, what }: { status: 'loading' | 'ready' | 'error'; error?: Error; retry: () => void; skeleton?: ReactNode; what: string }) {
  if (status === 'loading') return <>{skeleton ?? <GridSkeleton />}</>;
  if (error instanceof MissingDataError) {
    return (
      <StateBlock icon={<Database size={24} />} title={`No ${what} published yet`}>
        This section fills in once the data has been imported. Nothing here is made up in the meantime.
      </StateBlock>
    );
  }
  return (
    <StateBlock tone="error" title={`Couldn't load ${what}`} actions={<button type="button" className="btn-plain" onClick={retry}>Try again</button>}>
      The stored files didn't load. Check your connection and try again.
    </StateBlock>
  );
}

export function ReadTime({ at }: { at: string | null | undefined }) {
  const now = useClock(30000);
  if (!at) return null;
  const time = Date.parse(at);
  if (!Number.isFinite(time)) return null;
  return <time dateTime={at} title={formatDateTime(time)}>{formatRelative(time, now)}</time>;
}
