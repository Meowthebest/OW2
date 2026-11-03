import { useState } from 'react';
import { Layers } from 'lucide-react';
import { RoleIcon } from '../../../components/icons';
import { Panel, Segmented } from '../../../components/controls';
import { RemoteImage } from '../../../components/media';
import type { CompetitiveRank, Platform, PlatformRanks, PlayerSummary } from '../api/types';
import { DIVISION_LABEL } from '../stats';

function UnrankedGlyph() {
  return (
    <svg className="rank-row__unranked" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M20 3 35 11.5v17L20 37 5 28.5v-17z" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  );
}

function RankRow({ label, icon, rank }: { label: string; icon: React.ReactNode; rank?: CompetitiveRank | null }) {
  const division = rank ? DIVISION_LABEL[rank.division] ?? rank.division : null;
  return (
    <li className="rank-row">
      <span className="rank-row__role">{icon}{label}</span>
      {rank ? (
        <span className="rank-row__rank">
          <span className="rank-row__icons">
            <RemoteImage src={rank.rank_icon} className="rank-row__icon" fallback={<UnrankedGlyph />} />
            <RemoteImage src={rank.tier_icon} className="rank-row__tier" fallback={null} />
          </span>
          <strong>{division} {rank.tier}</strong>
        </span>
      ) : (
        <span className="rank-row__rank is-unranked"><UnrankedGlyph /><span>Unranked</span></span>
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

  return (
    <Panel
      className="ranks"
      title="Competitive ranks"
      actions={
        pc && console_ ? (
          <Segmented<Platform>
            label="Rank platform"
            value={active}
            onChange={setPlatform}
            options={[{ value: 'pc', label: 'PC' }, { value: 'console', label: 'Console' }]}
          />
        ) : undefined
      }
    >
      <p className="ranks__season">
        {ranks?.season ? <>Season {ranks.season} <span>· last season played</span></> : <span>No ranked season on this profile</span>}
      </p>
      <ul className="ranks__list">
        <RankRow label="Tank" icon={<RoleIcon role="tank" size={14} />} rank={ranks?.tank} />
        <RankRow label="Damage" icon={<RoleIcon role="damage" size={14} />} rank={ranks?.damage} />
        <RankRow label="Support" icon={<RoleIcon role="support" size={14} />} rank={ranks?.support} />
        <RankRow label="Open Queue" icon={<Layers size={14} aria-hidden="true" />} rank={ranks?.open} />
      </ul>
    </Panel>
  );
}
