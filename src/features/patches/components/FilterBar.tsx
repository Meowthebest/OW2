import { useId, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Circle, CircleHelp, Layers, RotateCcw, Search, SlidersHorizontal, Wrench, type LucideIcon } from 'lucide-react';
import { SelectField } from '../../../components/controls';
import { RoleIcon } from '../../../components/icons';
import { ROLES, ROLE_LABEL, type Role } from '../../../data/heroes';
import { cn } from '../../../lib/format';
import type { PatchIndex } from '../core/types';
import { activeFilterCount, type BalanceFilter, type FormatFilter, type KindFilter, type PatchFilters, type QueueFilter, type SortKey, type StatFilter } from '../filters';
import { formatPatchDate } from '../format';
import { typeLabel } from './PatchHeader';

const BALANCE_OPTIONS: Array<{ value: BalanceFilter; label: string; Icon: LucideIcon }> = [
  { value: 'all', label: 'All Changes', Icon: Layers },
  { value: 'buff', label: 'Buffs Only', Icon: ArrowUp },
  { value: 'nerf', label: 'Nerfs Only', Icon: ArrowDown },
  { value: 'mixed', label: 'Mixed', Icon: ArrowLeftRight },
  { value: 'neutral', label: 'Neutral / QoL', Icon: Circle },
  { value: 'bugfix', label: 'Bug Fixes', Icon: Wrench },
  { value: 'review', label: 'Needs Review', Icon: CircleHelp },
];

const SECONDARY: Array<keyof PatchFilters> = ['role', 'patch', 'season', 'queue', 'format', 'kind', 'stat', 'sort'];

export function FilterBar({ filters, index, onChange, onReset }: { filters: PatchFilters; index: PatchIndex; onChange: (partial: Partial<PatchFilters>) => void; onReset: () => void }) {
  const secondaryActive = SECONDARY.filter((key) => {
    const defaults: Partial<PatchFilters> = { role: 'all', patch: 'latest', season: 'all', queue: 'all', format: 'all', kind: 'all', stat: 'all', sort: 'newest' };
    return filters[key] !== defaults[key];
  }).length;
  const [open, setOpen] = useState(secondaryActive > 0);
  const panelId = useId();
  const total = activeFilterCount(filters);

  const seasonLabel = index.seasons.find((season) => `${season.year}-s${season.number}` === filters.season);
  const patches = filters.season === 'all' ? index.patches : index.patches.filter((patch) => patch.season?.id === filters.season);

  return (
    <section className="filter-bar" aria-label="Filter changes">
      <div className="filter-bar__row">
        <div className="filter-bar__search">
          <label className="search-field">
            <span className="sr-only">Search by hero name</span>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={filters.hero} placeholder="Hero name" autoComplete="off" onChange={(event) => onChange({ hero: event.target.value })} />
          </label>
          <label className="search-field">
            <span className="sr-only">Search by ability, perk or stat</span>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={filters.ability} placeholder="Ability, perk or stat" autoComplete="off" onChange={(event) => onChange({ ability: event.target.value })} />
          </label>
        </div>

        <div className="filter-chips" role="group" aria-label="Balance result">
          {BALANCE_OPTIONS.map(({ value, label, Icon }) => (
            <button key={value} type="button" className={cn('filter-chip', filters.balance === value && 'is-active')} data-direction={value} aria-pressed={filters.balance === value} onClick={() => onChange({ balance: value })}>
              <Icon size={14} strokeWidth={2.6} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="filter-bar__actions">
          <button type="button" className="filter-bar__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
            <SlidersHorizontal size={15} aria-hidden="true" />
            More filters
            {secondaryActive > 0 && <span className="filter-bar__count">{secondaryActive}</span>}
          </button>
          <button type="button" className="filter-bar__reset" disabled={total === 0} onClick={onReset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset filters
          </button>
        </div>
      </div>

      <div className="filter-bar__more" id={panelId} hidden={!open}>
        <div className="filter-chips" role="group" aria-label="Role">
          <button type="button" className={cn('filter-chip', filters.role === 'all' && 'is-active')} aria-pressed={filters.role === 'all'} onClick={() => onChange({ role: 'all' })}>All Roles</button>
          {ROLES.map((role: Role) => (
            <button key={role} type="button" className={cn('filter-chip', filters.role === role && 'is-active')} aria-pressed={filters.role === role} onClick={() => onChange({ role })}>
              <RoleIcon role={role} size={14} />
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>

        <div className="filter-bar__selects">
          <SelectField label="Patch" value={filters.patch} onChange={(patch) => onChange({ patch })}>
            <option value="latest">{seasonLabel ? `All in Season ${seasonLabel.number}` : 'Latest patch'}</option>
            <option value="all">All patches</option>
            {patches.map((patch) => <option key={patch.id} value={patch.id}>{formatPatchDate(patch.date, 'short')} · {typeLabel(patch.type)}</option>)}
          </SelectField>
          <SelectField label="Season" value={filters.season} onChange={(season) => onChange({ season, patch: 'latest' })}>
            <option value="all">All seasons</option>
            {[...index.seasons].reverse().map((season) => <option key={`${season.year}-${season.number}`} value={`${season.year}-s${season.number}`}>Season {season.number} ({season.year})</option>)}
          </SelectField>
          <SelectField label="Format" value={filters.format} onChange={(format) => onChange({ format: format as FormatFilter })}>
            <option value="all">All formats</option>
            <option value="5v5">5v5</option>
            <option value="6v6">6v6-specific</option>
            <option value="stadium">Stadium</option>
            <option value="limited">Limited-time modes</option>
          </SelectField>
          <SelectField label="Queue" value={filters.queue} onChange={(queue) => onChange({ queue: queue as QueueFilter })}>
            <option value="all">All queues</option>
            <option value="competitive">Competitive</option>
            <option value="quickplay">Quick Play</option>
          </SelectField>
          <SelectField label="Change type" value={filters.kind} onChange={(kind) => onChange({ kind: kind as KindFilter })}>
            <option value="all">All types</option>
            <option value="weapon">Weapons</option>
            <option value="ability">Abilities</option>
            <option value="ultimate">Ultimates</option>
            <option value="perk">All perks</option>
            <option value="perk-minor">Minor Perks</option>
            <option value="perk-major">Major Perks</option>
            <option value="base">Base stats</option>
            <option value="power">Stadium Powers</option>
            <option value="item">Stadium Items</option>
          </SelectField>
          <SelectField label="Stat" value={filters.stat} onChange={(stat) => onChange({ stat: stat as StatFilter })}>
            <option value="all">All stats</option>
            <option value="health">Health</option>
            <option value="armor">Armor</option>
            <option value="damage">Damage</option>
            <option value="healing">Healing</option>
            <option value="cooldown">Cooldowns</option>
            <option value="mobility">Mobility</option>
          </SelectField>
          <SelectField label="Sort by" value={filters.sort} onChange={(sort) => onChange({ sort: sort as SortKey })}>
            <option value="newest">Newest patch</option>
            <option value="name">Hero name</option>
            <option value="buffs">Most buffs</option>
            <option value="nerfs">Most nerfs</option>
          </SelectField>
        </div>
      </div>
    </section>
  );
}
