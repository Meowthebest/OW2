import { RefreshCw } from 'lucide-react';
import { RoleIcon } from '../../components/icons';
import { HeroPortrait } from '../../components/media';
import { HERO_BY_ID, ROLE_LABEL } from '../../data/heroes';
import { cn, formatRelative } from '../../lib/format';
import type { RandomizerApi } from './useRandomizer';

export function RecentResults({ api }: { api: RandomizerApi }) {
  const { history } = api.state;
  return (
    <section className="recent" aria-label="Recent results">
      <header className="recent__head">
        <h2 className="panel__title">Recent results</h2>
        {history.length > 0 && (
          <button type="button" className="text-button" onClick={api.clearHistory} disabled={api.spinning}>Clear</button>
        )}
      </header>
      {history.length === 0 ? (
        <p className="recent__empty">Your last 30 rolls will line up here.</p>
      ) : (
        <ol className="recent__list">
          {history.map((entry) => {
            const hero = HERO_BY_ID[entry.id];
            return (
              <li key={entry.id + entry.at} className={cn('recent-card', entry.at === history[0].at && 'is-latest')} data-role={hero.role}>
                <HeroPortrait id={hero.id} name={hero.name} role={hero.role} />
                <span className="recent-card__text">
                  <span className="recent-card__name">{hero.name}</span>
                  <span className="recent-card__meta">
                    <RoleIcon role={hero.role} size={11} />
                    <span className="sr-only">{ROLE_LABEL[hero.role]}, </span>
                    {entry.who ? <span className="recent-card__who">{entry.who}</span> : formatRelative(entry.at)}
                    {entry.reroll && <RefreshCw size={10} aria-label="from a reroll" />}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
