import { useState } from 'react';
import { RefreshCw, Shuffle } from 'lucide-react';
import { Segmented } from '../../components/controls';
import { HeroPortrait } from '../../components/media';
import type { Hero } from '../../data/heroes';
import { heroArt, heroArtSmall } from '../../lib/assets';
import { cn } from '../../lib/format';
import { MAX_PLAYERS, type RandomizerApi } from './useRandomizer';

export function preloadArt(id: string, sizes: string) {
  const image = new Image();
  image.sizes = sizes;
  image.srcset = `${heroArtSmall(id)} 900w, ${heroArt(id)} 1600w`;
}

/** Callers key this by hero, so each hero starts fresh. A preloaded image can fire onLoad before effects run. */
export function HeroArt({ hero, animate, sizes }: { hero: Hero; animate: boolean; sizes: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  if (state === 'failed') {
    return <HeroPortrait id={hero.id} name={hero.name} role={hero.role} className="stage__art-fallback" eager />;
  }
  return (
    <img
      className={cn('stage__art', state === 'ready' && 'is-ready', animate && 'stage__art--reveal')}
      src={heroArt(hero.id)}
      srcSet={`${heroArtSmall(hero.id)} 900w, ${heroArt(hero.id)} 1600w`}
      sizes={sizes}
      alt=""
      width={1600}
      height={760}
      onLoad={() => setState('ready')}
      onError={() => setState('failed')}
    />
  );
}

export function PartyPicker({ api, className }: { api: RandomizerApi; className?: string }) {
  const sizes = Array.from({ length: MAX_PLAYERS }, (_, index) => String(index + 1));
  return (
    <div className={cn('party-picker', className)}>
      <span className="party-picker__label" aria-hidden="true">Players</span>
      <Segmented
        label="Number of players"
        value={String(api.state.partySize)}
        disabled={api.spinning}
        onChange={(value) => api.setPartySize(Number(value))}
        options={sizes.map((size) => ({ value: size, label: size, ariaLabel: size === '1' ? '1 player' : `${size} players` }))}
      />
    </div>
  );
}

export function RollButtons({ api, compact = false }: { api: RandomizerApi; compact?: boolean }) {
  const isTeam = api.state.partySize > 1;
  const canReroll = api.current !== null && api.pool.some((hero) => hero.id !== api.current?.id);
  return (
    <div className={cn('roll-actions', compact && 'roll-actions--dock')}>
      {!isTeam && (
        <button type="button" className="btn btn--ghost btn--reroll" onClick={() => api.roll(true)} disabled={api.spinning || !canReroll} aria-label="Reroll hero">
          <span><RefreshCw size={17} aria-hidden="true" /><span className="btn__text">Reroll</span></span>
        </button>
      )}
      <button type="button" className="btn btn--primary" onClick={() => api.roll(false)} disabled={api.spinning || api.pool.length === 0}>
        <span><Shuffle size={compact ? 20 : 24} aria-hidden="true" />{api.spinning ? 'Rolling…' : isTeam ? 'Randomize team' : 'Randomize hero'}</span>
      </button>
    </div>
  );
}
