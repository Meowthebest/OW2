import { useEffect, useRef, useState } from 'react';
import { Download, Menu, Moon, RotateCcw, Settings2, ShieldCheck, Sparkles, Sun, Upload } from 'lucide-react';
import NormalMode from './components/NormalMode';
import NuzlockeMode from './components/NuzlockeMode';
import { ConfirmDialog, ToastRegion, Toggle, cn } from './components/ui';
import { endNuzlockeRun, summarizeRun } from './lib/nuzlocke';
import {
  NORMAL_STORAGE_KEY,
  NUZLOCKE_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  createDefaultNormalSession,
  migrateLegacyNormalBackup,
  normalizeNormalSession,
  normalizeNuzlockeStore,
  normalizePreferences,
  readNormalSession,
  readNuzlockeStore,
  readPreferences,
  usePersistentState,
} from './lib/storage';
import type { AppMode, AppPreferences, NormalSession, NuzlockeStore } from './types';

export default function App() {
  const [preferences, setPreferences] = usePersistentState<AppPreferences>(PREFERENCES_STORAGE_KEY, readPreferences);
  const [normalSession, setNormalSession] = usePersistentState<NormalSession>(NORMAL_STORAGE_KEY, readNormalSession);
  const [nuzlockeStore, setNuzlockeStore] = usePersistentState<NuzlockeStore>(NUZLOCKE_STORAGE_KEY, readNuzlockeStore);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newRunConfirm, setNewRunConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.effects = preferences.reducedEffects ? 'reduced' : 'full';
  }, [preferences.reducedEffects, preferences.theme]);

  useEffect(() => {
    if (!notice && !error) return;
    const timeout = window.setTimeout(() => {
      setNotice('');
      setError('');
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [error, notice]);

  const notify = (message: string) => {
    setError('');
    setNotice(message);
  };

  const fail = (message: string) => {
    setNotice('');
    setError(message);
  };

  const setMode = (mode: AppMode) => {
    setPreferences((current) => ({ ...current, mode }));
    setSettingsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportBackup = () => {
    const data = {
      version: 3,
      exportedAt: new Date().toISOString(),
      preferences,
      normalSession,
      nuzlockeStore,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ow2-hero-selector-backup-' + Date.now() + '.json';
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Full app backup exported.');
  };

  const importBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      if (!data || typeof data !== 'object') throw new Error('Invalid backup');
      if (data.version === 3 && data.normalSession && data.nuzlockeStore) {
        const normal = data.normalSession as NormalSession;
        const nuzlocke = data.nuzlockeStore as NuzlockeStore;
        if (!Array.isArray(normal.players) || !Array.isArray(nuzlocke.runHistory)) throw new Error('Invalid state');
        setNormalSession(normalizeNormalSession(normal));
        setNuzlockeStore(normalizeNuzlockeStore(nuzlocke));
        if (data.preferences) setPreferences(normalizePreferences(data.preferences as Partial<AppPreferences>));
        notify('Backup restored successfully.');
      } else if (data.playerNames && data.lineup) {
        setNormalSession(migrateLegacyNormalBackup(data));
        setPreferences((current) => ({ ...current, mode: 'normal' }));
        notify('Older normal-session backup restored.');
      } else {
        throw new Error('Unsupported backup');
      }
    } catch {
      fail('That file is not a valid OW2 Hero Selector backup.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const confirmNewRun = () => {
    if (preferences.mode === 'normal') {
      setNormalSession(createDefaultNormalSession());
      notify('New normal session started.');
    } else {
      setNuzlockeStore((current) => {
        if (!current.currentRun) return current;
        const ended = current.currentRun.phase === 'active' ? endNuzlockeRun(current.currentRun) : current.currentRun;
        const history = [summarizeRun(ended), ...current.runHistory.filter((summary) => summary.id !== ended.id)].slice(0, 12);
        return { ...current, draftRules: ended.rules, currentRun: null, runHistory: history };
      });
      notify('Ready for a new Nuzlocke setup.');
    }
    setNewRunConfirm(false);
  };

  const canStartNew = preferences.mode === 'normal'
    ? normalSession.players.slice(0, normalSession.playerCount).some((player) => player.currentHero || player.completedHeroes.length) || normalSession.matches.length > 0
    : !!nuzlockeStore.currentRun;

  return (
    <div className={cn('app-root', 'theme-' + preferences.theme)}>
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <header className="topbar">
        <div className="topbar__inner">
          <a href="#top" className="brand" aria-label="Hero Selector home">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span><strong>Hero Selector</strong><small>Overwatch companion</small></span>
          </a>

          <nav className="mode-switcher" aria-label="Game mode">
            <button type="button" className={preferences.mode === 'normal' ? 'is-active' : ''} onClick={() => setMode('normal')} aria-pressed={preferences.mode === 'normal'}><Sparkles size={16} /><span>Normal</span></button>
            <button type="button" className={preferences.mode === 'nuzlocke' ? 'is-active' : ''} onClick={() => setMode('nuzlocke')} aria-pressed={preferences.mode === 'nuzlocke'}><span className="nuzlocke-mode-icon">N</span><span>Nuzlocke</span>{nuzlockeStore.currentRun?.phase === 'active' && <i>Live</i>}</button>
          </nav>

          <div className="topbar__status"><ShieldCheck size={15} /><span>Saved locally</span></div>

          <div className="topbar__actions">
            {canStartNew && <button type="button" className="button button--topbar" onClick={() => setNewRunConfirm(true)}><RotateCcw size={16} /><span>New run</span></button>}
            <button type="button" className="icon-button" onClick={() => setPreferences((current) => ({ ...current, theme: current.theme === 'dark' ? 'light' : 'dark' }))} aria-label={'Switch to ' + (preferences.theme === 'dark' ? 'light' : 'dark') + ' theme'} title="Toggle theme">{preferences.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open mode settings" title="Mode settings"><Settings2 size={18} /></button>
            <details className="topbar-menu">
              <summary className="icon-button" aria-label="Open display and data menu"><Menu size={18} /></summary>
              <div className="topbar-menu__popover">
                <div className="topbar-menu__heading"><small>Display</small><strong>Interface options</strong></div>
                <Toggle checked={preferences.compactCards} onChange={(compactCards) => setPreferences((current) => ({ ...current, compactCards }))} title="Compact hero cards" />
                <Toggle checked={preferences.reducedEffects} onChange={(reducedEffects) => setPreferences((current) => ({ ...current, reducedEffects }))} title="Reduce visual effects" />
                <div className="menu-divider" />
                <button type="button" className="menu-action" onClick={exportBackup}><Download size={16} /><span><strong>Export backup</strong><small>Both game modes</small></span></button>
                <button type="button" className="menu-action" onClick={() => importRef.current?.click()}><Upload size={16} /><span><strong>Import backup</strong><small>Restore saved state</small></span></button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => event.target.files?.[0] && importBackup(event.target.files[0])} />

      <main className="app-main" id="top">
        <div key={preferences.mode} className="mode-transition">
          {preferences.mode === 'normal' ? (
            <NormalMode session={normalSession} setSession={setNormalSession} settingsOpen={settingsOpen} onSettingsClose={() => setSettingsOpen(false)} compactCards={preferences.compactCards} notify={notify} fail={fail} />
          ) : (
            <NuzlockeMode store={nuzlockeStore} setStore={setNuzlockeStore} settingsOpen={settingsOpen} onSettingsClose={() => setSettingsOpen(false)} compactCards={preferences.compactCards} notify={notify} fail={fail} />
          )}
        </div>
      </main>

      <footer className="app-footer"><span><span className="brand-mark brand-mark--small" aria-hidden="true"><span /></span>Hero Selector</span><p>Normal and Nuzlocke progress are stored separately on this device.</p><button type="button" onClick={exportBackup}><Download size={14} />Backup data</button></footer>

      <ToastRegion message={notice} error={error} />
      <ConfirmDialog
        open={newRunConfirm}
        title={preferences.mode === 'normal' ? 'Start a new normal session?' : 'Start a new Nuzlocke setup?'}
        message={preferences.mode === 'normal'
          ? <p>This clears the normal lineup, results, exclusions, favorites, and completed heroes. Your Nuzlocke progress stays untouched.</p>
          : <p>The active Nuzlocke will be ended and archived before opening a fresh setup. Normal mode is not affected.</p>}
        confirmLabel="Start new run"
        onCancel={() => setNewRunConfirm(false)}
        onConfirm={confirmNewRun}
      />
    </div>
  );
}
