import { useMemo } from 'react';
import { Check, Gem, Sparkles } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { HeroPortrait } from '../../../components/media';
import { cn, formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { isSet, mythicOptionId, mythicProgress } from '../core/collection';
import type { MythicItem } from '../core/types';
import { loadMythics, loadSeasons } from '../data';
import { BackLink, DataState, GridSkeleton, Note, PageHeader, SourceList, TrackButtons, usePageTitle } from '../components/bits';
import { Thumb, ZoomableImage } from '../components/media';
import { heroById } from '../labels';
import { CatalogueCredits, CatalogueScope } from './CosmeticsPage';
import { setMarks, toggleMark, useCollection } from '../useCollection';
import { useUrlState } from '../useUrlState';

type KindFilter = 'all' | 'skin' | 'weapon';

const parseKind = (query: string): KindFilter => {
  const value = new URLSearchParams(query).get('kind');
  return value === 'skin' || value === 'weapon' ? value : 'all';
};
const serializeKind = (kind: KindFilter) => (kind === 'all' ? '' : `kind=${kind}`);

function MythicCard({ item, seasonLabel }: { item: MythicItem; seasonLabel: string | null }) {
  const hero = heroById(item.hero);
  const entries = useCollection();
  const tracked = mythicProgress(item, entries);
  const owned = item.cosmeticId ? isSet(entries, 'owned', item.cosmeticId) : false;
  return (
    <a className={cn('cx-mythic', owned && 'is-owned')} href={`#/hub/mythics/${item.id}`} data-rarity="mythic">
      <div className="cx-mythic__media">
        <Thumb src={item.image} alt="" width={420} type={item.kind === 'weapon' ? 'weapon-skin' : 'skin'} />
        {hero && <span className="cx-hero-chip" title={hero.name}><HeroPortrait id={hero.id} name={hero.name} role={hero.role} /></span>}
      </div>
      <div className="cx-mythic__body">
        <h3 className="cx-mythic__name">{item.name}</h3>
        <p className="cx-mythic__line">{hero?.name ?? 'Any hero'}{seasonLabel ? ` · ${seasonLabel}` : ''}</p>
        <p className="cx-mythic__line">
          <span className="cx-chip">{item.kind === 'weapon' ? 'Weapon' : 'Skin'}</span>
          {item.prisms !== null && <span className="cx-price" data-currency="prisms">{formatInt(item.prisms)} Prisms</span>}
          {tracked.done > 0 && <span className="cx-bundle__owned">{tracked.done} / {tracked.total}</span>}
        </p>
      </div>
    </a>
  );
}

export function MythicsPage({ query, routeKey }: { query: string; routeKey: unknown }) {
  usePageTitle('Mythics');
  const mythics = useAsync(loadMythics, 'mythics');
  const seasons = useAsync(loadSeasons, 'seasons');
  const [kind, setKind] = useUrlState('#/hub/mythics', query, routeKey, parseKind, serializeKind);
  const labels = useMemo(() => new Map((seasons.data ?? []).map((season) => [season.id, season.label])), [seasons.data]);
  const order = useMemo(() => new Map((seasons.data ?? []).map((season, index) => [season.id, index])), [seasons.data]);
  const shown = useMemo(() => {
    const list = (mythics.data ?? []).filter((item) => kind === 'all' || item.kind === kind);
    return [...list].sort((a, b) => (order.get(b.season ?? '') ?? -1) - (order.get(a.season ?? '') ?? -1) || a.name.localeCompare(b.name));
  }, [mythics.data, kind, order]);
  const count = (value: KindFilter) => (mythics.data ?? []).filter((item) => value === 'all' || item.kind === value).length;

  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Hub" title="Mythics" intro="Mythic skins and weapons, with the customization each one offers, the season it came from, and your own tracking." />
      <CatalogueScope>For now, only mythics in the shop data are listed, and their customization details aren't known yet.</CatalogueScope>
      {mythics.data ? (
        mythics.data.length > 0 ? (
          <>
            <div className="cx-chips" role="group" aria-label="Kind">
              {(['all', 'skin', 'weapon'] as KindFilter[]).map((value) => (
                <button key={value} type="button" className={cn('cx-filter-chip', kind === value && 'is-active')} aria-pressed={kind === value} onClick={() => setKind(value)}>
                  {value === 'all' ? 'All' : value === 'skin' ? 'Skins' : 'Weapons'} <span className="cx-filter-chip__count">{count(value)}</span>
                </button>
              ))}
            </div>
            <div className="cx-grid cx-grid--mythic">{shown.map((item) => <MythicCard key={item.id} item={item} seasonLabel={item.season ? labels.get(item.season) ?? null : null} />)}</div>
          </>
        ) : (
          <StateBlock icon={<Sparkles size={24} />} title="No mythics imported yet">Mythics appear here once the catalogue has been imported.</StateBlock>
        )
      ) : (
        <DataState status={mythics.status} error={mythics.error} retry={mythics.retry} what="mythics" skeleton={<GridSkeleton />} />
      )}
      <Note>Current availability isn't shown, because no source confirms what the Mythic Shop holds right now. Check the game.</Note>
      <CatalogueCredits />
    </div>
  );
}

export function MythicDetailPage({ id }: { id: string }) {
  const mythics = useAsync(loadMythics, 'mythics');
  const seasons = useAsync(loadSeasons, 'seasons');
  const entries = useCollection();
  const item = mythics.data?.find((candidate) => candidate.id === id) ?? null;
  usePageTitle(item ? item.name : 'Mythic');

  if (!mythics.data) {
    return (
      <div className="page cx-page">
        <BackLink href="#/hub/mythics">All mythics</BackLink>
        <DataState status={mythics.status} error={mythics.error} retry={mythics.retry} what="this mythic" />
      </div>
    );
  }
  if (!item) {
    return (
      <div className="page cx-page">
        <BackLink href="#/hub/mythics">All mythics</BackLink>
        <StateBlock icon={<Sparkles size={24} />} title="That mythic isn't in the catalogue" actions={<a className="btn-plain" href="#/hub/mythics">See all mythics</a>}>The link may be old.</StateBlock>
      </div>
    );
  }

  const hero = heroById(item.hero);
  const tracked = mythicProgress(item, entries);
  const seasonLabel = seasons.data?.find((season) => season.id === item.season)?.label ?? null;
  const allOptions = item.options.flatMap((option) => Array.from({ length: option.count }, (_, index) => mythicOptionId(item.id, option.name, index + 1)));

  return (
    <div className="page cx-page">
      <BackLink href="#/hub/mythics">All mythics</BackLink>
      <div className="cx-detail" data-rarity="mythic">
        <section className="cx-detail__preview" aria-label="Preview">
          <div className="cx-detail__stage"><ZoomableImage src={item.image} alt={item.name} type={item.kind === 'weapon' ? 'weapon-skin' : 'skin'} /></div>
          {item.cosmeticId && <TrackButtons id={item.cosmeticId} name={item.name} labels />}
        </section>
        <div className="cx-detail__info">
          <header className="cx-detail__head">
            <p className="cx-detail__eyebrow">{hero && <span className="cx-detail__portrait"><HeroPortrait id={hero.id} name={hero.name} role={hero.role} /></span>} {hero?.name ?? 'Any hero'}</p>
            <h1 className="cx-detail__name">{item.name}</h1>
            <p className="cx-detail__badges">
              <span className="cx-rarity" data-rarity="mythic">Mythic</span>
              <span className="cx-chip">{item.kind === 'weapon' ? 'Weapon' : 'Skin'}</span>
              {seasonLabel && <span className="cx-chip">{seasonLabel}</span>}
            </p>
          </header>
          <dl className="cx-facts">
            {item.prisms !== null && <div className="cx-fact"><dt>Mythic Prisms</dt><dd><Gem size={14} aria-hidden="true" /> {formatInt(item.prisms)}</dd></div>}
            {seasonLabel && <div className="cx-fact"><dt>Season released</dt><dd>{seasonLabel}</dd></div>}
            {item.note && <div className="cx-fact"><dt>Note</dt><dd>{item.note}</dd></div>}
            {item.cosmeticId && <div className="cx-fact"><dt>Catalogue</dt><dd><a className="text-link" href={`#/cosmetics/${item.cosmeticId}`}>Open this cosmetic's page</a></dd></div>}
          </dl>

          {item.options.length > 0 ? (
            <section className="cx-mythic-options">
              <header className="cx-related__head">
                <h2 className="cx-section-title">Customization</h2>
                <span className="cx-muted">{tracked.done} of {tracked.total} marked</span>
              </header>
              <div className="cx-meter" role="progressbar" aria-label="Customization options marked as unlocked" aria-valuemin={0} aria-valuemax={tracked.total} aria-valuenow={tracked.done}><span style={{ width: `${tracked.percent}%` }} /></div>
              {item.options.map((option) => (
                <div key={option.name} className="cx-option">
                  <h3 className="cx-option__name">{option.name}</h3>
                  <div className="cx-option__choices">
                    {Array.from({ length: option.count }, (_, index) => {
                      const optionId = mythicOptionId(item.id, option.name, index + 1);
                      const on = isSet(entries, 'mythic', optionId);
                      return (
                        <button key={optionId} type="button" className={cn('cx-option__choice', on && 'is-on')} aria-pressed={on} aria-label={`${option.name} option ${index + 1}`} onClick={() => toggleMark('mythic', optionId)}>
                          {on ? <Check size={14} aria-hidden="true" /> : index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="cx-tracker__actions">
                <button type="button" className="cx-tool" disabled={tracked.done === tracked.total} onClick={() => setMarks('mythic', allOptions, true)}>Mark all unlocked</button>
                <button type="button" className="cx-tool" disabled={tracked.done === 0} onClick={() => setMarks('mythic', allOptions, false)}>Clear marks</button>
              </div>
              <p className="cx-muted cx-muted--small">The source lists how many choices each group has, not what each looks like, so choices are numbered. Your marks stay on this device or account.</p>
            </section>
          ) : (
            <Note>No source lists this mythic's customization groups, so none are shown.</Note>
          )}
          <SourceList sources={item.sources} />
        </div>
      </div>
      <CatalogueCredits />
    </div>
  );
}
