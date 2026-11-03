import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Segmented, SelectField } from '../../components/controls';
import { formatRelative } from '../../lib/format';
import { careerHref, navigate, type CareerTab, type Route } from '../../lib/router';
import { careerStore } from './api';
import type { CareerRequest } from './api/requests';
import type { GameMode, ModeFilter, PlatformFilter } from './api/types';
import { OverviewTab } from './components/OverviewTab';
import { PlayerAvatar, PlayerSearch } from './components/PlayerSearch';
import { DataStatus, ProfileHeader } from './components/ProfileHeader';
import { StatisticsTab } from './components/StatisticsTab';
import { ErrorBlock, NotFoundBlock, PrivateProfileBlock, Skeleton } from './components/states';
import { forgetRecentPlayers, isEmptyStats, readRecentPlayers, useCareerProfile } from './useCareer';

const TABS: Array<{ id: CareerTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'statistics', label: 'Statistics' },
];

function CareerLanding() {
  const [recent, setRecent] = useState(readRecentPlayers);
  return (
    <div className="career-landing">
      <header className="career-landing__hero">
        <span className="eyebrow">Career profiles</span>
        <h1 className="career-landing__title">Look up any public career</h1>
        <p>Find a player by BattleTag, exact name or profile link, then dig through their heroes, roles, ranks and win rates.</p>
        <PlayerSearch autoFocus={false} />
      </header>

      {recent.length > 0 && (
        <Panel
          title="Recently viewed"
          actions={
            <button
              type="button"
              className="text-button"
              onClick={() => {
                forgetRecentPlayers();
                setRecent([]);
              }}
            >
              Clear
            </button>
          }
        >
          <ul className="recent-players">
            {recent.map((player) => (
              <li key={player.id}>
                <a href={careerHref(player.id)} className="recent-player">
                  <PlayerAvatar src={player.avatar} name={player.name} />
                  <span>
                    <strong>{player.name}</strong>
                    <small>{player.title ? `${player.title} · ` : ''}viewed {formatRelative(player.seenAt)}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="career-landing__notes">
        <Panel title="How search works">
          <ul className="note-list">
            <li>BattleTags look like <code>Name#1234</code>. Names and tags are case-sensitive.</li>
            <li>Name search only returns exact matches, so several players can share a name.</li>
            <li>Private profiles never appear in search, and their stats stay hidden.</li>
          </ul>
        </Panel>
        <Panel title="Where the data comes from">
          <ul className="note-list">
            <li>Stats come from public Blizzard profiles through the unofficial <a className="text-link" href="https://overfast-api.tekrop.fr/" target="_blank" rel="noreferrer">OverFast API</a>.</li>
            <li>They are cached, not live. Every profile shows when its data was last updated.</li>
            <li>Your browser keeps a copy for an hour, then shows it while fetching a newer one.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function PlayerProfile({ playerId, tab, hero }: { playerId: string; tab: CareerTab; hero?: string }) {
  const [mode, setMode] = useState<ModeFilter>('all');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [detailMode, setDetailMode] = useState<GameMode>('quickplay');
  const profile = useCareerProfile(playerId, platform);
  const { summary, stats, requests } = profile;
  const tabRefs = useRef<Partial<Record<CareerTab, HTMLButtonElement | null>>>({});

  const notFound = summary.status === 'error' && summary.error?.kind === 'not-found';
  const summaryFailed = summary.status === 'error' && !notFound && stats.all.status === 'error';
  const hasNoStats = platform === 'all' && stats.all.data !== undefined && isEmptyStats(stats.all.data);

  const openHero = useCallback((key?: string) => navigate(careerHref(playerId, 'statistics', key), { replace: tab === 'statistics' }), [playerId, tab]);

  const refreshRequests = useMemo<CareerRequest[]>(() => {
    const base: CareerRequest[] = [requests.summary, requests.all, requests.quickplay, requests.competitive];
    if (tab === 'statistics') base.push({ endpoint: 'career', playerId, mode: mode === 'all' ? detailMode : mode, platform });
    return base;
  }, [detailMode, mode, platform, playerId, requests, tab]);

  useEffect(() => {
    if (summary.data?.username) document.title = `${summary.data.username} career | OW2 Hero Selector`;
    return () => {
      document.title = 'OW2 Hero Selector: Random Hero Picker & Career Stats';
    };
  }, [summary.data?.username]);

  const onTabKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next: CareerTab = tab === 'overview' ? 'statistics' : 'overview';
    navigate(careerHref(playerId, next));
    tabRefs.current[next]?.focus();
  };

  if (notFound) {
    return (
      <div className="career-profile">
        <ProfileHeader playerId={playerId} />
        <NotFoundBlock id={playerId} />
      </div>
    );
  }

  return (
    <div className="career-profile">
      <ProfileHeader playerId={playerId} summary={summary.data}>
        <DataStatus profile={profile} playerId={playerId} requests={refreshRequests} />
      </ProfileHeader>

      {summaryFailed && summary.error ? (
        <ErrorBlock error={summary.error} onRetry={() => refreshRequests.forEach((request) => void careerStore.retry(request))} />
      ) : profile.initialLoad ? (
        <Skeleton lines={8} className="skeleton--page" />
      ) : hasNoStats ? (
        <PrivateProfileBlock name={summary.data?.username} />
      ) : (
        <>
          <div className="career-bar">
            <div className="tabs" role="tablist" aria-label="Career sections" onKeyDown={onTabKey}>
              {TABS.map((item) => (
                <button
                  key={item.id}
                  ref={(node) => {
                    tabRefs.current[item.id] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`career-tab-${item.id}`}
                  aria-selected={tab === item.id}
                  aria-controls="career-panel"
                  tabIndex={tab === item.id ? 0 : -1}
                  className="tabs__tab"
                  onClick={() => navigate(careerHref(playerId, item.id, item.id === 'statistics' ? hero : undefined))}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="career-bar__filters">
              <Segmented<ModeFilter>
                label="Game mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'all', label: 'All modes' },
                  { value: 'quickplay', label: 'Quick Play' },
                  { value: 'competitive', label: 'Competitive' },
                ]}
              />
              <SelectField label="Platform" hideLabel value={platform} onChange={(value) => setPlatform(value as PlatformFilter)}>
                <option value="all">All platforms</option>
                <option value="pc">PC</option>
                <option value="console">Console</option>
              </SelectField>
            </div>
          </div>

          <div id="career-panel" role="tabpanel" aria-labelledby={`career-tab-${tab}`}>
            {tab === 'overview' ? (
              <OverviewTab profile={profile} mode={mode} onOpenHero={openHero} />
            ) : (
              <StatisticsTab
                profile={profile}
                playerId={playerId}
                mode={mode}
                platform={platform}
                detailMode={detailMode}
                onDetailMode={setDetailMode}
                hero={hero}
                onHero={openHero}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function CareerPage({ route }: { route: Extract<Route, { view: 'career' }> }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.playerId]);

  return (
    <div className="career page">
      {route.playerId ? (
        <>
          <PlayerSearch compact />
          <PlayerProfile key={route.playerId} playerId={route.playerId} tab={route.tab} hero={route.hero} />
        </>
      ) : (
        <CareerLanding />
      )}
    </div>
  );
}
