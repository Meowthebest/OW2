import { useLayoutEffect, useRef } from 'react';
import { ROLE_LABEL } from '../../data/heroes';
import { heroPortrait } from '../../lib/assets';
import { HeroPortrait } from '../../components/media';
import type { SlotSpin } from './useRandomizer';

/**
 * Purely visual: the winner is drawn before this mounts. The strip decelerates onto the
 * winner's tile while the tile under the marker drives the stage tint and ghost portrait.
 */
export function SpinReel({ spin, stageRef }: { spin: SlotSpin; stageRef: React.RefObject<HTMLElement> }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    const trackEl = track.current;
    const viewportEl = viewport.current;
    if (!trackEl || !viewportEl || typeof trackEl.animate !== 'function') return;

    const tiles = Array.from(trackEl.children) as HTMLElement[];
    const tileWidth = tiles[0].offsetWidth;
    const step = tiles[1].offsetLeft - tiles[0].offsetLeft;
    const center = viewportEl.clientWidth / 2 - tileWidth / 2;
    const startX = center - 2 * step;
    const endX = center - spin.winnerIndex * step;

    const animation = trackEl.animate(
      [{ transform: `translate3d(${startX}px, 0, 0)` }, { transform: `translate3d(${endX}px, 0, 0)` }],
      { duration: spin.duration, easing: 'cubic-bezier(.1, .68, .08, 1)', fill: 'forwards' },
    );

    let frame = 0;
    let activeIndex = -1;
    const tick = () => {
      const x = new DOMMatrixReadOnly(getComputedStyle(trackEl).transform).m41;
      const index = Math.min(tiles.length - 1, Math.max(0, Math.round((center - x) / step)));
      if (index !== activeIndex) {
        tiles[activeIndex]?.classList.remove('is-active');
        tiles[index]?.classList.add('is-active');
        activeIndex = index;
        const hero = spin.tiles[index];
        if (stageRef.current) stageRef.current.dataset.role = hero.role;
        if (ghost.current) ghost.current.src = heroPortrait(hero.id);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      animation.cancel();
    };
  }, [spin, stageRef]);

  return (
    <div className="reel" aria-hidden="true">
      <img ref={ghost} className="reel__ghost" alt="" src={heroPortrait(spin.tiles[2].id)} />
      <div className="reel__label">Rolling<span className="reel__dots" /></div>
      <div className="reel__viewport" ref={viewport}>
        <div className="reel__marker" />
        <div className="reel__track" ref={track}>
          {spin.tiles.map((hero, index) => (
            <div className="reel__tile" data-role={hero.role} key={hero.id + index}>
              <HeroPortrait id={hero.id} name={hero.name} role={hero.role} eager />
              <span className="reel__name">{hero.name}</span>
              <span className="sr-only">{ROLE_LABEL[hero.role]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
