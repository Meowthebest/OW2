import { useEffect, useRef } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { RoleIcon } from '../../components/icons';
import { Segmented } from '../../components/controls';
import { HeroPortrait } from '../../components/media';
import { ROLES, ROLE_LABEL, SUB_ROLES, type Hero, type Role } from '../../data/heroes';
import { cn } from '../../lib/format';
import { LineupStage } from './LineupStage';
import { SpinReel } from './SpinReel';
import { HeroArt, PartyPicker, RollButtons, preloadArt } from './stageParts';
import type { RandomizerApi } from './useRandomizer';

const ART_SIZES = '(max-width: 760px) 100vw, 75vw';

function PortraitWall({ pool }: { pool: Hero[] }) {
  return (
    <div className="stage__wall" aria-hidden="true">
      {pool.map((hero) => (
        <HeroPortrait key={hero.id} id={hero.id} name={hero.name} role={hero.role} />
      ))}
    </div>
  );
}

function HeroDetails({ hero, animate, rolls }: { hero: Hero; animate: boolean; rolls: number }) {
  const subRole = SUB_ROLES[hero.subRole];
  return (
    <div className={cn('stage__hero', animate && 'stage__hero--reveal')}>
      <p className="stage__eyebrow">
        <span className="eyebrow">Selected hero</span>
        {rolls > 0 && <span className="stage__count">Roll {rolls}</span>}
      </p>
      <h1 className="stage__name" id="stage-title">{hero.name}</h1>
      <div className="stage__tags">
        <span className="role-badge" data-role={hero.role}><RoleIcon role={hero.role} size={15} />{ROLE_LABEL[hero.role]}</span>
        <span className="tag">{subRole.label}</span>
        {hero.isNew && <span className="tag tag--accent">New hero</span>}
        {hero.stadium && <span className="tag">In Stadium</span>}
      </div>
      <p className="stage__summary">{hero.summary}</p>
      <dl className="stage__facts">
        <div>
          <dt>{subRole.label} passive</dt>
          <dd>{subRole.passive}</dd>
        </div>
        <div>
          <dt><MapPin size={12} aria-hidden="true" /> Base</dt>
          <dd>{hero.base}</dd>
        </div>
      </dl>
      <ul className="stage__abilities" aria-label={`${hero.name} abilities`}>
        {hero.abilities.map((ability) => <li key={ability}>{ability}</li>)}
      </ul>
      <span className="stage__links">
        <a className="text-link stage__link" href={`https://overwatch.blizzard.com/en-us/heroes/${hero.id}/`} target="_blank" rel="noreferrer">
          Official hero page <ExternalLink size={13} aria-hidden="true" />
        </a>
        <a className="text-link stage__link" href={`#/cosmetics?hero=${hero.id}`}>{hero.name}'s cosmetics</a>
      </span>
    </div>
  );
}

function IdleIntro({ poolSize }: { poolSize: number }) {
  return (
    <div className="stage__hero stage__hero--idle">
      <p className="stage__eyebrow"><span className="eyebrow">Random hero selector</span></p>
      <h1 className="stage__name" id="stage-title">Who's next?</h1>
      <p className="stage__summary">
        Set your pool, hit randomize, and lock in whoever comes up.
        {poolSize > 0 ? ` ${poolSize} heroes are ready to roll.` : ''}
      </p>
    </div>
  );
}

export function RoleFilter({ api }: { api: RandomizerApi }) {
  const { roles } = api.state;
  const allOn = roles.length === ROLES.length;
  type Option = Role | 'all';
  return (
    <Segmented<Option>
      label="Role filter"
      className="segmented--roles"
      disabled={api.spinning}
      isActive={(value) => (value === 'all' ? allOn : !allOn && roles.includes(value))}
      onChange={api.focusRole}
      options={[
        { value: 'all', label: 'All roles' },
        ...ROLES.map((role) => ({
          value: role as Option,
          ariaLabel: ROLE_LABEL[role],
          label: <><RoleIcon role={role} size={15} /><span className="segmented__text">{ROLE_LABEL[role]}</span></>,
        })),
      ]}
    />
  );
}

function SoloStage({ api }: { api: RandomizerApi }) {
  const stage = useRef<HTMLElement>(null);
  const { current, spin, spinning, revealKey, pool, remaining } = api;
  const reel = spin?.reels[0];
  // Only a roll made while this page is open gets the reveal, not coming back from another page.
  const mountedKey = useRef(revealKey);
  const animate = revealKey !== mountedKey.current && api.motion !== 'off';

  useEffect(() => {
    if (reel) preloadArt(reel.winner.id, ART_SIZES);
  }, [reel]);

  // The reel writes the tile role straight to the DOM while spinning; restore it afterwards.
  useEffect(() => {
    if (!spinning && stage.current) stage.current.dataset.role = current?.role ?? 'none';
  }, [current, spinning]);

  const eligible = api.state.noRepeats && remaining.length > 0 ? remaining.length : pool.length;

  return (
    <section className="stage" ref={stage} data-role={current?.role ?? 'none'} data-spinning={spinning} aria-labelledby="stage-title" aria-busy={spinning}>
      <div className="stage__backdrop" aria-hidden="true">
        {current ? <HeroArt key={`${current.id}-${revealKey}`} hero={current} animate={animate} sizes={ART_SIZES} /> : <PortraitWall pool={pool} />}
        <div className="stage__shade" />
        <div className="stage__glow" />
        <div className="stage__hex" />
      </div>

      <PartyPicker api={api} className="stage__party" />

      {reel && <SpinReel spin={reel} stageRef={stage} />}
      {animate && current && !spinning && <div key={revealKey} className="stage__flash" aria-hidden="true"><i /><i /></div>}

      <div className="stage__body">
        {current ? <HeroDetails key={`${current.id}-${revealKey}`} hero={current} animate={animate} rolls={api.state.rolls} /> : <IdleIntro poolSize={pool.length} />}
      </div>

      <div className="stage__controls">
        <div className="stage__filter">
          <RoleFilter api={api} />
          <p className="stage__odds" data-empty={pool.length === 0}>
            {pool.length === 0
              ? 'No eligible heroes. Allow a role or include some heroes.'
              : <>Fair draw: <strong>1 in {eligible}</strong> for every eligible hero</>}
          </p>
        </div>
        <div className="stage__actions"><RollButtons api={api} /></div>
      </div>
    </section>
  );
}

export function HeroStage({ api }: { api: RandomizerApi }) {
  return api.state.partySize > 1 ? <LineupStage api={api} /> : <SoloStage api={api} />;
}
