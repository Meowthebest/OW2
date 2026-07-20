import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  Download,
  Flame,
  Moon,
  MoreHorizontal,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Swords,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";

export type ThemeMode = "dark" | "light";
export type RoleFilterValue = "All" | "Tank" | "Damage" | "Support";
export type StatusFilterValue = "all" | "in-progress" | "completed" | "not-started";

type AppHeaderProps = {
  theme: ThemeMode;
  selectedCount: number;
  playerCount: number;
  onThemeChange: (theme: ThemeMode) => void;
  onOpenSettings: () => void;
  onResetSession: () => void;
};

export function AppHeader({
  theme,
  selectedCount,
  playerCount,
  onThemeChange,
  onOpenSettings,
  onResetSession,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <a className="app-brand" href="#top" aria-label="Hero Selector home">
          <span className="ow-mark" aria-hidden="true"><span /></span>
          <span>
            <strong>Hero Selector</strong>
            <small>Overwatch 2 companion</small>
          </span>
        </a>

        <div className="session-presence" aria-label="Current session status">
          <span className={`presence-dot ${selectedCount > 0 ? "is-live" : ""}`} aria-hidden="true" />
          <span>{selectedCount > 0 ? `${selectedCount}/${playerCount} heroes ready` : "Session ready"}</span>
        </div>

        <nav className="header-actions" aria-label="Application controls">
          <span className="saved-indicator"><ShieldCheck size={15} /> Saved locally</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Open session settings" title="Session settings">
            <Settings2 size={18} />
          </button>
          <details className="menu">
            <summary className="icon-button" aria-label="More session actions"><MoreHorizontal size={19} /></summary>
            <div className="menu-popover menu-popover--right">
              <button type="button" className="menu-item menu-item--danger" onClick={onResetSession}>
                <RotateCcw size={16} /> Reset saved session
              </button>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}

type SessionSummaryProps = {
  players: number;
  selected: number;
  completed: number;
  wins: number;
  losses: number;
  winRate: number;
  streak: number;
};

export function SessionSummary({ players, selected, completed, wins, losses, winRate, streak }: SessionSummaryProps) {
  const items = [
    { label: "Players", value: players, detail: "active", icon: Users },
    { label: "Selected", value: selected, detail: "heroes", icon: Sparkles },
    { label: "Completed", value: completed, detail: "total", icon: CheckCircle2 },
    { label: "Record", value: `${wins}-${losses}`, detail: `${winRate}% win rate`, icon: Trophy },
    { label: "Streak", value: streak, detail: streak === 1 ? "completion" : "completions", icon: Flame },
  ];

  return (
    <section className="session-summary" aria-label="Session summary">
      {items.map(({ label, value, detail, icon: Icon }) => (
        <div className="summary-item" key={label}>
          <span className="summary-icon" aria-hidden="true"><Icon size={18} /></span>
          <span className="summary-copy">
            <small>{label}</small>
            <span><strong>{value}</strong> <em>{detail}</em></span>
          </span>
        </div>
      ))}
    </section>
  );
}

type LineupToolbarProps = {
  rolling: boolean;
  anyHeroPicked: boolean;
  search: string;
  role: RoleFilterValue;
  status: StatusFilterValue;
  onRoll: () => void;
  onBrowse: () => void;
  onSearch: (value: string) => void;
  onRole: (value: RoleFilterValue) => void;
  onStatus: (value: StatusFilterValue) => void;
  onCompleteAll: () => void;
  onCopy: () => void;
  onClear: () => void;
};

const ROLES: RoleFilterValue[] = ["All", "Tank", "Damage", "Support"];

export function LineupToolbar({
  rolling,
  anyHeroPicked,
  search,
  role,
  status,
  onRoll,
  onBrowse,
  onSearch,
  onRole,
  onStatus,
  onCompleteAll,
  onCopy,
  onClear,
}: LineupToolbarProps) {
  return (
    <section className="lineup-toolbar" aria-labelledby="lineup-controls-title">
      <div className="toolbar-intro">
        <div>
          <span className="section-kicker">Live selector</span>
          <h1 id="lineup-controls-title">Build your lineup</h1>
          <p>Set each player’s role, then roll a balanced squad in one click.</p>
        </div>
        <div className="toolbar-primary-actions">
          <button type="button" className={`button button--primary ${rolling ? "is-loading" : ""}`} onClick={onRoll} disabled={rolling}>
            <Swords size={19} /> {rolling ? "Rolling lineup…" : "Roll lineup"}
          </button>
          <button type="button" className="button button--secondary" onClick={onBrowse}>
            <Sparkles size={18} /> Browse hero pool
          </button>
        </div>
      </div>

      <div className="toolbar-filters">
        <label className="search-control">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search players</span>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search players…" />
          {search && <button type="button" onClick={() => onSearch("")} aria-label="Clear player search"><X size={16} /></button>}
        </label>

        <div className="segmented-control" role="group" aria-label="Filter lineup by role">
          {ROLES.map((item) => (
            <button key={item} type="button" className={role === item ? "is-active" : ""} onClick={() => onRole(item)} aria-pressed={role === item}>
              {item}
            </button>
          ))}
        </div>

        <label className="select-control">
          <span className="sr-only">Filter by completion status</span>
          <select value={status} onChange={(event) => onStatus(event.target.value as StatusFilterValue)}>
            <option value="all">All statuses</option>
            <option value="in-progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="not-started">Not started</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>

        <button type="button" className="button button--quiet" onClick={onCompleteAll} disabled={!anyHeroPicked}>
          <CheckCircle2 size={17} /> Complete all
        </button>
        <details className="menu toolbar-overflow">
          <summary className="icon-button" aria-label="More lineup actions"><MoreHorizontal size={19} /></summary>
          <div className="menu-popover menu-popover--right">
            <button type="button" className="menu-item" onClick={onCopy} disabled={!anyHeroPicked}><Copy size={16} /> Copy lineup</button>
            <button type="button" className="menu-item menu-item--danger" onClick={onClear} disabled={!anyHeroPicked}><RotateCcw size={16} /> Clear lineup</button>
          </div>
        </details>
      </div>
    </section>
  );
}

type DataPanelProps = {
  onExportPng: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onCopy: () => void;
  onReset: () => void;
};

export function DataExportPanel({ onExportPng, onExportJson, onImportJson, onCopy, onReset }: DataPanelProps) {
  return (
    <section className="side-panel data-panel">
      <header className="side-panel__header">
        <span className="side-panel__icon"><Database size={17} /></span>
        <div><h2>Data & export</h2><p>Portable session tools</p></div>
      </header>
      <div className="data-action-grid">
        <button type="button" onClick={onExportPng}><Download size={17} /><span>Snapshot<small>PNG image</small></span></button>
        <button type="button" onClick={onExportJson}><Download size={17} /><span>Export<small>JSON backup</small></span></button>
        <button type="button" onClick={onImportJson}><Upload size={17} /><span>Import<small>Restore JSON</small></span></button>
        <button type="button" onClick={onCopy}><Copy size={17} /><span>Copy<small>Lineup text</small></span></button>
      </div>
      <button type="button" className="text-danger-action" onClick={onReset}><RotateCcw size={15} /> Reset all saved data</button>
    </section>
  );
}

type ToastStackProps = { notice: string; error: string };

export function ToastStack({ notice, error }: ToastStackProps) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {notice && <div className="toast toast--success" role="status"><CheckCircle2 size={18} />{notice}</div>}
      {error && <div className="toast toast--error" role="alert"><X size={18} />{error}</div>}
    </div>
  );
}

type MobileActionBarProps = {
  rolling: boolean;
  anyHeroPicked: boolean;
  onRoll: () => void;
  onCompleteAll: () => void;
  onReroll: () => void;
};

export function MobileActionBar({ rolling, anyHeroPicked, onRoll, onCompleteAll, onReroll }: MobileActionBarProps) {
  return (
    <nav className="mobile-action-bar" aria-label="Quick lineup actions">
      <button type="button" onClick={onReroll} disabled={!anyHeroPicked || rolling}><RotateCcw size={19} /><span>Reroll</span></button>
      <button type="button" className="mobile-action-bar__primary" onClick={onRoll} disabled={rolling}><Swords size={21} /><span>{rolling ? "Rolling…" : "Roll"}</span></button>
      <button type="button" onClick={onCompleteAll} disabled={!anyHeroPicked}><CheckCircle2 size={19} /><span>Complete</span></button>
    </nav>
  );
}
