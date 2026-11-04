import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { RoleIcon } from '../../components/icons';
import { SelectField } from '../../components/controls';
import { HeroPortrait } from '../../components/media';
import { ROLE_LABEL, SUB_ROLES, type Hero } from '../../data/heroes';
import { cn } from '../../lib/format';
import type { PlayerRole } from '../../lib/randomizer';
import { HeroArt, PartyPicker, RollButtons, preloadArt } from './stageParts';
import { PLAYER_NAME_LIMIT, type RandomizerApi, type SlotSpin, type TeamMember } from './useRandomizer';

const ART_SIZES = '(max-width: 760px) 100vw, 30vw';

/** Purely visual: the winner is already drawn. Tiles scroll up and stop on the winner. */
function SlotReel({ reel }: { reel: SlotSpin }) {
  const track = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = track.current;
    const tile = element?.firstElementChild as HTMLElement | null;
    if (!element || !tile || typeof element.animate !== 'function') return;
    const animation = element.animate(
      [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(0, ${-reel.winnerIndex * tile.offsetHeight}px, 0)` }],
      { duration: reel.duration, easing: 'cubic-bezier(.12, .7, .1, 1)', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [reel]);

  return (
    <div className="slot-reel" aria-hidden="true">
      <div className="slot-reel__track" ref={track}>
        {reel.tiles.map((hero, index) => (
          <div className="slot-reel__tile" data-role={hero.role} key={hero.id + index}>
            <HeroPortrait id={hero.id} name={hero.name} role={hero.role} eager />
            <span>{hero.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ api, member, animate, selected, onSelect }: { api: RandomizerApi; member: TeamMember; animate: boolean; selected: boolean; onSelect: () => void }) {
  const { hero, index, role, displayName } = member;
  const reel = api.spin?.reels.find((item) => item.slot === index);
  const eligible = api.pool.filter((item) => role === 'any' || item.role === role).length;
  const roleLabel = role === 'any' ? 'any' : ROLE_LABEL[role].toLowerCase();

  return (
    <li className={cn('slot', selected && hero && 'is-selected', reel && 'is-rolling')} data-role={hero?.role ?? (role === 'any' ? 'none' : role)}>
      <div className="slot__media" aria-hidden="true">
        {hero && !reel && <HeroArt key={`${hero.id}-${animate ? api.revealKey : 0}`} hero={hero} animate={animate} sizes={ART_SIZES} />}
        {!hero && !reel && <span className="slot__empty">?</span>}
        <div className="slot__shade" />
      </div>

      {reel && <SlotReel reel={reel} />}
      {animate && !reel && <div key={api.revealKey} className="slot__flash" style={{ animationDelay: `${index * 50}ms` }} aria-hidden="true" />}

      <div className="slot__top">
        <div className="slot__identity">
          <span className="slot__tag" aria-hidden="true">P{index + 1}</span>
          <input
            className="slot__input"
            value={member.name}
            onChange={(event) => api.setPlayerName(index, event.target.value)}
            placeholder={`Player ${index + 1}`}
            maxLength={PLAYER_NAME_LIMIT}
            disabled={api.spinning}
            aria-label={`Player ${index + 1} name`}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <SelectField label={`${displayName} role`} hideLabel value={role} onChange={(value) => api.setPlayerRole(index, value as PlayerRole)} className="slot__role">
          <option value="any">Any role</option>
          <option value="tank">Tank</option>
          <option value="damage">Damage</option>
          <option value="support">Support</option>
        </SelectField>
      </div>

      <div className={cn('slot__bottom', animate && !reel && 'slot__bottom--reveal')}>
        {hero && !reel && (
          <>
            <button type="button" className="slot__hero" onClick={onSelect} aria-pressed={selected} aria-label={`${hero.name} for ${displayName}. Show hero details.`}>
              <span className="slot__name">{hero.name}</span>
            </button>
            <div className="slot__meta">
              <span className="role-badge" data-role={hero.role}><RoleIcon role={hero.role} size={13} />{ROLE_LABEL[hero.role]}</span>
              <button type="button" className="icon-button slot__reroll" onClick={() => api.rerollPlayer(index)} disabled={api.spinning || eligible < 2} aria-label={`Reroll ${displayName}`} title={`Reroll ${displayName}`}>
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
        {!hero && !reel && (
          <p className={cn('slot__status', eligible === 0 && 'is-warning')}>
            {eligible === 0 ? `No ${roleLabel} heroes in the pool` : 'Ready to roll'}
          </p>
        )}
      </div>
    </li>
  );
}

function HeroFocus({ hero, who }: { hero: Hero; who: string }) {
  const subRole = SUB_ROLES[hero.subRole];
  return (
    <div className="hero-focus" data-role={hero.role}>
      <HeroPortrait id={hero.id} name={hero.name} role={hero.role} />
      <div className="hero-focus__main">
        <p className="hero-focus__title"><strong>{hero.name}</strong><span>{who} · {subRole.label}</span></p>
        <p className="hero-focus__summary">{hero.summary}</p>
      </div>
      <div className="hero-focus__side">
        <p className="hero-focus__passive"><b>{subRole.label} passive:</b> {subRole.passive}</p>
        <ul className="stage__abilities" aria-label={`${hero.name} abilities`}>
          {hero.abilities.map((ability) => <li key={ability}>{ability}</li>)}
        </ul>
        <a className="text-link hero-focus__link" href={`https://overwatch.blizzard.com/en-us/heroes/${hero.id}/`} target="_blank" rel="noreferrer">
          Official hero page <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

export function LineupStage({ api }: { api: RandomizerApi }) {
  const { team, spin, spinning, revealKey, revealSlots, pool, state } = api;
  const mountedKey = useRef(revealKey);
  const justRolled = revealKey !== mountedKey.current && api.motion !== 'off';
  const [focus, setFocus] = useState(0);

  const focused = team[focus]?.hero ? team[focus] : team.find((member) => member.hero);
  const filled = team.filter((member) => member.hero).length;

  useEffect(() => {
    spin?.reels.forEach((reel) => preloadArt(reel.winner.id, ART_SIZES));
  }, [spin]);

  return (
    <section className="stage stage--team" data-role="none" data-spinning={spinning} aria-labelledby="stage-title" aria-busy={spinning}>
      <div className="stage__backdrop" aria-hidden="true">
        <div className="stage__glow" />
        <div className="stage__hex" />
      </div>

      <header className="team-head">
        <div>
          <span className="eyebrow">Team of {state.partySize}</span>
          <h1 className="team-head__title" id="stage-title">{filled === team.length ? 'Team locked in' : "Who's playing who?"}</h1>
        </div>
        <PartyPicker api={api} />
      </header>

      <ol className="lineup" style={{ '--slots': state.partySize } as React.CSSProperties}>
        {team.map((member) => (
          <PlayerCard
            key={member.index}
            api={api}
            member={member}
            animate={justRolled && revealSlots.includes(member.index)}
            selected={focused?.index === member.index}
            onSelect={() => setFocus(member.index)}
          />
        ))}
      </ol>

      {focused?.hero && !spinning && <HeroFocus hero={focused.hero} who={focused.displayName} />}

      <div className="stage__controls">
        <div className="stage__filter">
          <div className="team-roles">
            <button type="button" className="btn-plain" onClick={api.assignTeamRoles} disabled={spinning}>Assign team roles</button>
            <button type="button" className="btn-plain" onClick={api.clearPlayerRoles} disabled={spinning || team.every((member) => member.role === 'any')}>Any role</button>
          </div>
          <p className="stage__odds" data-empty={pool.length < state.partySize}>
            {pool.length === 0
              ? 'No eligible heroes. Allow a role or include some heroes.'
              : pool.length < state.partySize
                ? `Only ${pool.length} eligible ${pool.length === 1 ? 'hero' : 'heroes'} for ${state.partySize} players.`
                : <><strong>{pool.length} heroes</strong> in the pool. Nobody on the team gets the same hero.</>}
          </p>
        </div>
        <div className="stage__actions"><RollButtons api={api} /></div>
      </div>
    </section>
  );
}
