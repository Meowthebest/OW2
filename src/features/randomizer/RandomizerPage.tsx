import { useEffect, useRef } from 'react';
import { HeroStage } from './HeroStage';
import { RecentResults } from './RecentResults';
import { Roster } from './Roster';
import { SettingsPanel } from './SettingsPanel';
import { RollButtons } from './stageParts';
import type { RandomizerApi } from './useRandomizer';

export function RandomizerPage({ api, focusRoster }: { api: RandomizerApi; focusRoster: boolean }) {
  const first = useRef(true);

  useEffect(() => {
    const smooth = !first.current && api.motion !== 'off';
    first.current = false;
    if (focusRoster) document.getElementById('heroes')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    else window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    // Only navigation should move the page, not a change of animation setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRoster]);

  return (
    <div className="randomizer page">
      <div className="randomizer__top">
        <HeroStage api={api} />
        <SettingsPanel api={api} />
        <RecentResults api={api} />
      </div>
      <Roster api={api} />
      <div className="dock"><RollButtons api={api} compact /></div>
      <p className="sr-only" role="status" aria-live="polite">{api.announcement}</p>
    </div>
  );
}
