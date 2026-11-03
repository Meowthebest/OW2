import type { ReactNode } from 'react';
import { CloudOff, EyeOff, RefreshCw, SearchX } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { careerStore } from '../api';
import { describeError, type CareerError } from '../api/errors';
import type { CareerRequest } from '../api/requests';
import type { Entry } from '../api/store';

export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={'skeleton ' + (className ?? '')} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: CareerError; onRetry?: () => void }) {
  const copy = describeError(error);
  return (
    <StateBlock
      tone="error"
      icon={<CloudOff size={22} />}
      title={copy.title}
      actions={onRetry && <button type="button" className="btn-plain" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /> Try again</button>}
    >
      {copy.body}
    </StateBlock>
  );
}

export function PrivateProfileBlock({ name }: { name?: string }) {
  return (
    <StateBlock icon={<EyeOff size={22} />} title="No public statistics on this profile">
      <p>
        {name ?? 'This player'} is either private or has no recorded stats. Blizzard only publishes career statistics when a player
        sets <b>Options → Social → Career Profile Visibility</b> to <b>Public</b>, and this site can't see anything beyond that.
      </p>
    </StateBlock>
  );
}

export function NotFoundBlock({ id }: { id: string }) {
  return (
    <StateBlock icon={<SearchX size={22} />} title="Player not found">
      <p>
        No public career profile matches <b>{id}</b>. BattleTags and names are case-sensitive, and private profiles can't be found by search.
      </p>
    </StateBlock>
  );
}

export function NoDataBlock({ title, children }: { title: string; children?: ReactNode }) {
  return <StateBlock title={title}>{children}</StateBlock>;
}

/** Renders a panel's content once its data exists, with loading and failure states before that. */
export function ResourceGate<T>({ entry, request, lines = 4, children }: { entry: Entry<T>; request: CareerRequest; lines?: number; children: (data: T) => ReactNode }) {
  if (entry.data !== undefined) return <>{children(entry.data)}</>;
  if (entry.status === 'error' && entry.error) return <ErrorBlock error={entry.error} onRetry={() => void careerStore.retry(request)} />;
  return <Skeleton lines={lines} />;
}
