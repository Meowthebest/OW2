import { useMemo } from 'react';
import { Bell, BellOff, Box, Check, Clock, ExternalLink, Gift, Radio, Tv } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { cn, formatDateTime } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { dropProgress, dropRewardId, isSet } from '../core/collection';
import type { DropCampaign, DropReward } from '../core/types';
import { loadDrops, useClock } from '../data';
import { Collapsible, Countdown, DataState, GridSkeleton, Note, PageHeader, SourceList, usePageTitle } from '../components/bits';
import { Thumb, TypeIcon } from '../components/media';
import { dayText, typeSingular } from '../labels';
import { toggleMark, useCollection } from '../useCollection';
import { CatalogueCredits } from './CosmeticsPage';

export const dropNotifyId = (campaignId: string) => `drop-${campaignId}`;

function watchTime(minutes: number | null) {
  if (minutes === null) return 'Time not stated';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** A loot box has no catalog entry, so without a picture it gets a box rather than a blank. */
const isLootBox = (reward: DropReward) => reward.type === null && /loot ?box/i.test(reward.name);

/** Rewards as cards in watch-time order. The marks are claims the viewer makes, not watch progress from Twitch. */
function RewardTimeline({ campaign }: { campaign: DropCampaign }) {
  const entries = useCollection();
  const rewards = useMemo(() => [...campaign.rewards].sort((a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9)), [campaign.rewards]);
  return (
    <ol className="cx-drop-line">
      {rewards.map((reward: DropReward) => {
        const id = dropRewardId(campaign.id, reward.id);
        const claimed = isSet(entries, 'drop', id);
        const name = reward.cosmeticId ? <a href={`#/cosmetics/${reward.cosmeticId}`}>{reward.name}</a> : reward.name;
        return (
          <li key={reward.id} className={cn('cx-drop-reward', claimed && 'is-claimed')}>
            <span className="cx-drop-reward__media">
              {!reward.image && isLootBox(reward) ? <span className="cx-thumb cx-thumb--empty"><Box size={34} aria-hidden="true" /></span> : <Thumb src={reward.image} width={240} type={reward.type} />}
              {claimed && <span className="cx-drop-reward__check" aria-hidden="true"><Check size={13} /></span>}
            </span>
            <span className="cx-drop-reward__text">
              <span className="cx-drop-reward__name">{name}</span>
              {reward.type && <span className="cx-drop-reward__type"><TypeIcon type={reward.type} size={11} /> {typeSingular(reward.type)}</span>}
              {reward.note && <span className="cx-drop-reward__type">{reward.note}</span>}
            </span>
            <span className="cx-drop-reward__when"><Clock size={12} aria-hidden="true" /><span className="cx-drop-reward__time">{watchTime(reward.minutes)}</span></span>
            <button type="button" className={cn('cx-tool', claimed && 'is-on')} aria-pressed={claimed} aria-label={`Mark ${reward.name} as claimed`} onClick={() => toggleMark('drop', id)}>
              <Check size={13} aria-hidden="true" /> {claimed ? 'Claimed' : 'Mark claimed'}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CampaignCard({ campaign, state }: { campaign: DropCampaign; state: 'active' | 'upcoming' | 'expired' }) {
  const entries = useCollection();
  const tracked = dropProgress(campaign, entries);
  const watching = isSet(entries, 'notify', dropNotifyId(campaign.id));
  return (
    <article className="cx-drop" id={`campaign-${campaign.id}`} data-state={state}>
      <header className="cx-drop__head">
        {campaign.image && <div className="cx-drop__art"><Thumb src={campaign.image} width={520} fit="cover" /></div>}
        <div className="cx-drop__titles">
          <h3 className="cx-drop__name">{campaign.name}</h3>
          <p className="cx-drop__dates" title={`${formatDateTime(Date.parse(campaign.start))} to ${formatDateTime(Date.parse(campaign.end))}`}>{dayText(campaign.start)} to {dayText(campaign.end)}</p>
          {state === 'active' && <Countdown until={campaign.end} />}
          {state === 'upcoming' && <Countdown until={campaign.start} prefix="Starts in" />}
          {tracked.done > 0 && <p className="cx-bundle__owned">{tracked.done} / {tracked.total} marked claimed</p>}
        </div>
        <div className="cx-drop__actions">
          {state !== 'expired' && (
            <button type="button" className="cx-tool" aria-pressed={watching} onClick={() => toggleMark('notify', dropNotifyId(campaign.id))}>
              {watching ? <BellOff size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />} {watching ? 'Stop reminder' : 'Remind me near the end'}
            </button>
          )}
          {campaign.url && <a className="cx-tool" href={campaign.url} target="_blank" rel="noreferrer">Announcement <ExternalLink size={13} aria-hidden="true" /></a>}
        </div>
      </header>
      {campaign.channels.length > 0 && (
        <div className="cx-drop__watch">
          <span className="cx-drop__watch-label">Watch on</span>
          {campaign.channels.map((channel) =>
            channel.url ? (
              <a key={channel.label} className="cx-drop__channel" href={channel.url} target="_blank" rel="noreferrer">
                <Tv size={13} aria-hidden="true" /> {channel.label} <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : (
              <span key={channel.label} className="cx-drop__channel"><Tv size={13} aria-hidden="true" /> {channel.label}</span>
            ),
          )}
        </div>
      )}
      {campaign.channelNote && (
        <p className="cx-drop__where">
          <Tv size={14} aria-hidden="true" />
          <span>{campaign.channelNote}</span>
        </p>
      )}
      {campaign.claimUntil && <p className="cx-muted cx-muted--small">Claim by {formatDateTime(Date.parse(campaign.claimUntil))}.</p>}
      {campaign.note && <Note>{campaign.note}</Note>}
      <RewardTimeline campaign={campaign} />
      <SourceList sources={campaign.sources} />
    </article>
  );
}

export function DropsPage() {
  usePageTitle('Twitch Drops');
  const drops = useAsync(loadDrops, 'drops');
  const now = useClock(60000);
  const groups = useMemo(() => {
    const list = drops.data ?? [];
    const active = list.filter((campaign) => Date.parse(campaign.start) <= now && Date.parse(campaign.end) > now).sort((a, b) => a.end.localeCompare(b.end));
    const upcoming = list.filter((campaign) => Date.parse(campaign.start) > now).sort((a, b) => a.start.localeCompare(b.start));
    const expired = list.filter((campaign) => Date.parse(campaign.end) <= now).sort((a, b) => b.end.localeCompare(a.end));
    return { active, upcoming, expired };
  }, [drops.data, now]);

  return (
    <div className="page cx-page">
      <PageHeader
        eyebrow="Hub"
        title="Twitch Drops"
        intro="Watch Overwatch on Twitch to earn in-game rewards. Campaign details come from Blizzard's own announcements."
        actions={<a className="cx-tool" href="https://account.battle.net/connections" target="_blank" rel="noreferrer">Link Battle.net to Twitch <ExternalLink size={13} aria-hidden="true" /></a>}
      />
      <Note>"Claimed" marks are yours to set, as a reminder. This site doesn't see your Twitch account or watch time, so check your progress on Twitch.</Note>
      {drops.data ? (
        drops.data.length === 0 ? (
          <StateBlock icon={<Gift size={24} />} title="No campaigns recorded yet">Campaigns are added from Blizzard's announcements.</StateBlock>
        ) : (
          <>
            <section className="cx-related">
              <header className="cx-related__head"><h2 className="cx-section-title"><Radio size={16} aria-hidden="true" /> Active now</h2><span className="cx-filter-chip__count">{groups.active.length}</span></header>
              {groups.active.length > 0 ? <div className="cx-drops">{groups.active.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} state="active" />)}</div> : <p className="cx-muted">No campaign recorded as running right now. A new one may have started since this list was last updated, so check Blizzard's announcements too.</p>}
            </section>
            {groups.upcoming.length > 0 && (
              <section className="cx-related">
                <header className="cx-related__head"><h2 className="cx-section-title">Upcoming</h2><span className="cx-filter-chip__count">{groups.upcoming.length}</span></header>
                <div className="cx-drops">{groups.upcoming.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} state="upcoming" />)}</div>
              </section>
            )}
            {groups.expired.length > 0 && (
              <section className="cx-related">
                <header className="cx-related__head"><h2 className="cx-section-title">Campaign history</h2><span className="cx-filter-chip__count">{groups.expired.length}</span></header>
                <div className="cx-drops">
                  {groups.expired.map((campaign) => (
                    <Collapsible key={campaign.id} title={`${campaign.name}, ${dayText(campaign.start)} to ${dayText(campaign.end)}`} count={campaign.rewards.length}>
                      <CampaignCard campaign={campaign} state="expired" />
                    </Collapsible>
                  ))}
                </div>
              </section>
            )}
          </>
        )
      ) : (
        <DataState status={drops.status} error={drops.error} retry={drops.retry} what="Twitch campaigns" skeleton={<GridSkeleton count={3} tall />} />
      )}
      <CatalogueCredits />
    </div>
  );
}
