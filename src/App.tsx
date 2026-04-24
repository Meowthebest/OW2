import Overwatch2RandomHeroPickerMultiRoleLock from "./components/Overwatch2RandomHeroPickerMultiRoleLock";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge" />
          <div>
            <h1>OW2 Random Hero Picker</h1>
            <p>Multiplayer - Role Lock - Local Save</p>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Overwatch2RandomHeroPickerMultiRoleLock />
      </main>
    </div>
  );
}
