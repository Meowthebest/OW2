import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, MessageSquareText, X } from 'lucide-react';
import { SelectField, StateBlock } from '../../../components/controls';
import { RoleIcon } from '../../../components/icons';
import { HeroPortrait } from '../../../components/media';
import { HERO_BY_ID, ROLE_LABEL } from '../../../data/heroes';
import { heroArtSmall } from '../../../lib/assets';
import { cn, formatDateTime } from '../../../lib/format';
import { cardGroup, rollupHero } from '../core/rollup';
import type { BalanceChange, CardGroup, HeroPatchTally, PatchFile, PatchIndex } from '../core/types';
import { loadHeroHistory, loadPatches, useAsync } from '../data';
import type { DrawerTarget } from '../filters';
import { abilityName, automaticSummary, formatPatchDate, leanText } from '../format';
import { AbilityTimeline } from './AbilityTimeline';
import { ChangeDetails } from './ChangeRow';
import { ClassBadge } from './Direction';

const GROUP_TITLE: Record<CardGroup, string> = {
  standard: 'Standard play',
  stadium: 'Stadium',
  limited: 'Limited-time mode',
};

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex="0"]';

function HeroBanner({ heroId, name, role }: { heroId: string; name: string; role: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="hero-drawer__art" data-role={role ?? undefined}>
      {failed ? (
        <HeroPortrait id={heroId} name={name} role={(role ?? undefined) as never} eager className="hero-drawer__fallback" />
      ) : (
        <img src={heroArtSmall(heroId)} alt="" decoding="async" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function GroupDetail({ group, lines, patch }: { group: CardGroup; lines: BalanceChange[]; patch: PatchFile }) {
  const rollup = rollupHero(lines);
  const note = patch.notes.find((item) => item.heroId === lines[0].heroId && item.group === group);
  const lean = leanText(rollup);
  const abilities = new Map<string, BalanceChange[]>();
  for (const line of lines) {
    const key = abilityName(line);
    abilities.set(key, [...(abilities.get(key) ?? []), line]);
  }

  return (
    <section className="hero-drawer__group">
      <header className="hero-drawer__group-head">
        <h3>{GROUP_TITLE[group]}</h3>
        <ClassBadge classification={rollup.classification} />
      </header>
      <p className="hero-drawer__summary">{note?.summary ?? automaticSummary(lines)}</p>
      {lean && <p className="hero-card__analysis"><b>Analysis</b> {lean}</p>}

      {note?.devIntent ? (
        <p className="hero-drawer__intent"><b>Blizzard's reason, summarized</b> {note.devIntent}</p>
      ) : note?.hasDeveloperComment ? (
        <p className="hero-drawer__intent">Blizzard published a developer comment on this change. <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Read it on the official page</a>.</p>
      ) : null}

      {[...abilities.entries()].map(([ability, items]) => (
        <div key={ability} className="hero-drawer__ability">
          <h4>{ability}</h4>
          <ChangeDetails changes={items} sourceUrl={patch.sourceUrl} />
        </div>
      ))}
    </section>
  );
}

function HistoryList({ tallies, current, onSelect }: { tallies: HeroPatchTally[]; current: string | null; onSelect: (patchId: string) => void }) {
  const rows = [...tallies].sort((a, b) => b.date.localeCompare(a.date) || a.group.localeCompare(b.group));
  return (
    <ol className="hero-history">
      {rows.map((row) => (
        <li key={`${row.patch}-${row.group}`}>
          <button type="button" className={cn('hero-history__row', row.patch === current && 'is-current')} aria-current={row.patch === current ? 'true' : undefined} onClick={() => onSelect(row.patch)}>
            <span className="hero-history__date">{formatPatchDate(row.date, 'short')}</span>
            <span className="hero-history__group">{row.group === 'standard' ? '' : GROUP_TITLE[row.group]}</span>
            <span className="hero-history__counts">{row.buffs} up, {row.nerfs} down{row.review ? `, ${row.review} review` : ''}</span>
            <ClassBadge classification={row.classification} />
          </button>
        </li>
      ))}
    </ol>
  );
}

/** The full record for one hero: this patch's changes, Blizzard's reasoning, history and sources. */
export function HeroDrawer({ target, index, onClose, onSelectPatch }: { target: DrawerTarget; index: PatchIndex; onClose: () => void; onSelectPatch: (patchId: string) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const history = useAsync(loadHeroHistory, 'hero-history');
  const tallies = useMemo(() => history.data?.heroes[target.heroId] ?? [], [history.data, target.heroId]);
  const patchIds = useMemo(() => [...new Set(tallies.map((tally) => tally.patch))].sort().reverse(), [tallies]);
  const key = patchIds.join(',');
  const files = useAsync<PatchFile[]>(() => loadPatches(patchIds), key || 'none');

  const patchId = target.patchId && patchIds.includes(target.patchId) ? target.patchId : patchIds[0] ?? null;
  const patch = files.data?.find((file) => file.id === patchId) ?? null;
  const lines = useMemo(() => patch?.changes.filter((change) => change.heroId === target.heroId) ?? [], [patch, target.heroId]);
  const groups = (['standard', 'stadium', 'limited'] as CardGroup[]).filter((group) => lines.some((line) => cardGroup(line) === group));

  const hero = HERO_BY_ID[target.heroId];
  const name = hero?.name ?? lines[0]?.heroName ?? target.heroId;
  const role = lines[0]?.role ?? hero?.role ?? null;
  const meta = index.patches.find((item) => item.id === patchId);

  const closeLatest = useRef(onClose);
  closeLatest.current = onClose;

  // A modal panel: focus moves in, stays in, and returns to where it came from.
  // Keys are handled on the document so they still work if focus lands outside the panel, such as after a click on empty space.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLatest.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const active = document.activeElement;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => {
        // Content of a closed <details> still has layout in some browsers, but Tab skips it.
        const closed = item.closest('details:not([open])');
        if (closed && item !== closed.querySelector('summary')) return false;
        return item.offsetParent !== null || item === active;
      });
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      root.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const loading = history.status === 'loading' || (files.status === 'loading' && !patch);
  const failed = history.status === 'error' || files.status === 'error';

  return (
    <div className="hero-drawer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hero-drawer__panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="hero-drawer-title" tabIndex={-1}>
        <div className="hero-drawer__bar">
          <button ref={closeButton} type="button" className="icon-button hero-drawer__close" aria-label={`Close ${name} details`} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <header className="hero-drawer__head">
          <HeroBanner key={target.heroId} heroId={target.heroId} name={name} role={role} />
          <div className="hero-drawer__identity">
            <span className="hero-drawer__portrait"><HeroPortrait id={target.heroId} name={name} role={role ?? undefined} eager /></span>
            <div>
              <h2 id="hero-drawer-title" className="hero-drawer__name">{name}</h2>
              {role && <p className="hero-drawer__role"><RoleIcon role={role} size={14} /> {ROLE_LABEL[role]}</p>}
            </div>
          </div>
        </header>

        <div className="hero-drawer__body">
          {failed && (
            <StateBlock tone="error" title="Could not load this hero's patch data" actions={<button type="button" className="btn-plain" onClick={() => { history.retry(); files.retry(); }}>Try again</button>}>
              The stored patch files did not load. Check your connection and try again.
            </StateBlock>
          )}
          {loading && !failed && (
            <div className="skeleton" aria-hidden="true"><span /><span /><span /><span /></div>
          )}
          {!loading && !failed && patchIds.length === 0 && (
            <StateBlock title="No recorded changes">The stored patches do not list a change for {name}.</StateBlock>
          )}

          {patch && (
            <>
              <div className="hero-drawer__patch">
                <SelectField label="Patch" value={patch.id} onChange={onSelectPatch}>
                  {patchIds.map((id) => <option key={id} value={id}>{formatPatchDate(id, 'short')}</option>)}
                </SelectField>
                <p>{patch.title}</p>
              </div>

              {groups.map((group) => (
                <GroupDetail key={group} group={group} lines={lines.filter((line) => cardGroup(line) === group)} patch={patch} />
              ))}

              <section className="hero-drawer__group">
                <h3>Sources</h3>
                <ul className="hero-drawer__sources">
                  <li><a className="text-link" href={patch.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /> Blizzard's official patch notes</a></li>
                  {patch.forumUrl && <li><a className="text-link" href={patch.forumUrl} target="_blank" rel="noreferrer"><MessageSquareText size={14} aria-hidden="true" /> Blizzard's forum post</a></li>}
                  <li>Last verified against the source {formatDateTime(Date.parse(meta?.lastVerifiedAt ?? patch.lastVerifiedAt))}</li>
                  <li>{patch.reviewedAt ? `Classifications reviewed ${formatPatchDate(patch.reviewedAt, 'short')}` : 'Classified by rules. Lines they could not settle are marked Needs Review.'}</li>
                  {patch.revisions.length > 0 && <li>Blizzard edited these notes after first import, {patch.revisions.length} {patch.revisions.length === 1 ? 'time' : 'times'}. The latest wording is shown.</li>}
                </ul>
              </section>
            </>
          )}

          {tallies.length > 0 && (
            <section className="hero-drawer__group">
              <h3>Patch history</h3>
              <HistoryList tallies={tallies} current={patchId} onSelect={onSelectPatch} />
            </section>
          )}

          {files.data && files.data.length > 0 && (
            <section className="hero-drawer__group">
              <h3>Ability history</h3>
              <AbilityTimeline key={patchId ?? 'none'} patches={files.data} heroId={target.heroId} heroName={name} focusPatchId={patchId} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
