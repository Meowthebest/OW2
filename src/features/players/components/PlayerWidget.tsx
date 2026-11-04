import { Activity, ChevronRight, TriangleAlert } from 'lucide-react';
import { formatRelative } from '../../../lib/format';
import { freshness } from '../core';
import { useNow, usePlayerData } from '../data';
import { AnimatedNumber, ChangeValue, Sparkline } from './parts';

/** The homepage's compact Steam player panel. Every value is recorded data, with a plain note where none exists yet. */
export function PlayerWidget() {
  const { status, latest, checkFailed } = usePlayerData();
  const now = useNow();

  if (status === 'loading' && !latest) {
    return <div className="live-strip live-strip--loading" aria-hidden="true"><span className="live-strip__bar" /></div>;
  }

  if (!latest) {
    return (
      <a className="live-strip live-strip--quiet" href="#/players">
        <span className="live-strip__heading"><Activity size={15} aria-hidden="true" /> Overwatch: Steam player activity</span>
        <span className="live-strip__message">{status === 'empty' ? 'Recording has not started yet.' : 'Player data is unavailable right now.'}</span>
        <ChevronRight size={16} aria-hidden="true" className="live-strip__chevron" />
      </a>
    );
  }

  const fresh = freshness(latest, now);
  const stale = fresh.stale || checkFailed;
  const { peak24h, change24h } = latest.stats;

  return (
    <a className="live-strip" href="#/players" data-stale={stale ? 'true' : undefined}>
      <span className="live-strip__heading">
        <Activity size={15} aria-hidden="true" />
        <span>Overwatch: Steam player activity</span>
        <span className="live-strip__tag">Steam only</span>
      </span>
      <span className="live-strip__now">
        <span className="live-strip__dot" aria-hidden="true" />
        <strong><AnimatedNumber value={latest.current.players} /></strong>
        <span className="live-strip__label">Playing now</span>
      </span>
      <span className="live-strip__stat">
        {change24h ? (
          <>
            <ChangeValue percent={change24h.percent} />
            <span className="live-strip__label">vs 24 hours ago</span>
          </>
        ) : (
          <span className="live-strip__label">24h change: collecting</span>
        )}
      </span>
      <span className="live-strip__stat">
        <span className="live-strip__label">24h peak:</span>
        <b>{peak24h ? peak24h.players.toLocaleString('en-US') : 'collecting'}</b>
      </span>
      <Sparkline points={latest.sparkline} />
      <span className="live-strip__updated">
        {stale && <span className="live-strip__stale"><TriangleAlert size={13} aria-hidden="true" /> Stale data</span>}
        <span>{formatRelative(Date.parse(latest.current.at), now)}</span>
      </span>
      <ChevronRight size={16} aria-hidden="true" className="live-strip__chevron" />
    </a>
  );
}
