import { useState } from 'react';
import { Layers } from 'lucide-react';
import { RoleIcon } from '../../../components/icons';
import { Segmented } from '../../../components/controls';
import { RemoteImage } from '../../../components/media';
import { cn } from '../../../lib/format';
import type { CompetitiveRank, Platform, PlatformRanks, PlayerSummary } from '../api/types';
import { DIVISION_LABEL, seasonLabel } from '../stats';
import { Dash } from './states';

function RankRow({ label, icon, role, rank }: { label: string; icon: React.ReactNode; role?: string; rank?: CompetitiveRank | null }) {
  const division = rank ? DIVISION_LABEL[rank.division] ?? rank.division : null;
  return (
    <li className={cn('rank-row', !rank && 'is-unranked')} data-role={role}>
      <span className="rank-row__role">{icon}{label}</span>
      {rank ? (
        <span className="rank-row__rank">
          <span>{division} <i>{rank.tier}</i></span>
          <RemoteImage src={rank.rank_icon} className="rank-row__icon" fallback={null} />
        </span>
      ) : (
        <span className="rank-row__rank">Unranked</span>
      )}
    </li>
  );
}

export function RanksPanel({ summary }: { summary?: PlayerSummary }) {
  const pc = summary?.competitive?.pc;
  const console_ = summary?.competitive?.console;
  const [platform, setPlatform] = useState<Platform>('pc');
  const active: Platform = pc && console_ ? platform : console_ ? 'console' : 'pc';
  const ranks: PlatformRanks | null | undefined = active === 'pc' ? pc : console_;
  const season = seasonLabel(ranks?.season);

  return (
    <Dash
      className="ranks"
      label={`Competitive · ${active === 'pc' ? 'PC' : 'Console'}`}
      actions={season ? <span className="ranks__season" title="Last competitive season this player played">{season}</span> : undefined}
    >
      {pc && console_ && (
        <Segmented<Platform>
          label="Rank platform"
          className="segmented--block ranks__platform"
          value={active}
          onChange={setPlatform}
          options={[{ value: 'pc', label: 'PC' }, { value: 'console', label: 'Console' }]}
        />
      )}
      <ul className="ranks__list">
        <RankRow label="Tank" role="tank" icon={<RoleIcon role="tank" size={14} />} rank={ranks?.tank} />
        <RankRow label="Damage" role="damage" icon={<RoleIcon role="damage" size={14} />} rank={ranks?.damage} />
        <RankRow label="Support" role="support" icon={<RoleIcon role="support" size={14} />} rank={ranks?.support} />
        <RankRow label="Open Queue" icon={<Layers size={14} aria-hidden="true" />} rank={ranks?.open} />
      </ul>
    </Dash>
  );
}
