import { useMemo } from 'react';
import { Box, Gift, HeartHandshake, Trophy, type LucideIcon } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import type { LootPool } from '../core/types';
import { loadPools } from '../data';
import { BackLink, DataState, GridSkeleton, Note, PageHeader, SourceList, usePageTitle } from '../components/bits';
import { Gallery } from '../components/Gallery';
import { CatalogueCredits, useGalleryContext } from './CosmeticsPage';

const POOL_ICON: Record<string, LucideIcon> = {
  standard: Box,
  esports: Trophy,
  anniversary: Gift,
  'just-for-you': HeartHandshake,
};

function PoolCard({ pool }: { pool: LootPool }) {
  const Icon = POOL_ICON[pool.slug] ?? Box;
  return (
    <a className="cx-pool" href={`#/loot-pools/${pool.slug}`} data-pool={pool.slug}>
      <span className="cx-pool__icon" aria-hidden="true"><Icon size={30} /></span>
      <h2 className="cx-pool__name">{pool.name}</h2>
      <p className="cx-pool__count">{pool.count === null ? 'No list published' : `${formatInt(pool.count)} ${pool.confirmed ? 'cosmetics' : 'related cosmetics'}`}</p>
      <p className="cx-pool__text">{pool.description}</p>
      <span className="cx-pool__action">{pool.count === null ? 'What we know' : 'Browse pool'}</span>
    </a>
  );
}

export function LootPoolsPage() {
  usePageTitle('Loot Pools');
  const pools = useAsync(loadPools, 'pools');
  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Cosmetics" title="Loot Pools" intro="Which cosmetics each kind of loot box or offer can draw from, as far as a source says. A cosmetic can be in several pools." />
      {pools.data ? (
        pools.data.length > 0 ? (
          <div className="cx-pools">{pools.data.map((pool) => <PoolCard key={pool.slug} pool={pool} />)}</div>
        ) : (
          <StateBlock icon={<Box size={24} />} title="No pools published yet">Loot pools appear here once their rules have been checked against a source.</StateBlock>
        )
      ) : (
        <DataState status={pools.status} error={pools.error} retry={pools.retry} what="loot pools" skeleton={<GridSkeleton count={4} tall />} />
      )}
      <Note>This site doesn't publish drop chances, and being in a pool doesn't mean a cosmetic is likely to appear.</Note>
      <CatalogueCredits />
    </div>
  );
}

export function LootPoolDetailPage({ slug, query, routeKey }: { slug: string; query: string; routeKey: unknown }) {
  const pools = useAsync(loadPools, 'pools');
  const data = useGalleryContext();
  const pool = pools.data?.find((item) => item.slug === slug) ?? null;
  usePageTitle(pool ? pool.name : 'Loot Pool');
  const fixed = useMemo(() => ({ pool: slug }), [slug]);

  if (!pools.data || !data.data) {
    const failed = pools.status === 'error' ? pools : data;
    return (
      <div className="page cx-page">
        <BackLink href="#/loot-pools">All loot pools</BackLink>
        <DataState status={failed.status === 'ready' ? 'loading' : failed.status} error={failed.error} retry={failed.retry} what="this pool" />
      </div>
    );
  }
  if (!pool) {
    return (
      <div className="page cx-page">
        <BackLink href="#/loot-pools">All loot pools</BackLink>
        <StateBlock icon={<Box size={24} />} title="That loot pool doesn't exist" actions={<a className="btn-plain" href="#/loot-pools">See all pools</a>}>The link may be old.</StateBlock>
      </div>
    );
  }

  const inPool = data.data.rows.filter((row) => row.pools.includes(slug));
  return (
    <div className="page cx-page">
      <BackLink href="#/loot-pools">All loot pools</BackLink>
      <PageHeader eyebrow="Loot pool" title={pool.name} intro={pool.description} />
      <Note>{pool.basis}</Note>
      {slug === 'just-for-you' && <Note>This is a general list of what the offer can include. It isn't your personal offer, which only the game can show.</Note>}
      {pool.count === null ? (
        <StateBlock icon={<Box size={24} />} title="No list published">No source lists this pool's contents, so nothing is shown rather than guessed.</StateBlock>
      ) : (
        <Gallery context={{ ...data.data, rows: inPool }} path={`#/loot-pools/${slug}`} query={query} routeKey={routeKey} fixed={fixed} />
      )}
      <SourceList sources={pool.sources} />
      <CatalogueCredits />
    </div>
  );
}
