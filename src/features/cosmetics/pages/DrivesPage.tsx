import { useMemo } from 'react';
import { BadgeCheck, CalendarDays, ExternalLink, Gauge, Gift, Sparkles } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { useAsync } from '../../patches/data';
import { DataState, GridSkeleton, PageHeader, usePageTitle } from '../components/bits';
import { Thumb } from '../components/media';
import { gameEventTiming, type GameEvent } from '../core/events';
import { loadGameEvents, useClock } from '../data';
import { dayText } from '../labels';

const DRIVEN_TO_VICTORY = { title: 'Driven To Victory! – Introducing Competitive Drives', url: 'https://overwatch.blizzard.com/en-us/news/24146089/driven-to-victory-introducing-competitive-drives/' };
const S5_MIDCYCLE = { title: 'Reign of Talon – S5 Midcycle Sets Up the Showdown', url: 'https://overwatch.blizzard.com/en-us/news/24303010/reign-of-talon-s5-midcycle-sets-up-the-showdown/' };

/** Blizzard's own pictures of Signatures, with "BATTLETAG" standing in for a player's name. */
const LOOKS = [
  {
    id: 'december-2026',
    title: 'The December 2026 Signature',
    caption: "Blizzard's preview of the Signature for the Drive that starts December 3. The number on the left counts the Drives you've finished.",
    image: 'https://bnetcmsus-a.akamaihd.net/cms/gallery/G5PDYK05X94G1793122078826.png',
    ratio: '540 / 144',
    source: S5_MIDCYCLE,
  },
  {
    id: 'first-2024',
    title: 'The first Signatures, from 2024',
    caption: 'Top to bottom: the Signature, then the Advanced and Elite versions from later checkpoints. Left to right: the number each finished Drive adds.',
    image: 'https://bnetcmsus-a.akamaihd.net/cms/page_media/2c/2C345WERYQ8L1727908304719.png',
    ratio: '1920 / 1080',
    source: DRIVEN_TO_VICTORY,
  },
];

const FACTS = [
  { text: 'A Signature is a backing for your BattleTag that shows on your Name Card, your hero portrait and Play of the Game intros.', source: DRIVEN_TO_VICTORY },
  { text: 'In the format Blizzard introduced in 2024, wins add Drive Score and losses take a little away. Passing a checkpoint locks in your progress and its reward: Competitive Points or a better Signature.', source: DRIVEN_TO_VICTORY },
  { text: 'A Roman numeral on the Signature counts the Drives you finished. A new Drives period resets it and brings a new Signature.', source: DRIVEN_TO_VICTORY },
  { text: 'Reach the fourth checkpoint of the latest Drive to equip eligible Signatures from earlier seasons. The fourth checkpoint of the latest Team Drive does the same for Player Card Frames.', source: S5_MIDCYCLE },
  { text: 'From December 3 to 7, Drives have two tracks you can play at once: Competitive, for up to 3,000 Competitive Points and a Signature, and Quick Play, for up to 3,000 Legacy Weapon Points.', source: S5_MIDCYCLE },
];

function DriveCard({ event, now }: { event: GameEvent; now: number }) {
  const timing = gameEventTiming(event, now);
  return (
    <article className="dv-card" data-state={timing.state}>
      <header className="dv-card__head">
        <h3 className="dv-card__name">{event.name}</h3>
        <p className="dv-card__dates"><CalendarDays size={14} aria-hidden="true" /> {dayText(event.start)}{event.end ? ` to ${dayText(event.end)}` : ''}</p>
        <span className="dv-card__state" data-state={timing.state}>{timing.state === 'live' ? 'Live now' : timing.state === 'upcoming' ? 'Coming up' : 'Ended'}</span>
        {timing.text && <span className="dv-card__countdown">{timing.text}</span>}
      </header>
      {event.summary && <p className="dv-card__summary">{event.summary}</p>}
      {event.rewards.length > 0 && (
        <ul className="dv-card__rewards">
          {event.rewards.map((reward) => (
            <li key={reward.name}><Gift size={14} aria-hidden="true" /><span><strong>{reward.name}</strong>{reward.note ? <span className="dv-card__note"> · {reward.note}</span> : null}</span></li>
          ))}
        </ul>
      )}
      {event.notes.map((note) => <p key={note} className="dv-card__summary dv-card__summary--quiet">{note}</p>)}
      {event.sources[0]?.url && (
        <p className="dv-source"><BadgeCheck size={13} aria-hidden="true" /> <a href={event.sources[0].url} target="_blank" rel="noreferrer">{event.sources[0].title}</a></p>
      )}
    </article>
  );
}

export function DrivesPage() {
  usePageTitle('Drives');
  const events = useAsync(loadGameEvents, 'game-events');
  const now = useClock(60000);
  const drives = useMemo(() => (events.data?.events ?? []).filter((event) => /\bdrives?\b/i.test(event.name)).sort((a, b) => b.start.localeCompare(a.start)), [events.data]);
  const current = drives.filter((event) => gameEventTiming(event, now).state !== 'ended').reverse();
  const past = drives.filter((event) => gameEventTiming(event, now).state === 'ended');

  return (
    <div className="page cx-page dv-page">
      <PageHeader
        eyebrow="Hub"
        title="Drives"
        intro="Short events in Competitive, and now Quick Play, where wins push you through checkpoints. Competitive Drives give Competitive Points and a Signature for your BattleTag; Team Drives give Player Card Frames."
        actions={<a className="cx-tool" href="#/events">All in-game events</a>}
      />

      <section className="cx-related">
        <header className="cx-related__head"><h2 className="cx-section-title"><Gauge size={16} aria-hidden="true" /> Next Drive</h2></header>
        {events.data ? (
          current.length > 0 ? <div className="dv-cards">{current.map((event) => <DriveCard key={event.id} event={event} now={now} />)}</div> : <p className="cx-muted">No Drive announced yet. Blizzard usually announces the next one in its season and midcycle articles.</p>
        ) : (
          <DataState status={events.status} error={events.error} retry={events.retry} what="Drives" skeleton={<GridSkeleton count={2} tall />} />
        )}
      </section>

      <section className="cx-related">
        <header className="cx-related__head"><h2 className="cx-section-title"><Sparkles size={16} aria-hidden="true" /> Signature looks</h2></header>
        <ul className="dv-looks">
          {LOOKS.map((look) => (
            <li key={look.id} className="dv-look">
              <span className="dv-look__art" style={{ aspectRatio: look.ratio }}><Thumb src={look.image} width={900} alt={`${look.title}, as Blizzard showed it`} /></span>
              <span className="dv-look__title">{look.title}</span>
              <span className="dv-look__caption">{look.caption}</span>
              <span className="dv-source"><BadgeCheck size={13} aria-hidden="true" /> <a href={look.source.url} target="_blank" rel="noreferrer">{look.source.title}</a></span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cx-related">
        <header className="cx-related__head"><h2 className="cx-section-title">How Drives work</h2></header>
        <ul className="dv-facts">
          {FACTS.map((fact) => (
            <li key={fact.text}>
              <span>{fact.text}</span>
              <a className="dv-facts__source" href={fact.source.url} target="_blank" rel="noreferrer">Blizzard <ExternalLink size={11} aria-hidden="true" /></a>
            </li>
          ))}
        </ul>
      </section>

      {past.length > 0 && (
        <section className="cx-related">
          <header className="cx-related__head"><h2 className="cx-section-title">Recent Drives</h2><span className="cx-filter-chip__count">{past.length}</span></header>
          <div className="dv-cards">{past.map((event) => <DriveCard key={event.id} event={event} now={now} />)}</div>
        </section>
      )}
      {events.data && drives.length === 0 && <StateBlock icon={<Gauge size={24} />} title="No Drives recorded yet">Drives appear here once Blizzard announces them.</StateBlock>}
      <p className="cx-credit">Pictures, dates and rewards are Blizzard's, from the articles linked with each. Earlier seasons' Signatures aren't shown yet, since Blizzard hasn't published pictures of them.</p>
    </div>
  );
}
