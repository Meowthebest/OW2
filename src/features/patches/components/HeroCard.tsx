import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, PanelRightOpen } from 'lucide-react';
import { RoleIcon } from '../../../components/icons';
import { HeroPortrait } from '../../../components/media';
import { ROLE_LABEL } from '../../../data/heroes';
import { cn } from '../../../lib/format';
import type { HeroCardModel } from '../filters';
import { abilityName, automaticSummary, formatPatchDate, leanText } from '../format';
import { ChangeRows } from './ChangeRow';
import { ClassBadge } from './Direction';

const VISIBLE_ROWS = 3;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function CardCounts({ card }: { card: HeroCardModel }) {
  const { rollup } = card;
  const neutral = rollup.neutral + rollup.qol;
  return (
    <p className="hero-card__counts">
      <span className="count-chip" data-direction="buff"><ArrowUp size={13} strokeWidth={2.8} aria-hidden="true" />{plural(rollup.buffs, 'buff')}</span>
      <span className="count-chip" data-direction="nerf"><ArrowDown size={13} strokeWidth={2.8} aria-hidden="true" />{plural(rollup.nerfs, 'nerf')}</span>
      {neutral > 0 && <span className="count-chip">{neutral} neutral or QoL</span>}
      {rollup.fixes > 0 && <span className="count-chip">{rollup.fixes === 1 ? '1 fix' : `${rollup.fixes} fixes`}</span>}
      {rollup.review > 0 && <span className="count-chip" data-direction="needs-review">{rollup.review} need{rollup.review === 1 ? 's' : ''} review</span>}
    </p>
  );
}

export function HeroCard({ card, showDate, onOpen }: { card: HeroCardModel; showDate: boolean; onOpen: (card: HeroCardModel) => void }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const { shown, lines, rollup, note } = card;
  const abilities = [...new Set(shown.map(abilityName))];
  const lean = leanText(rollup);
  const rest = shown.slice(VISIBLE_ROWS);
  const canExpand = rest.length > 0 || Boolean(note?.devIntent);

  return (
    <article className="hero-card" data-class={rollup.classification} data-role={card.role ?? undefined}>
      <header className="hero-card__head">
        <h3 className="hero-card__title">
          <button type="button" className="hero-card__identity" onClick={() => onOpen(card)}>
            <span className="sr-only">Open full details for </span>
            <HeroPortrait id={card.heroId} name={card.heroName} role={card.role ?? undefined} className="hero-card__portrait" />
            <span className="hero-card__who">
              <span className="hero-card__name">{card.heroName}</span>
              <span className="hero-card__role">
                {card.role && <><RoleIcon role={card.role} size={13} /> {ROLE_LABEL[card.role]}</>}
                {showDate && <span className="hero-card__date">{card.role ? ' · ' : ''}{formatPatchDate(card.patch.date, 'short')}</span>}
              </span>
            </span>
          </button>
        </h3>
        <ClassBadge classification={rollup.classification} />
      </header>

      <CardCounts card={card} />

      <p className="hero-card__summary">{note?.summary ?? automaticSummary(lines)}</p>
      {lean && <p className="hero-card__analysis"><b>Analysis</b> {lean}</p>}

      <p className="hero-card__abilities"><span className="sr-only">Abilities affected: </span>{abilities.map((name) => <span key={name} className="ability-chip">{name}</span>)}</p>

      {shown.length < lines.length && <p className="hero-card__narrowed">Showing {shown.length} of {plural(lines.length, 'change')} that match your filters.</p>}

      <ChangeRows changes={shown.slice(0, VISIBLE_ROWS)} sourceUrl={card.patch.sourceUrl} />

      {canExpand && (
        <>
          <div className={cn('hero-card__more', expanded && 'is-open')} id={panelId} hidden={!expanded}>
            <div className="hero-card__more-inner">
              {rest.length > 0 && <ChangeRows changes={rest} sourceUrl={card.patch.sourceUrl} />}
              {note?.devIntent && (
                <p className="hero-card__intent">
                  <b>Blizzard's reason, summarized</b> {note.devIntent}
                </p>
              )}
            </div>
          </div>
          <button type="button" className="hero-card__toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)}>
            <ChevronDown size={15} aria-hidden="true" className={cn(expanded && 'is-flipped')} />
            {expanded ? 'Show less' : rest.length > 0 ? `Show all ${shown.length} changes` : "Show Blizzard's reason"}
          </button>
        </>
      )}

      <footer className="hero-card__foot">
        <button type="button" className="hero-card__link" onClick={() => onOpen(card)}>
          <PanelRightOpen size={14} aria-hidden="true" /> Hero details and history
        </button>
        <a className="hero-card__link" href={card.patch.sourceUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden="true" /> Official patch notes
        </a>
      </footer>
    </article>
  );
}
