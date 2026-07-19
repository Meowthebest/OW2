import Overwatch2RandomHeroPickerMultiRoleLock from "./components/Overwatch2RandomHeroPickerMultiRoleLock";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge" aria-hidden="true">
            <span />
          </span>
          <div>
            <span className="brand-kicker">Overwatch utility</span>
            <h1>Hero Selector</h1>
          </div>
        </div>
        <div className="topbar-status" aria-label="Save status">
          <span className="status-dot" aria-hidden="true" />
          Saved locally
        </div>
      </header>
      <main className="app-main">
        <Overwatch2RandomHeroPickerMultiRoleLock />
      </main>
    </div>
  );
}
