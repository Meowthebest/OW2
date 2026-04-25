import { useEffect, useMemo, useState } from "react";

const ROLE_ORDER = ["All", "Tank", "Damage", "Support"] as const;
type RoleFilter = (typeof ROLE_ORDER)[number];
type Role = Exclude<RoleFilter, "All">;
type PlayerId = 1 | 2 | 3 | 4 | 5;
type SortMode = "name" | "progress" | "completion" | "status";
type StatusFilter = "all" | "in-progress" | "completed" | "not-started";

type ProgressInfo = { completed: number; target: number; notes: string };
type PickEvent = {
  id: string;
  type: "roll" | "reroll" | "manual-set" | "complete" | "undo-complete" | "result";
  player?: string;
  hero?: string;
  role?: Role;
  result?: "W" | "L";
  at: number;
};

const HERO_BY_ROLE: Record<Role, string[]> = {
  Tank: ["D.Va", "Domina", "Doomfist", "Hazard", "Junker Queen", "Mauga", "Orisa", "Ramattra", "Reinhardt", "Roadhog", "Sigma", "Winston", "Wrecking Ball", "Zarya"],
  Damage: ["Anran", "Ashe", "Bastion", "Cassidy", "Echo", "Emre", "Freja", "Genji", "Hanzo", "Junkrat", "Mei", "Pharah", "Reaper", "Sojourn", "Soldier: 76", "Sombra", "Symmetra", "Torbjorn", "Tracer", "Vendetta", "Venture", "Widowmaker"],
  Support: ["Ana", "Baptiste", "Brigitte", "Illari", "Jetpack Cat", "Juno", "Kiriko", "Lifeweaver", "Lucio", "Mercy", "Mizuki", "Moira", "Wuyang", "Zenyatta"],
};

const HERO_IMAGE_MAP: Record<string, string> = {
  "D.Va": "icons/000000038C19.webp",
  Doomfist: "icons/000000038C1A.webp",
  "Junker Queen": "icons/000000038C1B.webp",
  Orisa: "icons/000000038C1C.webp",
  Ramattra: "icons/000000038C1D.webp",
  Reinhardt: "icons/000000038C1E.webp",
  Roadhog: "icons/000000038C1F.webp",
  Winston: "icons/000000038C25.webp",
  "Wrecking Ball": "icons/000000038C26.webp",
  Sigma: "icons/000000038C27.webp",
  Zarya: "icons/000000038C28.webp",
  Mauga: "icons/00000003DC9C.webp",
  Hazard: "icons/000000044C5E.webp",
  Ashe: "icons/150px-Ashe_mini_portrait.png",
  Bastion: "icons/150px-Bastion_mini_portrait.png",
  Cassidy: "icons/150px-Cassidy_OW2_mini_portrait.png",
  Echo: "icons/150px-Echo_mini_portrait.png",
  Freja: "icons/150px-Freja_mini_portrait.png",
  Genji: "icons/150px-Genji_OW2_mini_portrait.png",
  Hanzo: "icons/150px-Hanzo_mini_portrait.png",
  Junkrat: "icons/150px-Junkrat_OW2_mini_portrait.png",
  Mei: "icons/150px-Mei_OW2_mini_portrait.png",
  Pharah: "icons/150px-Pharah_OW2_mini_portrait.png",
  Reaper: "icons/150px-Reaper_OW2_mini_portrait.png",
  Sojourn: "icons/150px-Sojourn_mini_portrait.png",
  "Soldier: 76": "icons/150px-Soldier_OW2_mini_portrait.png",
  Sombra: "icons/150px-Sombra_OW2_mini_portrait.png",
  Symmetra: "icons/150px-Symmetra_OW2_mini_portrait.png",
  Torbjorn: "icons/150px-Torbjorn_OW2_mini_portrait.png",
  Tracer: "icons/150px-Tracer_OW2_mini_portrait.png",
  Venture: "icons/150px-Venture_mini_portrait.png",
  Widowmaker: "icons/150px-Widowmaker_OW2_mini_portrait.png",
  Ana: "icons/150px-Ana_OW2_mini_portrait.png",
  Baptiste: "icons/150px-Baptiste_mini_portrait.png",
  Brigitte: "icons/150px-Brigitte_OW2_mini_portrait.png",
  Illari: "icons/150px-Illari_mini_portrait.png",
  Juno: "icons/150px-Juno_mini_portrait.png",
  Kiriko: "icons/150px-Kiriko_OW2_mini_portrait.png",
  Lifeweaver: "icons/150px-Lifeweaver_mini_portrait.png",
  Lucio: "icons/150px-Lucio_OW2_mini_portrait.png",
  Mercy: "icons/150px-Mercy_OW2_mini_portrait.png",
  Moira: "icons/150px-Moira_OW2_mini_portrait.png",
  Wuyang: "icons/150px-Wuyang_mini_portrait.png",
  Zenyatta: "icons/150px-Zenyatta_OW2_mini_portrait.png",
  Emre: "icons/Emre.png",
  Anran: "icons/Anran.png",
  Vendetta: "icons/Vendetta_2D_portrait.png",
  Domina: "icons/Domina.png",
  Mizuki: "icons/Mizuki.png",
  "Jetpack Cat": "icons/JetpackCat.png",
};

const PLAYER_IDS: PlayerId[] = [1, 2, 3, 4, 5];
const DEFAULT_NAMES: Record<PlayerId, string> = { 1: "Player 1", 2: "Player 2", 3: "Player 3", 4: "Player 4", 5: "Player 5" };
const DEFAULT_PROGRESS: Record<PlayerId, ProgressInfo> = {
  1: { completed: 0, target: 10, notes: "" },
  2: { completed: 0, target: 10, notes: "" },
  3: { completed: 0, target: 10, notes: "" },
  4: { completed: 0, target: 10, notes: "" },
  5: { completed: 0, target: 10, notes: "" },
};
const DEFAULT_COMPLETED: Record<PlayerId, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
const DEFAULT_LINEUP: Record<PlayerId, string | null> = { 1: null, 2: null, 3: null, 4: null, 5: null };

function allHeroes() {
  return (Object.entries(HERO_BY_ROLE) as [Role, string[]][])
    .flatMap(([role, heroes]) => heroes.map((name) => ({ name, role })));
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function completionPercent(info: ProgressInfo) {
  if (info.target <= 0) return 0;
  return Math.round((info.completed / info.target) * 100);
}

function heroInitials(name: string) {
  const parts = name.replace(/[.:]/g, "").split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatRelative(at: number) {
  const diff = Date.now() - at;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

const Ic = {
  Dice: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.2" fill="currentColor" /><circle cx="16" cy="16" r="1.2" fill="currentColor" /><circle cx="16" cy="8" r="1.2" fill="currentColor" /><circle cx="8" cy="16" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>,
  Check: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="20 6 9 17 4 12" /></svg>,
  Undo: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>,
  Refresh: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>,
  Edit: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
  Reset: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>,
  Copy: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  Trash: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>,
  Trophy: () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 21h8" /><path d="M12 17v4" /><path d="M17 3H7v5a5 5 0 0 0 10 0V3Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></svg>,
  Star: ({ filled }: { filled?: boolean }) => <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15 8.5 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 9 8.5 12 2" /></svg>,
  History: () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>,
  Win: () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h14v6a7 7 0 1 1-14 0V4z" /><path d="M19 6h3v3a3 3 0 0 1-3 3" /><path d="M5 6H2v3a3 3 0 0 0 3 3" /><path d="M9 20h6" /><path d="M12 17v3" /></svg>,
  Gear: () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.82-.33 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.4a1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.82.33h.01A1.7 1.7 0 0 0 10 2.52V2.5a2 2 0 1 1 4 0v.02a1.7 1.7 0 0 0 1.07 1.57h.01a1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.82v.01A1.7 1.7 0 0 0 21.5 10H21.5a2 2 0 1 1 0 4h-.02A1.7 1.7 0 0 0 19.4 15z" /></svg>,
};

function HeroImage({ name, size = 48 }: { name: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = name ? HERO_IMAGE_MAP[name] : undefined;
  return (
    <div className="hero-thumb" style={{ width: size, height: size }}>
      {name && src && !failed ? (
        <img src={src} alt={name} onError={() => setFailed(true)} />
      ) : (
        <span>{name ? heroInitials(name) : "?"}</span>
      )}
    </div>
  );
}

export default function Overwatch2RandomHeroPickerMultiRoleLock() {
  const [theme, setTheme] = useStoredState<"dark" | "light">("ow2_theme", "dark");
  const [playerCount, setPlayerCount] = useStoredState<number>("ow2_player_count", 3);
  const [playerNames, setPlayerNames] = useStoredState<Record<PlayerId, string>>("ow2_names", DEFAULT_NAMES);
  const [playerRoles, setPlayerRoles] = useStoredState<Record<PlayerId, RoleFilter>>("ow2_roles", { 1: "All", 2: "All", 3: "All", 4: "All", 5: "All" });
  const [lineup, setLineup] = useStoredState<Record<PlayerId, string | null>>("ow2_lineup", DEFAULT_LINEUP);
  const [favorites, setFavorites] = useStoredState<Record<string, boolean>>("ow2_favorites", {});
  const [disabledHeroes, setDisabledHeroes] = useStoredState<Record<string, boolean>>("ow2_disabled_heroes", {});
  const [uniqueTeam, setUniqueTeam] = useStoredState<boolean>("ow2_unique_team", true);
  const [manualOverride, setManualOverride] = useStoredState<boolean>("ow2_manual_override", false);
  const [progress, setProgress] = useStoredState<Record<PlayerId, ProgressInfo>>("ow2_progress", DEFAULT_PROGRESS);
  const [completedHeroes, setCompletedHeroes] = useStoredState<Record<PlayerId, string[]>>("ow2_completed_heroes", DEFAULT_COMPLETED);
  const [pickHistory, setPickHistory] = useStoredState<PickEvent[]>("ow2_pick_history", []);
  const [wins, setWins] = useStoredState<number>("ow2_wins", 0);
  const [losses, setLosses] = useStoredState<number>("ow2_losses", 0);
  const [completionStreak, setCompletionStreak] = useStoredState<number>("ow2_completion_streak", 0);
  const [bestCompletionStreak, setBestCompletionStreak] = useStoredState<number>("ow2_completion_streak_best", 0);

  const [heroManagerOpen, setHeroManagerOpen] = useState(false);
  const [heroManagerRole, setHeroManagerRole] = useState<RoleFilter>("All");
  const [heroManagerSearch, setHeroManagerSearch] = useState("");
  const [heroManagerTab, setHeroManagerTab] = useState<"all" | "favorites" | "disabled">("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerStatus, setPlayerStatus] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rolling, setRolling] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerId | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | { message: string; onConfirm: () => void }>(null);
  const [undoReroll, setUndoReroll] = useState<Record<PlayerId, string | null>>({ 1: null, 2: null, 3: null, 4: null, 5: null });
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(id);
  }, [notice]);

  const flatHeroes = useMemo(() => allHeroes(), []);
  const roleByHero = useMemo(() => {
    const out: Record<string, Role> = {};
    flatHeroes.forEach((h) => {
      out[h.name] = h.role;
    });
    return out;
  }, [flatHeroes]);
  const activePlayers = useMemo(() => PLAYER_IDS.slice(0, playerCount), [playerCount]);

  const filteredHeroManagerList = useMemo(
    () =>
      flatHeroes.filter((h) => {
        if (heroManagerRole !== "All" && h.role !== heroManagerRole) return false;
        if (!h.name.toLowerCase().includes(heroManagerSearch.toLowerCase())) return false;
        if (heroManagerTab === "favorites" && !favorites[h.name]) return false;
        if (heroManagerTab === "disabled" && !disabledHeroes[h.name]) return false;
        return true;
      }),
    [disabledHeroes, favorites, flatHeroes, heroManagerRole, heroManagerSearch, heroManagerTab],
  );

  const visiblePlayers = useMemo(() => {
    const rows = activePlayers.map((id) => {
      const info = progress[id];
      const pct = completionPercent(info);
      const status: StatusFilter = pct >= 100 ? "completed" : info.completed > 0 ? "in-progress" : "not-started";
      const hero = lineup[id];
      const doneList = completedHeroes[id] ?? [];
      return {
        id,
        name: playerNames[id],
        role: playerRoles[id],
        hero,
        heroRole: hero ? roleByHero[hero] : null,
        progress: info,
        pct,
        status,
        doneList,
        heroIsDone: !!hero && doneList.includes(hero),
      };
    })
      .filter((r) => r.name.toLowerCase().includes(playerSearch.toLowerCase()))
      .filter((r) => playerStatus === "all" || r.status === playerStatus);

    rows.sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "progress") return b.pct - a.pct;
      if (sortMode === "completion") return b.progress.completed - a.progress.completed;
      return a.status.localeCompare(b.status);
    });
    return rows;
  }, [activePlayers, completedHeroes, lineup, playerNames, playerRoles, playerSearch, playerStatus, progress, roleByHero, sortMode]);

  const favCount = useMemo(() => Object.values(favorites).filter(Boolean).length, [favorites]);
  const disabledCount = useMemo(() => Object.values(disabledHeroes).filter(Boolean).length, [disabledHeroes]);

  const addEvent = (event: Omit<PickEvent, "id" | "at">) => {
    const now = Date.now();
    setPickHistory((cur) => [{ ...event, id: `${now}-${Math.random().toString(36).slice(2, 7)}`, at: now }, ...cur].slice(0, 80));
  };

  const pickHeroFor = (playerId: PlayerId, taken: Set<string>) => {
    const role = playerRoles[playerId];
    const source = role === "All" ? flatHeroes : HERO_BY_ROLE[role].map((name) => ({ name, role }));
    const pool = source
      .map((h) => h.name)
      .filter((n) => !disabledHeroes[n] && (!uniqueTeam || !taken.has(n)));
    if (pool.length === 0) return null;
    const weighted = pool.flatMap((n) => (favorites[n] ? [n, n, n] : [n]));
    return randomItem(weighted);
  };

  const runDraft = () => {
    setError("");
    setNotice("");
    setRolling(true);
    window.setTimeout(() => {
      const taken = new Set<string>();
      const next: Record<PlayerId, string | null> = { ...lineup };
      let any = false;
      for (const id of activePlayers) {
        const oldHero = lineup[id];
        const picked = pickHeroFor(id, taken);
        next[id] = picked;
        if (picked) {
          taken.add(picked);
          any = true;
          addEvent({ type: "roll", player: playerNames[id], hero: picked, role: roleByHero[picked] });
          if (oldHero && oldHero !== picked) {
            setUndoReroll((cur) => ({ ...cur, [id]: oldHero }));
          }
        }
      }
      setLineup(next);
      setRolling(false);
      if (!any) {
        setError("No eligible heroes available. Check role locks, disabled heroes, or unique mode.");
      } else if (activePlayers.every((id) => next[id])) {
        setNotice("Draft complete. You can open End Result summary.");
      }
    }, 360);
  };

  const rerollPlayer = (id: PlayerId) => {
    const taken = new Set(
      Object.entries(lineup)
        .filter(([pid, hero]) => Number(pid) !== id && hero)
        .map(([, hero]) => hero as string),
    );
    const oldHero = lineup[id];
    const pick = pickHeroFor(id, taken);
    if (!pick) {
      setError(`No reroll options for ${playerNames[id]}.`);
      return;
    }
    setError("");
    setNotice("");
    setLineup((cur) => ({ ...cur, [id]: pick }));
    setUndoReroll((cur) => ({ ...cur, [id]: oldHero }));
    addEvent({ type: "reroll", player: playerNames[id], hero: pick, role: roleByHero[pick] });
  };

  const undoRerollForPlayer = (id: PlayerId) => {
    const prevHero = undoReroll[id];
    if (!prevHero) return;
    setLineup((cur) => ({ ...cur, [id]: prevHero }));
    setUndoReroll((cur) => ({ ...cur, [id]: null }));
    setNotice(`Restored ${prevHero} for ${playerNames[id]}.`);
    addEvent({ type: "manual-set", player: playerNames[id], hero: prevHero, role: roleByHero[prevHero] });
  };

  const clearLineup = () =>
    setConfirmAction({
      message: "Clear all drafted heroes?",
      onConfirm: () => {
        setLineup(DEFAULT_LINEUP);
        setUndoReroll(DEFAULT_LINEUP);
      },
    });

  const clearFavorites = () =>
    setConfirmAction({
      message: "Clear all favorites?",
      onConfirm: () => setFavorites({}),
    });

  const clearDisabled = () =>
    setConfirmAction({
      message: "Enable all disabled heroes?",
      onConfirm: () => setDisabledHeroes({}),
    });

  const resetPlayerProgress = (id: PlayerId) =>
    setConfirmAction({
      message: `Reset progress for ${playerNames[id]}?`,
      onConfirm: () => {
        setProgress((cur) => ({ ...cur, [id]: { ...cur[id], completed: 0, notes: "" } }));
        setCompletedHeroes((cur) => ({ ...cur, [id]: [] }));
      },
    });

  const markComplete = (id: PlayerId) => {
    const hero = lineup[id];
    if (!hero) return;
    setCompletedHeroes((cur) => {
      const list = cur[id] ?? [];
      if (list.includes(hero)) return cur;
      return { ...cur, [id]: [...list, hero] };
    });
    setProgress((cur) => ({
      ...cur,
      [id]: { ...cur[id], completed: Math.min(999, cur[id].completed + 1) },
    }));
    setCompletionStreak((cs) => {
      const next = cs + 1;
      setBestCompletionStreak((best) => Math.max(best, next));
      return next;
    });
    setNotice(`${hero} marked complete for ${playerNames[id]}.`);
    addEvent({ type: "complete", player: playerNames[id], hero, role: roleByHero[hero] });
  };

  const undoComplete = (id: PlayerId, hero: string) => {
    setCompletedHeroes((cur) => {
      const list = cur[id] ?? [];
      if (!list.includes(hero)) return cur;
      return { ...cur, [id]: list.filter((h) => h !== hero) };
    });
    setProgress((cur) => ({
      ...cur,
      [id]: { ...cur[id], completed: Math.max(0, cur[id].completed - 1) },
    }));
    setCompletionStreak(0);
    addEvent({ type: "undo-complete", player: playerNames[id], hero, role: roleByHero[hero] });
  };

  const finishAll = () => {
    const targets = activePlayers.filter((id) => {
      const hero = lineup[id];
      if (!hero) return false;
      return !(completedHeroes[id] ?? []).includes(hero);
    });
    if (targets.length === 0) return;
    setCompletedHeroes((cur) => {
      const next = { ...cur };
      targets.forEach((id) => {
        const hero = lineup[id];
        if (!hero) return;
        next[id] = [...(next[id] ?? []), hero];
      });
      return next;
    });
    setProgress((cur) => {
      const next = { ...cur };
      targets.forEach((id) => {
        next[id] = { ...next[id], completed: Math.min(999, next[id].completed + 1) };
      });
      return next;
    });
    setCompletionStreak((cs) => {
      const next = cs + targets.length;
      setBestCompletionStreak((best) => Math.max(best, next));
      return next;
    });
    setNotice("Marked all current picks as completed.");
  };

  const registerResult = (result: "W" | "L") => {
    if (result === "W") setWins((v) => v + 1);
    if (result === "L") setLosses((v) => v + 1);
    addEvent({ type: "result", result });
  };

  const copyLineup = async () => {
    const text = activePlayers.map((id) => `${playerNames[id]}: ${lineup[id] ?? "No pick"}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Lineup copied.");
    } catch {
      setError("Clipboard copy not supported in this browser.");
    }
  };

  const totalMatches = wins + losses;
  const winRate = totalMatches === 0 ? 0 : Math.round((wins / totalMatches) * 100);
  const totalCompleted = activePlayers.reduce((acc, id) => acc + (completedHeroes[id]?.length ?? 0), 0);
  const avgProgress = activePlayers.length
    ? Math.round(activePlayers.reduce((acc, id) => acc + completionPercent(progress[id]), 0) / activePlayers.length)
    : 0;

  const summaryData = useMemo(
    () =>
      activePlayers.map((id) => ({
        name: playerNames[id],
        role: playerRoles[id],
        hero: lineup[id],
        completed: completedHeroes[id] ?? [],
        progress: progress[id],
      })),
    [activePlayers, completedHeroes, lineup, playerNames, playerRoles, progress],
  );

  const exportSummaryPng = () => {
    const w = 1120;
    const h = 760;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0d0d12");
    g.addColorStop(1, "#141419");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#f79a2e";
    ctx.font = "700 38px Inter, Segoe UI, sans-serif";
    ctx.fillText("OW2 Match Summary", 42, 62);
    ctx.fillStyle = "#9b9aa3";
    ctx.font = "600 15px Inter, Segoe UI, sans-serif";
    ctx.fillText(new Date().toLocaleString(), 44, 88);

    const panel = (x: number, y: number, pw: number, ph: number, title: string) => {
      ctx.fillStyle = "#1b1b22";
      ctx.strokeStyle = "#2e2e38";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb34d";
      ctx.font = "700 16px Inter, Segoe UI, sans-serif";
      ctx.fillText(title, x + 16, y + 28);
    };

    panel(36, 114, 612, 610, "Players");
    panel(664, 114, 420, 290, "Totals");
    panel(664, 424, 420, 300, "Recent Activity");

    let py = 154;
    summaryData.forEach((p) => {
      const hero = p.hero ?? "No pick";
      const percent = completionPercent(p.progress);
      ctx.fillStyle = "#f3f1ec";
      ctx.font = "700 15px Inter, Segoe UI, sans-serif";
      ctx.fillText(`${p.name} (${p.role})`, 54, py + 18);
      ctx.fillStyle = "#9b9aa3";
      ctx.font = "600 13px Inter, Segoe UI, sans-serif";
      ctx.fillText(`Hero: ${hero}`, 54, py + 40);
      ctx.fillText(`Completed: ${p.completed.length}   Progress: ${percent}%`, 54, py + 58);
      py += 92;
    });

    const stats = [
      `Wins: ${wins}`,
      `Losses: ${losses}`,
      `Matches: ${totalMatches}`,
      `Win Rate: ${winRate}%`,
      `Total Completed Heroes: ${totalCompleted}`,
      `Average Progress: ${avgProgress}%`,
      `Completion Streak: ${completionStreak} (best ${bestCompletionStreak})`,
    ];
    let sy = 154;
    stats.forEach((s) => {
      ctx.fillStyle = "#f3f1ec";
      ctx.font = "700 17px Inter, Segoe UI, sans-serif";
      ctx.fillText(s, 684, sy + 18);
      sy += 34;
    });

    const recent = pickHistory.slice(0, 9);
    if (recent.length === 0) {
      ctx.fillStyle = "#9b9aa3";
      ctx.font = "600 14px Inter, Segoe UI, sans-serif";
      ctx.fillText("No events recorded yet.", 684, 466);
    } else {
      let ey = 460;
      recent.forEach((e, idx) => {
        const text =
          e.type === "result"
            ? `${e.result === "W" ? "Win" : "Loss"}`
            : `${e.type.replace("-", " ")} • ${e.player ?? "Team"} • ${e.hero ?? ""}`;
        ctx.fillStyle = idx % 2 === 0 ? "#f3f1ec" : "#bdbcc4";
        ctx.font = "600 13px Inter, Segoe UI, sans-serif";
        ctx.fillText(text, 684, ey);
        ey += 26;
      });
    }

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `ow2-summary-${Date.now()}.png`;
    a.click();
  };

  const anyHeroPicked = activePlayers.some((id) => !!lineup[id]);

  return (
    <div className={`ow2-root ${theme}`}>
      <div className="dashboard-layout">
        <aside className="settings-column">
          <section className="stats-strip card">
            <div className="stat">
              <span className="stat-label"><Ic.Win /> Match results</span>
              <div className="stat-value">
                <strong>{wins}-{losses}</strong>
                <small>{winRate}% WR</small>
              </div>
              <div className="stat-actions">
                <button className="btn sm" type="button" onClick={() => registerResult("W")}>Win</button>
                <button className="btn sm ghost" type="button" onClick={() => registerResult("L")}>Loss</button>
              </div>
            </div>
            <div className="stat">
              <span className="stat-label"><Ic.Check /> Completion</span>
              <div className="stat-value">
                <strong>{totalCompleted}</strong>
                <small>{avgProgress}% avg</small>
              </div>
              <div className="stat-actions">
                <button className="btn sm ghost" type="button" onClick={() => setCompletionStreak(0)}>Reset streak</button>
              </div>
            </div>
            <div className="stat">
              <span className="stat-label"><Ic.Star filled /> Hero settings</span>
              <div className="stat-value">
                <strong>{favCount}</strong>
                <small>{disabledCount} disabled</small>
              </div>
              <div className="stat-actions">
                <button className="btn sm" type="button" onClick={() => setHeroManagerOpen(true)}>
                  <Ic.Gear /> Hero Pool
                </button>
              </div>
            </div>
          </section>

          <section className="ow2-toolbar card">
            <div className="toolbar-left">
              <label>
                Theme
                <select value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <label>
                Players
                <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>
                Sort
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="name">Name</option>
                  <option value="progress">Progress</option>
                  <option value="completion">Completion</option>
                  <option value="status">Status</option>
                </select>
              </label>
            </div>
            <div className="toolbar-right">
              <label className="toggle">
                <input type="checkbox" checked={uniqueTeam} onChange={(e) => setUniqueTeam(e.target.checked)} />
                Unique team
              </label>
              <label className="toggle">
                <input type="checkbox" checked={manualOverride} onChange={(e) => setManualOverride(e.target.checked)} />
                Manual override
              </label>
              <button className={`btn primary glow ${rolling ? "rolling" : ""}`} type="button" onClick={runDraft} disabled={rolling}>
                <Ic.Dice /> {rolling ? "Rolling..." : "Randomize"}
              </button>
              <button className="btn" type="button" onClick={runDraft} disabled={rolling}>
                <Ic.Refresh /> Reroll All
              </button>
              <button className="btn" type="button" onClick={finishAll} disabled={!anyHeroPicked}>
                <Ic.Trophy /> Complete All
              </button>
              <button className="btn ghost" type="button" onClick={copyLineup} disabled={!anyHeroPicked}>
                <Ic.Copy /> Copy
              </button>
              <button className="btn ghost" type="button" onClick={clearLineup} disabled={!anyHeroPicked}>
                <Ic.Trash /> Clear
              </button>
            </div>
          </section>

          <section className="ow2-player-tools card">
            <input value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Search players..." />
            <select value={playerStatus} onChange={(e) => setPlayerStatus(e.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="not-started">Not started</option>
            </select>
          </section>
        </aside>

        <main className="content-column">
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}

          <section className="player-grid">
        {visiblePlayers.length === 0 && (
          <div className="empty card">
            <h4>No players match current filters.</h4>
            <p>Try clearing player search or status filter.</p>
          </div>
        )}
        {visiblePlayers.map((row) => (
          <article key={row.id} className={`player-card card ${row.hero ? "filled" : ""} role-${row.heroRole ?? "none"}`}>
            <header className="pc-head">
              <div className="pc-meta">
                <span className="pc-label">Player {row.id}</span>
                <input
                  className="pc-name"
                  value={playerNames[row.id]}
                  onChange={(e) => setPlayerNames((cur) => ({ ...cur, [row.id]: e.target.value }))}
                  placeholder={`Player ${row.id}`}
                />
              </div>
              <select
                className="pc-role"
                value={playerRoles[row.id]}
                onChange={(e) => setPlayerRoles((cur) => ({ ...cur, [row.id]: e.target.value as RoleFilter }))}
              >
                {ROLE_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </header>

            <div className="pc-hero" key={row.hero ?? `empty-${row.id}`}>
              <HeroImage name={row.hero} size={54} />
              <div className="pc-hero-info">
                <span className="pc-hero-name">{row.hero ?? "Ready to roll"}</span>
                <span className="pc-hero-role">{row.hero ? row.heroRole : "Awaiting draft"}</span>
              </div>
              {row.heroIsDone && <span className="pc-done-pill"><Ic.Check /> Completed</span>}
            </div>

            <div className="pc-progress">
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, row.pct)}%` }} /></div>
              <div className="pc-progress-meta">
                <strong>{row.pct}%</strong>
                <span>{row.progress.completed}/{row.progress.target}</span>
              </div>
            </div>

            {row.progress.notes && <p className="notes">{row.progress.notes}</p>}

            <div className="pc-actions">
              <button className={`btn primary full ${row.heroIsDone ? "is-done" : ""}`} type="button" onClick={() => (row.heroIsDone && row.hero ? undoComplete(row.id, row.hero) : markComplete(row.id))} disabled={!row.hero}>
                {row.heroIsDone ? <><Ic.Undo /> Undo Complete</> : <><Ic.Check /> Complete</>}
              </button>
              <div className="pc-actions-row">
                <button className="btn sm" type="button" onClick={() => rerollPlayer(row.id)} disabled={rolling}><Ic.Refresh /> Reroll</button>
                <button className="btn sm" type="button" onClick={() => setEditingPlayer(row.id)}><Ic.Edit /> Edit Hero</button>
                <button className="btn sm ghost" type="button" onClick={() => resetPlayerProgress(row.id)}><Ic.Reset /> Reset</button>
              </div>
              {undoReroll[row.id] && (
                <button className="btn sm ghost full" type="button" onClick={() => undoRerollForPlayer(row.id)}>
                  <Ic.Undo /> Restore {undoReroll[row.id]}
                </button>
              )}
            </div>

            {row.doneList.length > 0 && (
              <div className="pc-completed">
                <span className="pc-completed-label"><Ic.Trophy /> Completed heroes</span>
                <div className="pc-completed-chips">
                  {row.doneList.slice(-6).map((h) => (
                    <button key={h} className="chip" type="button" onClick={() => undoComplete(row.id, h)}>{h}</button>
                  ))}
                  {row.doneList.length > 6 && <span className="chip more">+{row.doneList.length - 6}</span>}
                </div>
              </div>
            )}
          </article>
        ))}
          </section>

          <section className="card summary">
        <button className="summary-head" type="button" onClick={() => setSummaryOpen((v) => !v)}>
          <div className="section-title-group">
            <span className="section-eyebrow"><Ic.Trophy /> End result summary</span>
            <h3>Final draft + progress + match stats</h3>
          </div>
          <span className={`chev ${summaryOpen ? "open" : ""}`}>▾</span>
        </button>
        {summaryOpen && (
          <div className="summary-body">
            <div className="summary-grid">
              {summaryData.map((p) => (
                <div key={p.name} className="summary-player">
                  <strong>{p.name}</strong>
                  <span>{p.hero ?? "No pick"} · {p.role}</span>
                  <small>{p.completed.length} completed · {completionPercent(p.progress)}%</small>
                </div>
              ))}
            </div>
            <div className="summary-stats">
              <span>Total matches <strong>{totalMatches}</strong></span>
              <span>Wins <strong>{wins}</strong></span>
              <span>Losses <strong>{losses}</strong></span>
              <span>Win rate <strong>{winRate}%</strong></span>
              <span>Total completed heroes <strong>{totalCompleted}</strong></span>
              <span>Completion streak <strong>{completionStreak}</strong></span>
              <span>Best streak <strong>{bestCompletionStreak}</strong></span>
            </div>
            <div className="summary-actions">
              <button className="btn" type="button" onClick={exportSummaryPng}><Ic.Copy /> Export PNG</button>
            </div>
          </div>
        )}
          </section>

          <section className="card history">
        <button type="button" className="history-head" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
          <div className="section-title-group">
            <span className="section-eyebrow"><Ic.History /> Match history</span>
            <h3>Recent rolls, completions, and results</h3>
          </div>
          <span className={`chev ${historyOpen ? "open" : ""}`}>▾</span>
        </button>
        {historyOpen && (
          <>
            {pickHistory.length === 0 ? (
              <div className="empty compact">
                <h4>No history yet.</h4>
                <p>Roll heroes, mark completion, or record win/loss to populate this feed.</p>
              </div>
            ) : (
              <div className="history-list">
                {pickHistory.map((e) => (
                  <div key={e.id} className={`history-row ${e.role ? `role-${e.role}` : ""}`}>
                    <div className="history-icon">
                      {e.type === "result" ? (e.result === "W" ? "W" : "L") : <Ic.History />}
                    </div>
                    <div className="history-meta">
                      <span className="history-hero">
                        {e.type === "result"
                          ? `${e.result === "W" ? "Win recorded" : "Loss recorded"}`
                          : `${e.type.replace("-", " ")}${e.hero ? ` · ${e.hero}` : ""}`}
                      </span>
                      <small>{e.player ?? "Team"} {e.role ? `· ${e.role}` : ""}</small>
                    </div>
                    <span className="history-time">{formatRelative(e.at)}</span>
                  </div>
                ))}
              </div>
            )}
            {pickHistory.length > 0 && (
              <div className="history-foot">
                <button className="btn sm ghost" type="button" onClick={() => setConfirmAction({ message: "Clear entire match history?", onConfirm: () => setPickHistory([]) })}>
                  <Ic.Trash /> Clear History
                </button>
              </div>
            )}
          </>
        )}
          </section>
        </main>
      </div>

      {heroManagerOpen && (
        <HeroManagerModal
          heroes={filteredHeroManagerList}
          roleFilter={heroManagerRole}
          search={heroManagerSearch}
          tab={heroManagerTab}
          favorites={favorites}
          disabledHeroes={disabledHeroes}
          favCount={favCount}
          disabledCount={disabledCount}
          onClose={() => setHeroManagerOpen(false)}
          onRoleFilter={setHeroManagerRole}
          onSearch={setHeroManagerSearch}
          onTab={setHeroManagerTab}
          onToggleFavorite={(hero) => setFavorites((cur) => ({ ...cur, [hero]: !cur[hero] }))}
          onToggleDisabled={(hero) => setDisabledHeroes((cur) => ({ ...cur, [hero]: !cur[hero] }))}
          onClearFavorites={clearFavorites}
          onClearDisabled={clearDisabled}
        />
      )}

      {editingPlayer !== null && (
        <EditPlayerModal
          playerName={playerNames[editingPlayer]}
          playerRole={playerRoles[editingPlayer]}
          currentHero={lineup[editingPlayer]}
          completedList={completedHeroes[editingPlayer] ?? []}
          allHeroes={flatHeroes}
          roleByHero={roleByHero}
          allowOverride={manualOverride}
          value={progress[editingPlayer]}
          onClose={() => setEditingPlayer(null)}
          onSaveProgress={(val) => setProgress((cur) => ({ ...cur, [editingPlayer]: val }))}
          onSetHero={(hero) => {
            setLineup((cur) => ({ ...cur, [editingPlayer]: hero }));
            if (hero) addEvent({ type: "manual-set", player: playerNames[editingPlayer], hero, role: roleByHero[hero] });
          }}
          onMarkManualComplete={(hero) => {
            if (!hero) return;
            setCompletedHeroes((cur) => {
              const list = cur[editingPlayer] ?? [];
              if (list.includes(hero)) return cur;
              return { ...cur, [editingPlayer]: [...list, hero] };
            });
            setProgress((cur) => ({ ...cur, [editingPlayer]: { ...cur[editingPlayer], completed: Math.min(999, cur[editingPlayer].completed + 1) } }));
            addEvent({ type: "complete", player: playerNames[editingPlayer], hero, role: roleByHero[hero] });
          }}
          onUndoManualComplete={(hero) => undoComplete(editingPlayer, hero)}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          message={confirmAction.message}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            confirmAction.onConfirm();
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}

function HeroManagerModal({
  heroes,
  roleFilter,
  search,
  tab,
  favorites,
  disabledHeroes,
  favCount,
  disabledCount,
  onClose,
  onRoleFilter,
  onSearch,
  onTab,
  onToggleFavorite,
  onToggleDisabled,
  onClearFavorites,
  onClearDisabled,
}: {
  heroes: { name: string; role: Role }[];
  roleFilter: RoleFilter;
  search: string;
  tab: "all" | "favorites" | "disabled";
  favorites: Record<string, boolean>;
  disabledHeroes: Record<string, boolean>;
  favCount: number;
  disabledCount: number;
  onClose: () => void;
  onRoleFilter: (v: RoleFilter) => void;
  onSearch: (v: string) => void;
  onTab: (v: "all" | "favorites" | "disabled") => void;
  onToggleFavorite: (hero: string) => void;
  onToggleDisabled: (hero: string) => void;
  onClearFavorites: () => void;
  onClearDisabled: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal hero-manager card" onClick={(e) => e.stopPropagation()}>
        <div className="hm-head">
          <div className="section-title-group">
            <span className="section-eyebrow"><Ic.Gear /> Hero pool settings</span>
            <h3>Favorites and randomizer availability</h3>
          </div>
          <button className="btn sm ghost" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="hm-toolbar">
          <div className="hm-tabs">
            <button type="button" className={`pool-tab ${tab === "all" ? "active" : ""}`} onClick={() => onTab("all")}>All</button>
            <button type="button" className={`pool-tab ${tab === "favorites" ? "active" : ""}`} onClick={() => onTab("favorites")}><Ic.Star filled /> {favCount}</button>
            <button type="button" className={`pool-tab ${tab === "disabled" ? "active" : ""}`} onClick={() => onTab("disabled")}><Ic.Reset /> {disabledCount}</button>
          </div>
          <select value={roleFilter} onChange={(e) => onRoleFilter(e.target.value as RoleFilter)}>
            {ROLE_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search heroes..." />
          <button className="btn sm ghost" type="button" onClick={onClearFavorites} disabled={favCount === 0}>Clear Favorites</button>
          <button className="btn sm ghost" type="button" onClick={onClearDisabled} disabled={disabledCount === 0}>Enable All</button>
        </div>
        {heroes.length === 0 ? (
          <div className="empty compact"><p>No heroes match your current filters.</p></div>
        ) : (
          <div className="hero-grid-modal">
            {heroes.map((h) => (
              <div key={h.name} className={`hero-tile role-${h.role} ${disabledHeroes[h.name] ? "disabled" : ""}`}>
                <HeroImage name={h.name} size={42} />
                <div className="hero-tile-meta">
                  <strong>{h.name}</strong>
                  <small>{h.role}</small>
                </div>
                <div className="hero-tile-actions">
                  <button className={`icon-btn ${favorites[h.name] ? "active" : ""}`} type="button" onClick={() => onToggleFavorite(h.name)} title="Favorite">
                    <Ic.Star filled={favorites[h.name]} />
                  </button>
                  <button className={`icon-btn ${disabledHeroes[h.name] ? "danger" : ""}`} type="button" onClick={() => onToggleDisabled(h.name)} title="Enable/Disable">
                    <Ic.Reset />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditPlayerModal({
  playerName,
  playerRole,
  currentHero,
  completedList,
  allHeroes,
  roleByHero,
  allowOverride,
  value,
  onClose,
  onSaveProgress,
  onSetHero,
  onMarkManualComplete,
  onUndoManualComplete,
}: {
  playerName: string;
  playerRole: RoleFilter;
  currentHero: string | null;
  completedList: string[];
  allHeroes: { name: string; role: Role }[];
  roleByHero: Record<string, Role>;
  allowOverride: boolean;
  value: ProgressInfo;
  onClose: () => void;
  onSaveProgress: (v: ProgressInfo) => void;
  onSetHero: (hero: string | null) => void;
  onMarkManualComplete: (hero: string | null) => void;
  onUndoManualComplete: (hero: string) => void;
}) {
  const [completed, setCompleted] = useState(value.completed);
  const [target, setTarget] = useState(value.target);
  const [notes, setNotes] = useState(value.notes);
  const [heroChoice, setHeroChoice] = useState(currentHero ?? "");
  const [completionHeroChoice, setCompletionHeroChoice] = useState(currentHero ?? "");

  const selectableHeroes = useMemo(() => {
    if (allowOverride || playerRole === "All") return allHeroes;
    return allHeroes.filter((h) => h.role === playerRole);
  }, [allowOverride, allHeroes, playerRole]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h4>
          <span className="section-eyebrow"><Ic.Edit /> Edit player</span>
          {playerName}
        </h4>
        <div className="modal-grid">
          <label>
            Completed
            <input type="number" min={0} value={completed} onChange={(e) => setCompleted(Number(e.target.value))} />
          </label>
          <label>
            Target
            <input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          </label>
          <label className="wide">
            Set Hero
            <select value={heroChoice} onChange={(e) => setHeroChoice(e.target.value)}>
              <option value="">No pick</option>
              {selectableHeroes.map((h) => <option key={h.name} value={h.name}>{h.name} · {h.role}</option>)}
            </select>
          </label>
          <label className="wide">
            Manual Complete Hero
            <select value={completionHeroChoice} onChange={(e) => setCompletionHeroChoice(e.target.value)}>
              <option value="">Choose hero...</option>
              {allHeroes.map((h) => <option key={h.name} value={h.name}>{h.name} · {h.role}</option>)}
            </select>
          </label>
          <label className="wide">
            Notes
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {completedList.length > 0 && (
          <div className="modal-completed">
            <span className="section-eyebrow"><Ic.Trophy /> Completed heroes</span>
            <div className="pc-completed-chips">
              {completedList.map((h) => (
                <button key={h} className="chip" type="button" onClick={() => onUndoManualComplete(h)}>
                  {h} · {roleByHero[h]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="button" onClick={() => onSetHero(heroChoice || null)}><Ic.Edit /> Set Hero</button>
          <button className="btn" type="button" onClick={() => onMarkManualComplete(completionHeroChoice || null)}><Ic.Check /> Add Completion</button>
          <button
            className="btn primary"
            type="button"
            onClick={() =>
              onSaveProgress({
                completed: Math.max(0, Math.min(999, Math.floor(completed))),
                target: Math.max(1, Math.floor(target)),
                notes: notes.trim(),
              })
            }
          >
            <Ic.Check /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onCancel, onConfirm }: { message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal card confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h4>Confirm action</h4>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn primary" type="button" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
