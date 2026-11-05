import { useMemo, useState } from 'react';
import { Check, CheckCheck, Lock, Ticket, Undo2 } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { cn, formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { isSet, passProgress, tierId } from '../core/collection';
import type { BattlePass, PassReward } from '../core/types';
import { loadPass, loadPasses } from '../data';
import { BackLink, DataState, GridSkeleton, Note, PageHeader, RarityTag, SourceList, usePageTitle } from '../components/bits';
import { Thumb, TypeIcon } from '../components/media';
import { dayText, heroLabel, typeSingular } from '../labels';
import { setMarks, toggleMark, useCollection } from '../useCollection';
import { CatalogueCredits, CatalogueScope } from './CosmeticsPage';

const TIERS_PER_RANGE = 10;

function PassCard({ pass, current }: { pass: Omit<BattlePass, 'rewards'>; current: boolean }) {
  return (
    <a className="cx-pass" href={`#/hub/battle-passes/${pass.id}`}>
      <div className="cx-pass__media">
        <Thumb src={pass.image} alt="" width={520} fit="cover" />
        {current && <span className="cx-pill" data-tone="good">Current</span>}
      </div>
      <div className="cx-pass__body">
        <h3 className="cx-pass__name">{pass.label}</h3>
        {pass.title && <p className="cx-pass__title">{pass.title}</p>}
        <p className="cx-pass__line">{pass.rewardCount > 0 ? `${formatInt(pass.rewardCount)} rewards` : 'Rewards not listed'}{pass.start ? ` · ${dayText(pass.start)}` : ''}</p>
      </div>
    </a>
  );
}

export function BattlePassesPage() {
  usePageTitle('Battle Passes');
  const passes = useAsync(loadPasses, 'passes');
  const list = useMemo(() => [...(passes.data ?? [])].sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '')), [passes.data]);
  const today = new Date().toISOString().slice(0, 10);
  const isCurrent = (pass: Omit<BattlePass, 'rewards'>) => Boolean(pass.start && pass.start <= today && (!pass.end || pass.end > today));
  const current = list.filter(isCurrent);
  const previous = list.filter((pass) => !isCurrent(pass));
  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Hub" title="Battle Passes" intro="Every Battle Pass the catalogue knows, with tier-by-tier rewards and your own progress." />
      <CatalogueScope>For now, seasons are listed without their tier-by-tier rewards.</CatalogueScope>
      {passes.data ? (
        list.length > 0 ? (
          <>
            {current.length > 0 && (
              <section className="cx-related">
                <header className="cx-related__head"><h2 className="cx-section-title">Current season</h2></header>
                <div className="cx-grid cx-grid--wide">{current.map((pass) => <PassCard key={pass.id} pass={pass} current />)}</div>
              </section>
            )}
            {previous.length > 0 && (
              <section className="cx-related">
                <header className="cx-related__head"><h2 className="cx-section-title">Previous seasons</h2></header>
                <div className="cx-grid cx-grid--wide">{previous.map((pass) => <PassCard key={pass.id} pass={pass} current={false} />)}</div>
              </section>
            )}
          </>
        ) : (
          <StateBlock icon={<Ticket size={24} />} title="No Battle Passes imported yet">Passes appear here once the catalogue has been imported.</StateBlock>
        )
      ) : (
        <DataState status={passes.status} error={passes.error} retry={passes.retry} what="Battle Passes" skeleton={<GridSkeleton count={6} tall />} />
      )}
      <Note>Old rewards aren't always obtainable now. Unvaulting rules change from season to season, so check the game before counting on one.</Note>
      <CatalogueCredits />
    </div>
  );
}

function RewardCard({ reward }: { reward: PassReward }) {
  const entries = useCollection();
  const owned = reward.id ? isSet(entries, 'owned', reward.id) : false;
  const body = (
    <>
      <div className="cx-reward__media">
        <Thumb src={reward.image} alt="" width={200} type={reward.type} text={reward.type === 'player-title' || reward.type === 'voice-line' ? reward.name : undefined} />
      </div>
      <div className="cx-reward__text">
        <span className="cx-reward__track" data-track={reward.track}>{reward.track === 'free' ? 'Free' : <><Lock size={10} aria-hidden="true" /> Premium</>}</span>
        <span className="cx-reward__name">{reward.name}{reward.quantity && reward.quantity > 1 ? ` × ${reward.quantity}` : ''}</span>
        <span className="cx-reward__meta">
          {reward.type ? <><TypeIcon type={reward.type} size={11} /> {typeSingular(reward.type)}</> : reward.typeLabel}
          {reward.hero ? ` · ${heroLabel(reward.hero)}` : ''}
        </span>
        <RarityTag rarity={reward.rarity} />
      </div>
      {owned && <span className="cx-reward__owned"><Check size={12} aria-hidden="true" /> Owned</span>}
    </>
  );
  return (
    <li className="cx-reward" data-rarity={reward.rarity ?? 'none'}>
      {reward.id ? <a href={`#/cosmetics/${reward.id}`}>{body}</a> : <div>{body}</div>}
    </li>
  );
}

function TierBrowser({ pass }: { pass: BattlePass }) {
  const entries = useCollection();
  const tiers = useMemo(() => [...new Set(pass.rewards.map((reward) => reward.tier))].sort((a, b) => a - b), [pass.rewards]);
  const maxTier = tiers[tiers.length - 1] ?? 0;
  const ranges = useMemo(() => {
    const list: Array<{ from: number; to: number }> = [];
    for (let from = 1; from <= maxTier; from += TIERS_PER_RANGE) list.push({ from, to: Math.min(from + TIERS_PER_RANGE - 1, maxTier) });
    return list;
  }, [maxTier]);
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = ranges[Math.min(rangeIndex, ranges.length - 1)];
  if (!range) return null;
  const visible = tiers.filter((tier) => tier >= range.from && tier <= range.to);
  const inRange = visible.map((tier) => tierId(pass.id, tier));
  const doneInRange = inRange.filter((id) => isSet(entries, 'tier', id)).length;

  return (
    <section className="cx-tiers">
      <div className="cx-chips" role="group" aria-label="Tier range">
        {ranges.map((option, index) => (
          <button key={option.from} type="button" className={cn('cx-filter-chip', index === rangeIndex && 'is-active')} aria-pressed={index === rangeIndex} onClick={() => setRangeIndex(index)}>{option.from}–{option.to}</button>
        ))}
      </div>
      <div className="cx-tracker__actions">
        <button type="button" className="cx-tool" disabled={doneInRange === inRange.length} onClick={() => setMarks('tier', inRange, true)}><CheckCheck size={14} aria-hidden="true" /> Mark {range.from}–{range.to} done</button>
        <button type="button" className="cx-tool" disabled={doneInRange === 0} onClick={() => setMarks('tier', inRange, false)}><Undo2 size={14} aria-hidden="true" /> Clear these</button>
      </div>
      <ol className="cx-tier-list">
        {visible.map((tier) => {
          const done = isSet(entries, 'tier', tierId(pass.id, tier));
          return (
            <li key={tier} className={cn('cx-tier', done && 'is-done')}>
              <button type="button" className="cx-tier__head" aria-pressed={done} aria-label={`Tier ${tier}, mark as completed`} onClick={() => toggleMark('tier', tierId(pass.id, tier))}>
                <span className="cx-tier__number">{tier}</span>
                <span className="cx-tier__check">{done && <Check size={14} aria-hidden="true" />}</span>
              </button>
              <ul className="cx-tier__rewards">
                {pass.rewards.filter((reward) => reward.tier === tier).map((reward, index) => <RewardCard key={`${reward.track}-${index}`} reward={reward} />)}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function BattlePassDetailPage({ id }: { id: string }) {
  const pass = useAsync(() => loadPass(id), id);
  const entries = useCollection();
  const detail = pass.data?.id === id ? pass.data : null;
  usePageTitle(detail ? detail.label : 'Battle Pass');

  if (!detail) {
    return (
      <div className="page cx-page">
        <BackLink href="#/hub/battle-passes">All Battle Passes</BackLink>
        <DataState status={pass.status === 'ready' ? 'loading' : pass.status} error={pass.error} retry={pass.retry} what="this Battle Pass" />
      </div>
    );
  }

  const progress = passProgress(detail, entries);
  const free = detail.rewards.filter((reward) => reward.track === 'free').length;
  const premium = detail.rewards.length - free;

  return (
    <div className="page cx-page">
      <BackLink href="#/hub/battle-passes">All Battle Passes</BackLink>
      <PageHeader eyebrow="Battle Pass" title={detail.label} intro={detail.title ?? undefined} />
      <dl className="cx-facts cx-facts--inline">
        {detail.start && <div className="cx-fact"><dt>Started</dt><dd>{dayText(detail.start)}</dd></div>}
        {detail.end && <div className="cx-fact"><dt>Ended</dt><dd>{dayText(detail.end)}</dd></div>}
        {detail.tiers !== null && <div className="cx-fact"><dt>Tiers</dt><dd>{formatInt(detail.tiers)}</dd></div>}
        <div className="cx-fact"><dt>Rewards listed</dt><dd>{formatInt(detail.rewards.length)}{detail.rewards.length > 0 ? ` (${formatInt(free)} free, ${formatInt(premium)} premium)` : ''}</dd></div>
      </dl>
      {detail.note && <Note>{detail.note}</Note>}
      {detail.rewards.length > 0 ? (
        <>
          <div className="cx-tracker cx-tracker--wide">
            <p className="cx-tracker__label"><strong>Your progress: {progress.tiers.percent}%</strong> of tiers marked done ({progress.tiers.done} / {progress.tiers.total})</p>
            <div className="cx-meter" role="progressbar" aria-label="Tiers marked as completed" aria-valuemin={0} aria-valuemax={progress.tiers.total} aria-valuenow={progress.tiers.done}><span style={{ width: `${progress.tiers.percent}%` }} /></div>
            <p className="cx-muted cx-muted--small">{formatInt(progress.cosmetics.done)} of {formatInt(progress.cosmetics.total)} cosmetics marked as owned, {formatInt(progress.remaining)} remaining. You set these yourself. This site can't see your in-game progress.</p>
          </div>
          <TierBrowser pass={detail} />
        </>
      ) : (
        <StateBlock icon={<Ticket size={24} />} title="Rewards not listed">No source lists this pass's tier-by-tier rewards, so nothing is shown rather than guessed.</StateBlock>
      )}
      <SourceList sources={detail.sources} />
      <CatalogueCredits />
    </div>
  );
}
