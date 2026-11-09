import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Gamepad2,
  Ghost,
  Gift,
  Handshake,
  History,
  Hourglass,
  ListChecks,
  Newspaper,
  Radio,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  Swords,
  Target,
  Ticket,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { formatDateTime } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { GAME_EVENT_KINDS, gameEventSpan, gameEventTiming, groupGameEvents, isDateOnly, type GameEvent, type GameEventKind, type GameEventTiming } from '../core';
import { loadGameEvents, useClock } from '../data';
import { Collapsible, DataState, Note, PageHeader, SourceList, usePageTitle } from '../components/bits';
import { Thumb } from '../components/media';
import { dayText, priceText, rarityLabel } from '../labels';

const KIND_ICON: Record<GameEventKind, LucideIcon> = {
  seasonal: Ghost,
  event: Sparkles,
  mode: Gamepad2,
  challenge: Target,
  collab: Handshake,
  collection: Shirt,
  shop: ShoppingBag,
  competitive: Swords,
  esports: Trophy,
};

const BLIZZARD_NEWS = 'https://overwatch.blizzard.com/en-us/news/';

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "Nov 3 – Dec 7, 2026". Dates are Blizzard's, so they're shown as written rather than moved into the visitor's time zone. */
function dateRange(event: GameEvent) {
  if (!isDateOnly(event.start) || (event.end !== null && !isDateOnly(event.end))) {
    const span = gameEventSpan(event);
    return span.end === null ? `From ${formatDateTime(span.start)}` : `${formatDateTime(span.start)} – ${formatDateTime(span.end)}`;
  }
  const start = Date.parse(`${event.start}T12:00:00Z`);
  if (event.end === null) return `From ${fullDate.format(start)}`;
  const end = Date.parse(`${event.end}T12:00:00Z`);
  const sameYear = event.start.slice(0, 4) === event.end.slice(0, 4);
  return `${(sameYear ? shortDate : fullDate).format(start)} – ${fullDate.format(end)}`;
}

const DAY_NOTE = "Blizzard gives the days, not the times, so this counts whole days in US Pacific time.";

function Status({ event, timing }: { event: GameEvent; timing: GameEventTiming }) {
  const dayOnly = isDateOnly(timing.state === 'upcoming' ? event.start : event.end);
  if (timing.state === 'ended') return <span className="cx-pill ev-status" data-state="ended">Ended</span>;
  const label = timing.state === 'live' ? (timing.soon ? 'Ending soon' : 'Live now') : timing.soon ? 'Starting soon' : 'Coming up';
  const tone = timing.state === 'live' ? (timing.soon ? 'warn' : 'good') : 'info';
  return (
    <span className="ev-status-line">
      <span className="cx-pill ev-status" data-tone={tone} data-state={timing.state}>
        {timing.state === 'live' ? <Radio size={12} aria-hidden="true" /> : <Hourglass size={12} aria-hidden="true" />}
        {label}
      </span>
      {timing.text && <span className="ev-countdown" title={dayOnly ? DAY_NOTE : undefined}>{timing.text}</span>}
    </span>
  );
}

function Block({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="ev-block">
      <h4 className="ev-block__title"><Icon size={13} aria-hidden="true" /> {title}</h4>
      {children}
    </section>
  );
}

/** The modes, challenges, rewards and notes Blizzard announced, in this project's own words. */
function EventDetails({ event }: { event: GameEvent }) {
  return (
    <>
      {event.modes.length > 0 && (
        <Block icon={Gamepad2} title={event.modes.length === 1 ? 'Limited-time mode' : 'Limited-time modes'}>
          <ul className="ev-list">
            {event.modes.map((mode) => (
              <li key={mode.name}><strong>{mode.name}.</strong> {mode.about}</li>
            ))}
          </ul>
        </Block>
      )}
      {event.challenges.length > 0 && (
        <Block icon={ListChecks} title="Challenges">
          <ul className="ev-list">
            {event.challenges.map((challenge) => (
              <li key={challenge.task} className="ev-challenge">
                <span>{challenge.task}</span>
                <ArrowRight size={13} aria-hidden="true" className="ev-challenge__arrow" />
                <span className="sr-only">earns</span>
                <strong className="ev-challenge__reward">{challenge.reward}</strong>
              </li>
            ))}
          </ul>
        </Block>
      )}
      {event.pass && (
        <Block icon={Ticket} title="Event Pass">
          <p className="ev-text">
            {[event.pass.tiers ? `${event.pass.tiers} tiers` : null, event.pass.price ? `premium track ${priceText(event.pass.price)}` : null].filter(Boolean).join(', ')}
            {event.pass.tiers || event.pass.price ? '. ' : ''}
            {event.pass.note}
          </p>
        </Block>
      )}
      {event.rewards.length > 0 && (
        <Block icon={Gift} title="Rewards">
          <ul className="ev-rewards">
            {event.rewards.map((reward) => {
              const meta = [reward.rarity ? rarityLabel(reward.rarity) : null, reward.track ? `${reward.track === 'free' ? 'Free' : 'Premium'} track` : null, reward.note].filter(Boolean).join(' · ');
              const inside = (
                <>
                  <span className="ev-reward__name">{reward.name}</span>
                  {meta && <span className="ev-reward__meta">{meta}</span>}
                </>
              );
              // A reward the catalogue knows links to its page, and the whole chip is the link so it's easy to tap.
              return (
                <li key={reward.name} className="ev-rewards__item">
                  {reward.cosmeticId ? (
                    <a className="ev-reward ev-reward--link" href={`#/cosmetics/${reward.cosmeticId}`} data-rarity={reward.rarity ?? undefined}>{inside}</a>
                  ) : (
                    <span className="ev-reward" data-rarity={reward.rarity ?? undefined}>{inside}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {event.rewardsNote && <p className="cx-muted cx-muted--small">{event.rewardsNote}</p>}
        </Block>
      )}
      {event.notes.length > 0 && (
        <ul className="ev-list ev-list--notes">
          {event.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
    </>
  );
}

/** The cosmetics an event is about, from the catalogue, with what the recorded shop says about them. */
function EventCosmetics({ event, ended }: { event: GameEvent; ended: boolean }) {
  const active = event.bundles.filter((bundle) => bundle.status === 'active');
  const shownBundles = (active.length > 0 ? active : event.bundles).slice(0, 3);
  const moreBundles = (active.length > 0 ? active : event.bundles).length - shownBundles.length;
  if (event.featured.length === 0 && event.bundles.length === 0 && !event.catalogue && event.links.length === 0) return null;
  return (
    <div className="ev-related">
      {event.featured.length > 0 && (
        <ul className="ev-cosmetics" aria-label={`Cosmetics from ${event.name}`}>
          {event.featured.map((cosmetic) => (
            <li key={cosmetic.id}>
              <a className="ev-cosmetic" href={`#/cosmetics/${cosmetic.id}`} data-rarity={cosmetic.rarity ?? undefined} title={cosmetic.name}>
                <span className="ev-cosmetic__thumb">
                  <Thumb src={cosmetic.image} width={160} type={cosmetic.type} alt="" />
                  {!ended && cosmetic.availability === 'in-shop' && <span className="ev-cosmetic__shop"><Store size={10} aria-hidden="true" /> In shop</span>}
                </span>
                <span className="ev-cosmetic__name">{cosmetic.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="ev-links">
        {shownBundles.length > 0 && (
          <span>
            {active.length > 0 ? 'In the shop now: ' : 'Its bundles: '}
            {shownBundles.map((bundle, index) => (
              <span key={bundle.id}>
                {index > 0 ? ', ' : ''}
                <a href={`#/bundles/${bundle.id}`}>{bundle.name}</a>
              </span>
            ))}
            {moreBundles > 0 ? ` and ${moreBundles} more` : ''}
          </span>
        )}
        {event.catalogue && (
          <a className="ev-links__more" href={`#/cosmetics?event=${encodeURIComponent(event.catalogue.event)}`}>
            {event.catalogue.count === 1 ? '1 cosmetic' : `All ${event.catalogue.count} cosmetics`} from {event.catalogue.label} <ArrowRight size={13} aria-hidden="true" />
          </a>
        )}
        {event.links.map((link) => (
          <a key={link.href} className="ev-links__more" href={link.href} {...(link.href.startsWith('https://') ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {link.label} {link.href.startsWith('https://') ? <ExternalLink size={12} aria-hidden="true" /> : <ArrowRight size={13} aria-hidden="true" />}
          </a>
        ))}
      </p>
    </div>
  );
}

function EventCard({ event, now }: { event: GameEvent; now: number }) {
  const timing = gameEventTiming(event, now);
  const ended = timing.state === 'ended';
  // An event that's over keeps its details a click away, so what's on now stays easy to scan.
  const [open, setOpen] = useState(!ended);
  const detailsId = useId();
  const Icon = KIND_ICON[event.kind] ?? Sparkles;
  const hasDetails = event.modes.length + event.challenges.length + event.rewards.length + event.notes.length > 0 || Boolean(event.pass);
  const credit = event.image && event.image.credit !== 'Blizzard Entertainment' ? event.image.credit.replace(/^Blizzard Entertainment\.\s*/, '') : null;

  return (
    <article className="ev-card" data-state={timing.state} data-kind={event.kind} aria-labelledby={`${detailsId}-name`}>
      <div className={event.image ? 'ev-card__art' : 'ev-card__art ev-card__art--plain'}>
        {event.image ? (
          <Thumb src={event.image.url} width={640} fit="cover" alt="" />
        ) : (
          <span className="ev-card__placeholder" aria-hidden="true"><Icon size={40} strokeWidth={1.6} /></span>
        )}
        <span className="ev-card__kind"><Icon size={13} aria-hidden="true" /> {GAME_EVENT_KINDS[event.kind]}</span>
        {credit && <span className="ev-card__credit">{credit}</span>}
      </div>
      <div className="ev-card__body">
        <header className="ev-card__head">
          <h3 className="ev-card__name" id={`${detailsId}-name`}>{event.name}</h3>
          <p className="ev-card__when">
            <span className="ev-card__dates"><CalendarDays size={14} aria-hidden="true" /> {dateRange(event)}</span>
            <Status event={event} timing={timing} />
          </p>
        </header>
        <p className="ev-card__summary">{event.summary}</p>
        {hasDetails && (
          <>
            {ended && (
              <button type="button" className="ev-card__toggle" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((value) => !value)}>
                {open ? 'Hide details' : 'Modes, challenges and rewards'} <ChevronDown size={14} aria-hidden="true" />
              </button>
            )}
            <div id={detailsId} className="ev-card__details" hidden={!open}>
              {open && <EventDetails event={event} />}
            </div>
          </>
        )}
        <EventCosmetics event={event} ended={ended} />
        <footer className="ev-card__foot">
          <SourceList sources={event.sources} />
        </footer>
      </div>
    </article>
  );
}

function EventSection({ id, icon, title, events, now, children }: { id: string; icon: ReactNode; title: string; events: GameEvent[]; now: number; children?: ReactNode }) {
  return (
    <section className="cx-related ev-section" aria-labelledby={`ev-${id}`}>
      <header className="cx-related__head">
        <h2 className="cx-section-title" id={`ev-${id}`}>{icon} {title}</h2>
        <span className="cx-filter-chip__count">{events.length}</span>
      </header>
      {children}
      {events.length > 0 && <div className="ev-grid">{events.map((event) => <EventCard key={event.id} event={event} now={now} />)}</div>}
    </section>
  );
}

function EventsSkeleton() {
  return (
    <div className="ev-grid" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="cx-skeleton-card ev-skeleton" />)}
    </div>
  );
}

export function EventsPage() {
  usePageTitle('In-Game Events');
  const events = useAsync(loadGameEvents, 'game-events');
  const now = useClock(60000);
  const file = events.data;
  const groups = useMemo(() => groupGameEvents(file?.events ?? [], now), [file, now]);

  return (
    <div className="page cx-page ev-page">
      <PageHeader
        eyebrow="Overwatch"
        title="In-Game Events"
        intro="What's on in Overwatch now, what's coming up and what just ended. Dates, modes and rewards come from Blizzard's own announcements."
        actions={<a className="cx-tool" href={BLIZZARD_NEWS} target="_blank" rel="noreferrer"><Newspaper size={14} aria-hidden="true" /> Blizzard news <ExternalLink size={13} aria-hidden="true" /></a>}
      />
      {file ? (
        file.events.length === 0 ? (
          <StateBlock icon={<CalendarDays size={24} />} title="No events recorded yet">Events are added from Blizzard's announcements.</StateBlock>
        ) : (
          <>
            {groups.live.length > 0 && <EventSection id="live" icon={<Radio size={16} aria-hidden="true" />} title="Happening now" events={groups.live} now={now} />}
            <EventSection id="upcoming" icon={<Hourglass size={16} aria-hidden="true" />} title="Coming up" events={groups.upcoming} now={now}>
              {groups.live.length === 0 && groups.upcoming.length > 0 && <Note>Nothing is running right now, so here's what's next.</Note>}
              {groups.upcoming.length === 0 && (
                <p className="cx-muted">
                  {groups.live.length === 0 ? 'Nothing is running or announced right now. ' : ''}New events show here once Blizzard announces them.
                </p>
              )}
            </EventSection>
            {groups.recent.length > 0 && <EventSection id="recent" icon={<History size={16} aria-hidden="true" />} title="Recently ended" events={groups.recent} now={now} />}
            {groups.earlier.length > 0 && (
              <Collapsible title="Earlier events" icon={<History size={16} aria-hidden="true" />} count={groups.earlier.length}>
                <ul className="ev-earlier">
                  {groups.earlier.map((event) => (
                    <li key={event.id}>
                      <span className="ev-earlier__name">{event.name}</span>
                      <span className="ev-earlier__meta">{GAME_EVENT_KINDS[event.kind]} · {dateRange(event)}</span>
                      {event.sources[0]?.url && <a href={event.sources[0].url} target="_blank" rel="noreferrer">Announcement <ExternalLink size={11} aria-hidden="true" /></a>}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
            <Note>
              Dates are as Blizzard gives them, in US Pacific time. Blizzard rarely gives times, so countdowns count whole days.
              {file.recordedFrom ? ` Events are recorded from ${dayText(file.recordedFrom)} on.` : ''}
            </Note>
          </>
        )
      ) : (
        <DataState status={events.status} error={events.error} retry={events.retry} what="in-game events" skeleton={<EventsSkeleton />} />
      )}
      <p className="cx-credit ev-credit">
        <Newspaper size={13} aria-hidden="true" />
        <span>
          Event details and pictures from <a href={BLIZZARD_NEWS} target="_blank" rel="noreferrer">Blizzard's news</a>, © Blizzard Entertainment and the partners named on each picture.
          {file?.checkedAt ? ` List last checked ${dayText(file.checkedAt)}.` : ''}
        </span>
      </p>
    </div>
  );
}
