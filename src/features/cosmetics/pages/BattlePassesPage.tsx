import { useMemo, useState } from 'react';
import { Box, Check, CheckCheck, Coins, Gem, Gift, Lock, Ticket, Undo2, UserPlus, Zap } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { cn, formatInt } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { isSet, passProgress, rewardTierKey, tierId } from '../core/collection';
import type { BattlePass, PassReward, PassRules } from '../core/types';
import { loadPass, loadPassRules, loadPasses } from '../data';
import { BackLink, DataState, GridSkeleton, Note, PageHeader, RarityTag, SourceList, usePageTitle } from '../components/bits';
import { Thumb, TypeIcon } from '../components/media';
import { dayText, heroLabel, typeSingular } from '../labels';
import { setMarks, toggleMark, useCollection } from '../useCollection';
import { CatalogueCredits, CatalogueScope } from './CosmeticsPage';

const TIERS_PER_RANGE = 10;

const today = () => new Date().toISOString().slice(0, 10);
const isCurrent = (pass: Pick<BattlePass, 'start' | 'end'>) => Boolean(pass.start && pass.start <= today() && (!pass.end || pass.end > today()));

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '');

/** What buying a past pass gets you, from the rules the source gives. */
function UnvaultNote({ rules }: { rules: PassRules }) {
  return (
    <Note>
      A past Battle Pass can be bought for {formatInt(rules.coins)} Coins{rules.excludes.length > 0 ? `, without ${list(rules.excludes.map((item) => (item === 'Player titles' ? 'player titles' : item)))}` : ''}. This comes from the wiki, so check the game before buying.
    </Note>
  );
}

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
  const rules = useAsync(loadPassRules, 'pass rules');
  const sorted = useMemo(() => [...(passes.data ?? [])].sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '')), [passes.data]);
  const current = sorted.filter(isCurrent);
  const previous = sorted.filter((pass) => !isCurrent(pass));
  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Hub" title="Battle Passes" intro="Every Battle Pass the catalogue knows, with tier-by-tier rewards and your own progress." />
      <CatalogueScope>For now, seasons are listed without their tier-by-tier rewards.</CatalogueScope>
      {passes.data ? (
        sorted.length > 0 ? (
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
      {rules.data ? <UnvaultNote rules={rules.data} /> : <Note>Old rewards aren't always obtainable now, so check the game before counting on one.</Note>}
      {rules.data && <SourceList sources={rules.data.sources} />}
      <CatalogueCredits />
    </div>
  );
}

/** Rewards that aren't cosmetics have no picture, so each kind gets its own icon. */
const REWARD_ICON: Record<string, typeof Coins> = { Credits: Coins, Coins, 'Mythic Prisms': Gem, 'Loot Box': Box, Hero: UserPlus, 'XP boost': Zap };

function RewardCard({ reward, past }: { reward: PassReward; past: boolean }) {
  const entries = useCollection();
  const owned = reward.id ? isSet(entries, 'owned', reward.id) : false;
  const Icon = REWARD_ICON[reward.typeLabel ?? ''] ?? Gift;
  const body = (
    <>
      <div className="cx-reward__media">
        {reward.type || reward.image ? (
          <Thumb src={reward.image} alt="" width={200} type={reward.type} text={reward.type === 'player-title' || reward.type === 'voice-line' ? reward.name : undefined} />
        ) : (
          <span className="cx-reward__glyph"><Icon size={22} aria-hidden="true" /></span>
        )}
      </div>
      <div className="cx-reward__text">
        <span className="cx-reward__track" data-track={reward.track}>{reward.track === 'free' ? 'Free' : reward.track === 'both' ? 'Free and Premium' : <><Lock size={10} aria-hidden="true" /> Premium</>}</span>
        <span className="cx-reward__name">{reward.name}{reward.quantity && reward.quantity > 1 ? ` × ${reward.quantity}` : ''}</span>
        <span className="cx-reward__meta">
          {reward.type ? <><TypeIcon type={reward.type} size={11} /> {typeSingular(reward.type)}</> : reward.typeLabel}
          {reward.hero ? ` · ${heroLabel(reward.hero)}` : ''}
        </span>
        <RarityTag rarity={reward.rarity} />
        {past && reward.notInUnvault && <span className="cx-reward__left-out">Not sold with the past pass</span>}
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

interface TierGroup {
  label: string;
  /** Tiers in order, each with its own key. */
  tiers: { key: string; tier: number }[];
}

/** The main run of tiers splits into tens. A track or the prestige tiers are shown whole. */
function tierGroups(pass: BattlePass) {
  const groups: TierGroup[] = [];
  const parts = [...new Set(pass.rewards.map((reward) => reward.part))];
  for (const part of parts) {
    const rewards = pass.rewards.filter((reward) => reward.part === part);
    const seen = new Map(rewards.map((reward) => [rewardTierKey(reward), reward.tier]));
    const tiers = [...seen].map(([key, tier]) => ({ key, tier })).sort((a, b) => a.tier - b.tier);
    if (part) {
      groups.push({ label: part, tiers });
      continue;
    }
    const highest = tiers[tiers.length - 1]?.tier ?? 0;
    for (let from = 1; from <= highest; from += TIERS_PER_RANGE) {
      const to = Math.min(from + TIERS_PER_RANGE - 1, highest);
      const inRange = tiers.filter((tier) => tier.tier >= from && tier.tier <= to);
      if (inRange.length > 0) groups.push({ label: `${from}–${to}`, tiers: inRange });
    }
  }
  return groups;
}

function TierBrowser({ pass, past }: { pass: BattlePass; past: boolean }) {
  const entries = useCollection();
  const groups = useMemo(() => tierGroups(pass), [pass]);
  const [groupIndex, setGroupIndex] = useState(0);
  const group = groups[Math.min(groupIndex, groups.length - 1)];
  if (!group) return null;
  const inGroup = group.tiers.map((tier) => tierId(pass.id, tier.key));
  const doneInGroup = inGroup.filter((id) => isSet(entries, 'tier', id)).length;

  return (
    <section className="cx-tiers">
      <div className="cx-chips" role="group" aria-label="Tiers to show">
        {groups.map((option, index) => (
          <button key={option.label} type="button" className={cn('cx-filter-chip', index === groupIndex && 'is-active')} aria-pressed={index === groupIndex} onClick={() => setGroupIndex(index)}>{option.label}</button>
        ))}
      </div>
      <div className="cx-tracker__actions">
        <button type="button" className="cx-tool" disabled={doneInGroup === inGroup.length} onClick={() => setMarks('tier', inGroup, true)}><CheckCheck size={14} aria-hidden="true" /> Mark {group.label} done</button>
        <button type="button" className="cx-tool" disabled={doneInGroup === 0} onClick={() => setMarks('tier', inGroup, false)}><Undo2 size={14} aria-hidden="true" /> Clear these</button>
      </div>
      <ol className="cx-tier-list">
        {group.tiers.map(({ key, tier }) => {
          const done = isSet(entries, 'tier', tierId(pass.id, key));
          return (
            <li key={key} className={cn('cx-tier', done && 'is-done')}>
              <button type="button" className="cx-tier__head" aria-pressed={done} aria-label={`Tier ${tier}, mark as completed`} onClick={() => toggleMark('tier', tierId(pass.id, key))}>
                <span className="cx-tier__number">{tier}</span>
                <span className="cx-tier__check">{done && <Check size={14} aria-hidden="true" />}</span>
              </button>
              <ul className="cx-tier__rewards">
                {pass.rewards.filter((reward) => rewardTierKey(reward) === key).map((reward, index) => <RewardCard key={`${reward.track}-${index}`} reward={reward} past={past} />)}
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
  const rules = useAsync(loadPassRules, 'pass rules');
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
  const premium = detail.rewards.filter((reward) => reward.track === 'premium').length;
  const both = detail.rewards.length - free - premium;
  const past = Boolean(detail.end && detail.end <= today());

  return (
    <div className="page cx-page">
      <BackLink href="#/hub/battle-passes">All Battle Passes</BackLink>
      <PageHeader eyebrow="Battle Pass" title={detail.label} intro={detail.title ?? undefined} />
      <dl className="cx-facts cx-facts--inline">
        {detail.start && <div className="cx-fact"><dt>Started</dt><dd>{dayText(detail.start)}</dd></div>}
        {detail.end && <div className="cx-fact"><dt>{past ? 'Ended' : 'Ends'}</dt><dd>{dayText(detail.end)}</dd></div>}
        {detail.tiers !== null && <div className="cx-fact"><dt>Tiers</dt><dd>{formatInt(detail.tiers)}</dd></div>}
        <div className="cx-fact"><dt>Rewards listed</dt><dd>{formatInt(detail.rewards.length)}{detail.rewards.length > 0 ? ` (${formatInt(free)} free, ${formatInt(premium)} premium${both > 0 ? `, ${formatInt(both)} on both` : ''})` : ''}</dd></div>
      </dl>
      {detail.note && <Note>{detail.note}</Note>}
      {past && rules.data && <UnvaultNote rules={rules.data} />}
      {detail.rewards.length > 0 ? (
        <>
          <div className="cx-tracker cx-tracker--wide">
            <p className="cx-tracker__label"><strong>Your progress: {progress.tiers.percent}%</strong> of tiers marked done ({progress.tiers.done} / {progress.tiers.total})</p>
            <div className="cx-meter" role="progressbar" aria-label="Tiers marked as completed" aria-valuemin={0} aria-valuemax={progress.tiers.total} aria-valuenow={progress.tiers.done}><span style={{ width: `${progress.tiers.percent}%` }} /></div>
            <p className="cx-muted cx-muted--small">{formatInt(progress.cosmetics.done)} of {formatInt(progress.cosmetics.total)} cosmetics marked as owned, {formatInt(progress.remaining)} remaining. You set these yourself. This site can't see your in-game progress.</p>
          </div>
          <TierBrowser key={detail.id} pass={detail} past={past} />
        </>
      ) : (
        <StateBlock icon={<Ticket size={24} />} title="Rewards not listed">No source lists this pass's tier-by-tier rewards, so nothing is shown rather than guessed.</StateBlock>
      )}
      <SourceList sources={detail.sources} />
      <CatalogueCredits />
    </div>
  );
}
