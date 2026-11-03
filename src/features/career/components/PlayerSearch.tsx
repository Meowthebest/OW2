import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Search, UserRound } from 'lucide-react';
import { RemoteImage } from '../../../components/media';
import { careerStore } from '../api';
import { parsePlayerQuery, type PlayerQuery } from '../api/parseQuery';
import { normalizePlayerId, type CareerRequest } from '../api/requests';
import type { PlayerSearchResponse, PlayerSearchResult } from '../api/types';
import { careerHref, navigate } from '../../../lib/router';
import { cn, formatDate } from '../../../lib/format';
import { useResource } from '../useCareer';
import { ErrorBlock, Skeleton } from './states';

const PAGE_SIZE = 20;

export function PlayerAvatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  return (
    <RemoteImage
      src={src}
      alt=""
      className={cn('player-avatar', className)}
      fallback={<span className={cn('player-avatar player-avatar--fallback', className)} aria-hidden="true">{name ? name.charAt(0).toUpperCase() : <UserRound size={18} />}</span>}
    />
  );
}

function ResultRow({ player, onOpen }: { player: PlayerSearchResult; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="search-result" onClick={() => onOpen(normalizePlayerId(player.player_id))}>
        <PlayerAvatar src={player.avatar} name={player.name} />
        <span className="search-result__text">
          <span className="search-result__name">{player.name}</span>
          <span className="search-result__meta">
            {player.title ?? 'No title'}
            {player.last_updated_at ? <> · profile updated {formatDate(player.last_updated_at * 1000)}</> : null}
          </span>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

export function PlayerSearch({ compact = false, autoFocus = false }: { compact?: boolean; autoFocus?: boolean }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState<PlayerQuery | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [widened, setWidened] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const name = query?.kind === 'battletag' ? (widened ? query.name : query.tag) : query?.kind === 'name' ? query.name : null;
  const request: CareerRequest | null = name ? { endpoint: 'search', name, limit } : null;
  const entry = useResource<PlayerSearchResponse>(request);
  const results = entry.data?.results;

  const close = () => {
    setQuery(null);
    setInput('');
    setWidened(false);
    setLimit(PAGE_SIZE);
  };

  const open = (id: string) => {
    close();
    navigate(careerHref(id));
  };

  useEffect(() => {
    if (query?.kind !== 'battletag' || !results || widened) return;
    if (results.length === 1) open(normalizePlayerId(results[0].player_id));
    else if (results.length === 0) setWidened(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, query, widened]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parsePlayerQuery(input);
    setWidened(false);
    setLimit(PAGE_SIZE);
    if (parsed.kind === 'empty') {
      setQuery(null);
      inputRef.current?.focus();
    } else if (parsed.kind === 'id') {
      open(parsed.id);
    } else {
      setQuery(parsed);
    }
  };

  return (
    <div className={cn('player-search', compact && 'player-search--compact')}>
      <form className="player-search__form" role="search" onSubmit={submit}>
        <label className="search-field search-field--large">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Find a player by BattleTag, exact name or career profile link</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="BattleTag (Name#1234), exact name, or profile link"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus={autoFocus}
          />
        </label>
        <button type="submit" className="btn btn--primary btn--search" aria-label="Find player"><span><Search size={17} aria-hidden="true" /><span className="btn__text">Find player</span></span></button>
      </form>

      {query?.kind === 'invalid' && <p className="player-search__hint player-search__hint--error" role="alert">{query.reason}</p>}

      {name && (
        <div className="search-results" aria-live="polite">
          {entry.status === 'error' && entry.error && <ErrorBlock error={entry.error} onRetry={() => request && void careerStore.retry(request)} />}
          {entry.data === undefined && entry.status !== 'error' && <Skeleton lines={3} />}
          {results && results.length === 0 && (
            <div className="search-results__empty">
              <strong>No public profile named “{name}”.</strong>
              <p>Names must match exactly, including capital letters, and private profiles never appear in search. If you have their profile link, paste that instead.</p>
            </div>
          )}
          {results && results.length > 0 && (
            <>
              <p className="search-results__count">
                {widened && query?.kind === 'battletag' && <>No exact match for {query.tag}. </>}
                {entry.data?.total} public {entry.data?.total === 1 ? 'player' : 'players'} named “{name}”
              </p>
              <ul className="search-results__list">
                {results.map((player) => <ResultRow key={player.player_id} player={player} onOpen={open} />)}
              </ul>
              {(entry.data?.total ?? 0) > results.length && (
                <button type="button" className="btn-plain" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Show more players</button>
              )}
            </>
          )}
          <button type="button" className="text-button search-results__close" onClick={close}>Close results</button>
        </div>
      )}
    </div>
  );
}
