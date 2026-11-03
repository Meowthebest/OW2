import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { RemoteImage } from '../../../components/media';
import { useToast } from '../../../components/Toast';
import { cn, formatDate, formatDateTime, formatRelative } from '../../../lib/format';
import { careerStore } from '../api';
import { describeError } from '../api/errors';
import type { CareerRequest } from '../api/requests';
import type { PlayerSummary } from '../api/types';
import { refreshPlayer, useRefreshCooldown, type CareerProfile } from '../useCareer';
import { PlayerAvatar } from './PlayerSearch';

function EndorsementBadge({ level }: { level: number }) {
  return (
    <span className="endorsement" title={`Endorsement level ${level}`}>
      <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true" focusable="false">
        <path d="M20 2.5 35.2 11.2v17.6L20 37.5 4.8 28.8V11.2z" fill="none" stroke="currentColor" strokeWidth="2.6" />
      </svg>
      <b aria-hidden="true">{level}</b>
      <span className="endorsement__label">Endorsement<span className="sr-only"> level {level}</span></span>
    </span>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function DataStatus({ profile, playerId, requests }: { profile: CareerProfile; playerId: string; requests: CareerRequest[] }) {
  const toast = useToast();
  const now = useNow(30000);
  const { seconds, sync } = useRefreshCooldown(playerId);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    const outcome = await refreshPlayer(playerId, requests);
    setBusy(false);
    sync();
    if (outcome.kind === 'cooldown') return;
    if (outcome.error) toast({ message: describeError(outcome.error).title + '. Keeping the cached copy.', tone: 'warn' });
    else toast({ message: outcome.changed ? 'Career stats updated.' : 'No newer data from the source yet.' });
  };

  const { lastUpdated, revalidating, refreshError, expired } = profile;
  let state = 'Loading';
  let tone: 'ok' | 'warn' | 'busy' = 'busy';
  if (lastUpdated !== null) {
    if (revalidating) state = 'Checking for newer data';
    else if (refreshError) {
      state = 'Update failed, showing cached copy';
      tone = 'warn';
    } else if (expired) {
      state = 'Cached copy, over an hour old';
      tone = 'warn';
    } else {
      state = 'Cached copy, not live';
      tone = 'ok';
    }
  }

  return (
    <div className="data-status">
      <div className="data-status__text">
        <span className="eyebrow">Last updated</span>
        <strong title={lastUpdated ? formatDateTime(lastUpdated) : undefined}>{lastUpdated ? formatRelative(lastUpdated, now) : '—'}</strong>
        <span className="data-status__state" data-tone={tone}>{state}</span>
        <span className="data-status__source">
          Source: {careerStore.provider.label}
          {!careerStore.provider.viaWorker && <> (its own cache can add delay)</>}
        </span>
      </div>
      <button type="button" className={cn('btn-plain data-status__refresh', busy && 'is-busy')} onClick={refresh} disabled={busy || seconds > 0 || revalidating}>
        <RefreshCw size={15} aria-hidden="true" />
        {busy ? 'Refreshing' : seconds > 0 ? `Refresh in ${seconds}s` : 'Refresh'}
      </button>
    </div>
  );
}

export function ProfileHeader({ playerId, summary, children }: { playerId: string; summary?: PlayerSummary; children?: React.ReactNode }) {
  const name = summary?.username ?? playerId.replace(/-\d+$/, '');
  const isHexId = playerId.includes('|');
  return (
    <header className="profile">
      <div className="profile__banner" aria-hidden="true">
        <RemoteImage src={summary?.namecard} className="profile__namecard" fallback={null} />
      </div>
      <div className="profile__content">
        <PlayerAvatar src={summary?.avatar} name={name} className="profile__avatar" />
        <div className="profile__identity">
          <h1 className="profile__name">{name}</h1>
          {summary?.title && <p className="profile__title">{summary.title}</p>}
          <div className="profile__meta">
            {typeof summary?.endorsement?.level === 'number' && summary.endorsement.level > 0 && <EndorsementBadge level={summary.endorsement.level} />}
            {summary?.last_updated_at && <span>Blizzard profile changed {formatDate(summary.last_updated_at * 1000)}</span>}
            {isHexId && (
              <a className="text-link" href={`https://overwatch.blizzard.com/en-us/career/${encodeURIComponent(playerId)}/`} target="_blank" rel="noreferrer">
                Official profile <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
