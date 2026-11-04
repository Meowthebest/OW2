import { ExternalLink, MessageSquareText, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn, formatDateTime, formatRelative } from '../../../lib/format';
import type { HeroClass, PatchIndex, PatchMeta, PatchType } from '../core/types';
import type { BalanceFilter } from '../filters';
import { formatPatchDate } from '../format';
import { CLASS_ICON } from './Direction';

const TYPE_LABEL: Record<PatchType, string> = {
  season: 'Season start',
  balance: 'Balance patch',
  hotfix: 'Hotfix',
  limited: 'Limited-time mode',
  update: 'General update',
};

export const typeLabel = (type: PatchType) => TYPE_LABEL[type];

const STALE_AFTER = 3 * 24 * 60 * 60 * 1000;

function HeroTile({ label, value, classification, active, onPick, filter }: { label: string; value: number; classification: HeroClass; active: boolean; onPick: (filter: BalanceFilter) => void; filter: BalanceFilter }) {
  const Icon = CLASS_ICON[classification];
  return (
    <button type="button" className={cn('patch-tile', active && 'is-active')} data-class={classification} aria-pressed={active} onClick={() => onPick(active ? 'all' : filter)}>
      <span className="patch-tile__icon" aria-hidden="true"><Icon size={18} strokeWidth={2.8} /></span>
      <span className="patch-tile__value">{value}</span>
      <span className="patch-tile__label">{label}</span>
    </button>
  );
}

export function PatchHeader({ patch, index, isLatest, balance, onPickBalance, newer }: { patch: PatchMeta; index: PatchIndex; isLatest: boolean; balance: BalanceFilter; onPickBalance: (filter: BalanceFilter) => void; newer: PatchMeta | null }) {
  const { counts } = patch;
  const checkedAt = Date.parse(index.lastCheckedAt);
  const stale = Date.now() - checkedAt > STALE_AFTER;
  const pending = counts.needsReview;

  return (
    <section className="patch-hero" aria-labelledby="patch-hero-title">
      <div className="patch-hero__intro">
        <span className="eyebrow">{isLatest ? 'Latest patch' : 'Selected patch'}</span>
        <h1 className="patch-hero__title" id="patch-hero-title">{patch.title || `Patch notes, ${formatPatchDate(patch.date)}`}</h1>
        <p className="patch-hero__meta">
          <span>Released {formatPatchDate(patch.date)}</span>
          {patch.season && <span className="tag tag--accent">{patch.season.label}</span>}
          <span className="tag">{TYPE_LABEL[patch.type]}</span>
        </p>
        {newer && (
          <p className="patch-hero__newer">
            A newer update from {formatPatchDate(newer.date)} has no hero changes. <a className="text-link" href={`#/patches?patch=${newer.id}`}>See that update</a>
          </p>
        )}
      </div>

      <div className="patch-hero__tiles" role="group" aria-label="Unique heroes by result. Choose one to filter the list.">
        <HeroTile label="Heroes buffed" value={counts.heroesBuffed} classification="buff" filter="buff" active={balance === 'buff'} onPick={onPickBalance} />
        <HeroTile label="Heroes nerfed" value={counts.heroesNerfed} classification="nerf" filter="nerf" active={balance === 'nerf'} onPick={onPickBalance} />
        <HeroTile label="Mixed changes" value={counts.heroesMixed} classification="mixed" filter="mixed" active={balance === 'mixed'} onPick={onPickBalance} />
        <HeroTile label="Neutral heroes" value={counts.heroesNeutral} classification="neutral" filter="neutral" active={balance === 'neutral'} onPick={onPickBalance} />
        {counts.heroesNeedsReview > 0 && <HeroTile label="Needs review" value={counts.heroesNeedsReview} classification="needs-review" filter="review" active={balance === 'review'} onPick={onPickBalance} />}
        <div className="patch-tile patch-tile--wide">
          <span className="patch-tile__value">{counts.gameplayChanges}</span>
          <span className="patch-tile__label">Gameplay changes</span>
          <span className="patch-tile__detail">
            {counts.buffs} buff lines, {counts.nerfs} nerf lines, {counts.neutral} neutral{counts.needsReview > 0 ? `, ${counts.needsReview} needing review` : ''}
          </span>
        </div>
      </div>

      <p className="patch-hero__extras">
        Hero counts are unique heroes in standard play. Change counts are individual lines.
        {' '}<b>{counts.qol}</b> quality-of-life {counts.qol === 1 ? 'line' : 'lines'}, <b>{counts.bugFixes}</b> bug {counts.bugFixes === 1 ? 'fix' : 'fixes'}
        {counts.sixVsSix > 0 && <>, <b>{counts.sixVsSix}</b> 6v6-only {counts.sixVsSix === 1 ? 'line' : 'lines'}</>}.
        {counts.stadiumChanges > 0 && <> Stadium is counted separately: <b>{counts.stadiumHeroes}</b> {counts.stadiumHeroes === 1 ? 'hero' : 'heroes'}, <b>{counts.stadiumChanges}</b> {counts.stadiumChanges === 1 ? 'line' : 'lines'}.</>}
        {counts.limitedChanges > 0 && <> Limited-time modes are also separate: <b>{counts.limitedHeroes}</b> {counts.limitedHeroes === 1 ? 'hero' : 'heroes'}, <b>{counts.limitedChanges}</b> {counts.limitedChanges === 1 ? 'line' : 'lines'}.</>}
      </p>

      <div className={cn('patch-hero__verify', stale && 'is-stale')}>
        {stale ? <TriangleAlert size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
        <p>
          {stale ? (
            <>The last check of Blizzard's notes was {formatRelative(checkedAt)}, so this may be out of date. The last verified data is still shown.</>
          ) : (
            <>Values come from Blizzard's official notes. Last checked {formatRelative(checkedAt)} <span className="patch-hero__when">({formatDateTime(checkedAt)})</span>.</>
          )}
          {' '}
          {patch.reviewedAt ? <>Classifications reviewed {formatPatchDate(patch.reviewedAt, 'short')}.</> : <>Classified by rules{pending > 0 ? `, with ${pending} standard ${pending === 1 ? 'line' : 'lines'} left as Needs Review` : ''}.</>}
        </p>
        <span className="patch-hero__links">
          <a className="text-link" href={patch.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /> Official patch notes</a>
          {patch.forumUrl && <a className="text-link" href={patch.forumUrl} target="_blank" rel="noreferrer"><MessageSquareText size={14} aria-hidden="true" /> Forum post</a>}
        </span>
      </div>
    </section>
  );
}
