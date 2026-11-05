import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Cloud, Download, HardDrive, Heart, LogIn, LogOut, RefreshCw, Star, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { Panel, StateBlock } from '../../../components/controls';
import { useToast } from '../../../components/Toast';
import { cn, formatInt, formatRelative } from '../../../lib/format';
import { useAsync } from '../../patches/data';
import { accountsEnabled, completeSignIn, deleteAccount, signInUrl, signOut, syncNow, useAccount } from '../account';
import { idsOf, isSet, personalStats, type EntryKind } from '../core/collection';
import type { CatalogRow } from '../core/types';
import { loadDrops } from '../data';
import { DataState, Note, PageHeader, Pagination, usePageTitle } from '../components/bits';
import { CosmeticCard } from '../components/cards';
import { Gallery } from '../components/Gallery';
import { heroLabel, rarityLabel, typeLabel } from '../labels';
import { clearCollection, exportCollection, importCollection, storageWorks, useCollection } from '../useCollection';
import { CatalogueCredits, useGalleryContext } from './CosmeticsPage';

type Tab = 'owned' | 'wishlist' | 'favorites' | 'alerts';

const TABS: Array<{ id: Tab; kind: EntryKind; label: string; Icon: typeof Star }> = [
  { id: 'owned', kind: 'owned', label: 'Owned', Icon: CheckCircle2 },
  { id: 'wishlist', kind: 'wishlist', label: 'Wishlist', Icon: Star },
  { id: 'favorites', kind: 'favorite', label: 'Favorites', Icon: Heart },
  { id: 'alerts', kind: 'notify', label: 'Alerts', Icon: BellRing },
];

const parseTab = (query: string): Tab => {
  const value = new URLSearchParams(query).get('tab');
  return value === 'wishlist' || value === 'favorites' || value === 'alerts' ? value : 'owned';
};

function AccountPanel() {
  const account = useAccount();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  if (account.status === 'off') {
    return (
      <div className="cx-account" data-state="local">
        <HardDrive size={18} aria-hidden="true" />
        <p><strong>Saved in this browser only.</strong> Clearing site data or using another device won't bring it along, so export a copy if it matters to you.</p>
      </div>
    );
  }
  if (account.status === 'signed-out') {
    return (
      <div className="cx-account" data-state="local">
        <HardDrive size={18} aria-hidden="true" />
        <p><strong>Saved in this browser only.</strong> Sign in to keep your tracking on your account and use it on other devices. Only your Discord name and picture are stored with it.</p>
        <a className="btn-plain" href={signInUrl()}><LogIn size={14} aria-hidden="true" /> Sign in with Discord</a>
        {account.problem && <p className="cx-account__problem" role="alert"><TriangleAlert size={14} aria-hidden="true" /> {account.problem}</p>}
      </div>
    );
  }
  return (
    <div className="cx-account" data-state="cloud">
      <Cloud size={18} aria-hidden="true" />
      <p>
        <strong>Signed in as {account.user?.name}.</strong> Your tracking is saved to your account.
        {account.lastSync && <span className="cx-muted"> Last synced {formatRelative(account.lastSync)}.</span>}
      </p>
      <div className="cx-account__actions">
        <button type="button" className="btn-plain" disabled={account.status === 'working'} onClick={() => void syncNow()}><RefreshCw size={14} aria-hidden="true" /> Sync now</button>
        <button type="button" className="btn-plain" onClick={() => void signOut()}><LogOut size={14} aria-hidden="true" /> Sign out</button>
        {confirming ? (
          <>
            <button
              type="button"
              className="btn-plain cx-danger"
              onClick={() =>
                void deleteAccount().then(
                  () => toast({ message: 'Your account and its stored tracking were deleted.' }),
                  (error: Error) => toast({ message: error.message, tone: 'warn' }),
                )
              }
            >
              Yes, delete my account
            </button>
            <button type="button" className="btn-plain" onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <button type="button" className="btn-plain" onClick={() => setConfirming(true)}><Trash2 size={14} aria-hidden="true" /> Delete account</button>
        )}
      </div>
      {account.problem && <p className="cx-account__problem" role="alert"><TriangleAlert size={14} aria-hidden="true" /> {account.problem}</p>}
    </div>
  );
}

function DataTools() {
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);

  const save = () => {
    const blob = new Blob([exportCollection()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ow2-collection-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) {
      toast({ message: 'That file is too large to be a collection export.', tone: 'warn' });
      return;
    }
    try {
      const changed = importCollection(await file.text());
      toast({ message: changed === 0 ? 'Nothing new in that file.' : `Imported ${formatInt(changed)} ${changed === 1 ? 'change' : 'changes'}.` });
    } catch (error) {
      toast({ message: (error as Error).message, tone: 'warn' });
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="cx-data-tools">
      <button type="button" className="cx-tool" onClick={save}><Download size={14} aria-hidden="true" /> Export</button>
      <button type="button" className="cx-tool" onClick={() => fileInput.current?.click()}><Upload size={14} aria-hidden="true" /> Import</button>
      <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Choose a collection file to import" onChange={(event) => void load(event.target.files?.[0])} />
      {confirmClear ? (
        <>
          <button type="button" className="cx-tool cx-danger" onClick={() => { clearCollection(); setConfirmClear(false); toast({ message: 'Your marks were cleared.' }); }}>Yes, clear everything</button>
          <button type="button" className="cx-tool" onClick={() => setConfirmClear(false)}>Keep them</button>
        </>
      ) : (
        <button type="button" className="cx-tool" onClick={() => setConfirmClear(true)}><Trash2 size={14} aria-hidden="true" /> Clear all</button>
      )}
    </div>
  );
}

const ALERT_PAGE = 24;

function AlertsTab({ rows, seasonLabels }: { rows: CatalogRow[]; seasonLabels: Map<string, string> }) {
  const entries = useCollection();
  const drops = useAsync(loadDrops, 'drops');
  const [page, setPage] = useState(1);
  const ids = new Set(idsOf(entries, 'notify'));
  const watched = rows.filter((row) => ids.has(row.id));
  const inShop = watched.filter((row) => row.availability === 'in-shop');
  const waiting = watched.filter((row) => row.availability !== 'in-shop');
  const now = Date.now();
  const campaigns = (drops.data ?? []).filter((campaign) => ids.has(`drop-${campaign.id}`) && Date.parse(campaign.end) > now);
  const pages = Math.max(1, Math.ceil(waiting.length / ALERT_PAGE));
  const shown = waiting.slice((page - 1) * ALERT_PAGE, page * ALERT_PAGE);
  return (
    <div className="cx-stats">
      <Note>Alerts show here and as a message when you visit. There are no emails or push notifications.</Note>
      {campaigns.length > 0 && (
        <Panel title="Twitch campaigns you're watching" className="cx-stat-panel">
          <ul className="cx-plain-list">
            {campaigns.map((campaign) => <li key={campaign.id}><a className="text-link" href={`#/hub/twitch-drops?open=${campaign.id}`}>{campaign.name}</a></li>)}
          </ul>
        </Panel>
      )}
      {inShop.length > 0 && (
        <section className="cx-related">
          <header className="cx-related__head"><h2 className="cx-section-title">In the shop now</h2></header>
          <div className="cx-grid">{inShop.map((row) => <CosmeticCard key={row.id} row={row} seasonLabel={row.season ? seasonLabels.get(row.season) : null} />)}</div>
        </section>
      )}
      {waiting.length > 0 && (
        <section className="cx-related">
          <header className="cx-related__head"><h2 className="cx-section-title">Waiting for the shop</h2></header>
          <div className="cx-grid">{shown.map((row) => <CosmeticCard key={row.id} row={row} seasonLabel={row.season ? seasonLabels.get(row.season) : null} />)}</div>
          <Pagination page={page} pages={pages} onPage={setPage} />
        </section>
      )}
      {watched.length === 0 && campaigns.length === 0 && (
        <StateBlock icon={<BellRing size={24} />} title="No alerts set" actions={<a className="btn-plain" href="#/cosmetics">Browse cosmetics</a>}>
          Open a cosmetic and choose "Alert me when it's in the shop".
        </StateBlock>
      )}
    </div>
  );
}

export function CollectionPage({ query, routeKey }: { query: string; routeKey: unknown }) {
  usePageTitle('My Collection');
  const data = useGalleryContext();
  const entries = useCollection();
  const tab = parseTab(query);
  const account = useAccount();
  const handled = useRef(false);

  // Coming back from Discord: finish the sign-in, then take the one-time code out of the address bar.
  useEffect(() => {
    if (handled.current) return;
    const params = new URLSearchParams(query);
    const code = params.get('login');
    const failed = params.get('login_error');
    if (!code && !failed) return;
    handled.current = true;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/collection`);
    if (code && accountsEnabled()) void completeSignIn(code);
  }, [query]);

  useEffect(() => {
    if (account.status === 'signed-in' && account.lastSync === null) void syncNow();
  }, [account.status, account.lastSync]);

  const rows = data.data?.rows;
  const stats = useMemo(() => (rows ? personalStats(rows, entries, { hero: heroLabel, rarity: rarityLabel, type: typeLabel }) : null), [rows, entries]);
  const current = TABS.find((item) => item.id === tab)!;
  const ownedOnly = useMemo(() => {
    if (!rows || tab === 'alerts') return [];
    return rows.filter((row) => isSet(entries, current.kind, row.id));
  }, [rows, entries, current.kind, tab]);
  const counts: Record<Tab, number> = {
    owned: idsOf(entries, 'owned').length,
    wishlist: idsOf(entries, 'wishlist').length,
    favorites: idsOf(entries, 'favorite').length,
    alerts: idsOf(entries, 'notify').length,
  };

  return (
    <div className="page cx-page">
      <PageHeader eyebrow="Yours" title="My Collection" intro="Everything here is marked by you. This site can't read your game account, so it doesn't know what you really own." actions={<DataTools />} />
      <AccountPanel />
      {!storageWorks() && <Note>This browser isn't letting the site save anything, so your marks will be lost when you close this tab.</Note>}

      {stats && (
        <div className="cx-numbers">
          <div className="cx-number"><span className="cx-number__label">Marked as owned</span><span className="cx-number__value">{formatInt(stats.owned)}</span></div>
          <div className="cx-number"><span className="cx-number__label">Of known cosmetics</span><span className="cx-number__value">{stats.completion}%</span><span className="cx-number__note">{formatInt(stats.total)} known</span></div>
          <div className="cx-number"><span className="cx-number__label">Wishlist</span><span className="cx-number__value">{formatInt(stats.wishlist)}</span></div>
          <div className="cx-number"><span className="cx-number__label">Favorites</span><span className="cx-number__value">{formatInt(stats.favorites)}</span></div>
        </div>
      )}
      {stats && stats.unknown > 0 && <Note>{formatInt(stats.unknown)} of your marks point to cosmetics no longer in the catalogue. They're kept in case those items return.</Note>}

      <nav className="cx-tabs" aria-label="Collection sections">
        {TABS.map(({ id, label, Icon }) => (
          <a key={id} className={cn('cx-tabs__item', tab === id && 'is-active')} href={id === 'owned' ? '#/collection' : `#/collection?tab=${id}`} aria-current={tab === id ? 'page' : undefined}>
            <Icon size={15} aria-hidden="true" /> {label} <span className="cx-filter-chip__count">{formatInt(counts[id])}</span>
          </a>
        ))}
      </nav>

      {data.data ? (
        tab === 'alerts' ? (
          <AlertsTab rows={data.data.rows} seasonLabels={data.data.seasonLabels} />
        ) : ownedOnly.length === 0 ? (
          <StateBlock icon={<current.Icon size={24} />} title={`Nothing in ${current.label} yet`} actions={<a className="btn-plain" href="#/cosmetics">Browse cosmetics</a>}>
            Use the buttons on any cosmetic to add it here.
          </StateBlock>
        ) : (
          <Gallery key={tab} context={{ ...data.data, rows: ownedOnly }} path="#/collection" query={query} routeKey={routeKey} keepQuery={tab === 'owned' ? '' : `tab=${tab}`} />
        )
      ) : (
        <DataState status={data.status} error={data.error} retry={data.retry} what="your collection" />
      )}
      <CatalogueCredits />
    </div>
  );
}
