import { useCallback, useEffect, useMemo, useState } from "react";

const ROLE_ORDER = ["All", "Tank", "Damage", "Support"] as const;
type RoleFilter = (typeof ROLE_ORDER)[number];
type Role = Exclude<RoleFilter, "All">;
type PlayerId = 1 | 2 | 3 | 4 | 5;
type SortMode = "name" | "progress" | "completion" | "status";
type PoolTab = "all" | "favorites";

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

type ProgressInfo = { completed: number; target: number; notes: string };
type HistoryEntry = { id: string; hero: string; role: Role; player: string; at: number };
type MatchResult = { id: string; result: "W" | "L"; at: number };

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

/* -------- Icons (inline SVG, no dependency) -------- */
const Ic = {
  Dice: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.2" fill="currentColor" /><circle cx="16" cy="16" r="1.2" fill="currentColor" /><circle cx="16" cy="8" r="1.2" fill="currentColor" /><circle cx="8" cy="16" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  ),
  Undo: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
  ),
  Edit: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
  ),
  Reset: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
  ),
  Copy: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
  ),
  Trophy: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8" /><path d="M12 17v4" /><path d="M17 3H7v5a5 5 0 0 0 10 0V3Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></svg>
  ),
  Star: ({ filled }: { filled?: boolean }) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 8.5 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 9 8.5 12 2" /></svg>
  ),
  Flame: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A3.5 3.5 0 0 0 12 18c2 0 3.5-1.5 3.5-3.5 0-2-1-3.5-3-6-1.5 2-2 3.5-2 5 0 1-1 2-2 2z" /><path d="M12 2c2.5 3 5 6 5 9.5 0 4-3.5 6.5-5 6.5s-5-2.5-5-6.5C7 8.5 9.5 5 12 2z" /></svg>
  ),
  History: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>
  ),
  Sparkle: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /></svg>
  ),
  Target: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>
  ),
  Win: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v6a7 7 0 1 1-14 0V4z" /><path d="M19 6h3v3a3 3 0 0 1-3 3" /><path d="M5 6H2v3a3 3 0 0 0 3 3" /><path d="M9 20h6" /><path d="M12 17v3" /></svg>
  ),
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
  const [playerRoles, setPlayerRoles] = useStoredState<Record<PlayerId, RoleFilter>>("ow2_roles", {
    1: "All", 2: "All", 3: "All", 4: "All", 5: "All",
  });
  const [lineup, setLineup] = useStoredState<Record<PlayerId, string | null>>("ow2_lineup", {
    1: null, 2: null, 3: null, 4: null, 5: null,
  });
  const [favorites, setFavorites] = useStoredState<Record<string, boolean>>("ow2_favorites", {});
  const [uniqueTeam, setUniqueTeam] = useStoredState<boolean>("ow2_unique", true);
  const [progress, setProgress] = useStoredState<Record<PlayerId, ProgressInfo>>("ow2_progress", DEFAULT_PROGRESS);
  const [completedHeroes, setCompletedHeroes] = useStoredState<Record<PlayerId, string[]>>(
    "ow2_completed_heroes",
    DEFAULT_COMPLETED,
  );
  const [history, setHistory] = useStoredState<HistoryEntry[]>("ow2_pick_history", []);
  const [results, setResults] = useStoredState<MatchResult[]>("ow2_match_results", []);

  const [wins, setWins] = useStoredState<number>("ow2_wins", 0);
  const [losses, setLosses] = useStoredState<number>("ow2_losses", 0);

  const [manualOverride, setManualOverride] = useStoredState<boolean>("ow2_manual_override", false);

  const [completionStreak, setCompletionStreak] = useStoredState<number>("ow2_comp_streak", 0);
  const [bestCompletionStreak, setBestCompletionStreak] = useStoredState<number>("ow2_comp_streak_best", 0);

  const [heroFilter, setHeroFilter] = useState<RoleFilter>("All");
  const [heroSearch, setHeroSearch] = useState("");
  const [poolTab, setPoolTab] = useState<PoolTab>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerStatus, setPlayerStatus] = useState<"all" | "in-progress" | "completed" | "not-started">("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [error, setError] = useState("");
  const [rolling, setRolling] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerId | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const flatHeroes = useMemo(() => allHeroes(), []);
  const activePlayers = useMemo(() => PLAYER_IDS.slice(0, playerCount), [playerCount]);

  const heroPool = useMemo(() => {
    return flatHeroes.filter((h) => {
      if (heroFilter !== "All" && h.role !== heroFilter) return false;
      if (!h.name.toLowerCase().includes(heroSearch.toLowerCase())) return false;
      if (poolTab === "favorites" && !favorites[h.name]) return false;
      return true;
    });
  }, [flatHeroes, heroFilter, heroSearch, poolTab, favorites]);

  const roleByHero = useMemo(() => {
    const out: Record<string, Role> = {};
    flatHeroes.forEach((h) => {
      out[h.name] = h.role;
    });
    return out;
  }, [flatHeroes]);

  const visiblePlayers = useMemo(() => {
    const rows = activePlayers
      .map((id) => {
        const info = progress[id];
        const pct = completionPercent(info);
        const status = pct >= 100 ? "completed" : info.completed > 0 ? "in-progress" : "not-started";
        const hero = lineup[id];
        const heroRole = hero ? roleByHero[hero] ?? null : null;
        const doneList = completedHeroes[id] ?? [];
        const heroIsDone = !!hero && doneList.includes(hero);
        return { id, name: playerNames[id], progress: info, hero, heroRole, status, pct, doneList, heroIsDone };
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
  }, [activePlayers, completedHeroes, roleByHero, lineup, playerNames, playerSearch, playerStatus, progress, sortMode]);

  const favCount = useMemo(() => Object.values(favorites).filter(Boolean).length, [favorites]);
  const toggleFav = useCallback(
    (name: string) => setFavorites((cur) => ({ ...cur, [name]: !cur[name] })),
    [setFavorites],
  );

  const pickHeroFor = useCallback(
    (playerId: PlayerId, taken: Set<string>) => {
      const role = playerRoles[playerId];
      const source = role === "All" ? flatHeroes : HERO_BY_ROLE[role].map((name) => ({ name, role }));
      const names = source.map((h) => h.name).filter((n) => !uniqueTeam || !taken.has(n));
      if (names.length === 0) return null;
      const weighted = names.flatMap((n) => (favorites[n] ? [n, n, n] : [n]));
      return randomItem(weighted);
    },
    [favorites, flatHeroes, playerRoles, uniqueTeam],
  );

  const addPickHistory = useCallback(
    (entries: Array<Omit<HistoryEntry, "id" | "at">>) => {
      if (entries.length === 0) return;
      const now = Date.now();
      const full: HistoryEntry[] = entries.map((e, i) => ({
        ...e,
        at: now + i,
        id: `${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      }));
      setHistory((cur) => [...full, ...cur].slice(0, 40));
    },
    [setHistory],
  );

  const runDraft = () => {
    setError("");
    setRolling(true);
    window.setTimeout(() => {
      const taken = new Set<string>();
      const next: Record<PlayerId, string | null> = { ...lineup };
      const newEntries: Array<Omit<HistoryEntry, "id" | "at">> = [];
      let any = false;
      for (const id of activePlayers) {
        const pick = pickHeroFor(id, taken);
        next[id] = pick;
        if (pick) {
          taken.add(pick);
          any = true;
          const role = flatHeroes.find((h) => h.name === pick)?.role;
          if (role) newEntries.push({ hero: pick, role, player: playerNames[id] });
        }
      }
      if (!any) setError("No heroes available. Adjust favorites or roles.");
      setLineup(next);
      addPickHistory(newEntries);
      setRolling(false);
    }, 420);
  };

  const rerollPlayer = (id: PlayerId) => {
    const taken = new Set(
      Object.entries(lineup)
        .filter(([pid, hero]) => Number(pid) !== id && hero)
        .map(([, hero]) => hero as string),
    );
    const pick = pickHeroFor(id, taken);
    if (!pick) {
      setError(`No reroll options for ${playerNames[id]}.`);
      return;
    }
    setError("");
    setLineup((cur) => ({ ...cur, [id]: pick }));
    const role = roleByHero[pick];
    if (role) addPickHistory([{ hero: pick, role, player: playerNames[id] }]);
  };

  const rerollAll = () => runDraft();

  const clearLineup = () => {
    if (!window.confirm("Clear current lineup?")) return;
    setLineup({ 1: null, 2: null, 3: null, 4: null, 5: null });
  };

  const clearFavorites = () => {
    if (!window.confirm("Clear all favorites?")) return;
    setFavorites({});
  };

  const clearPickHistory = () => {
    if (!window.confirm("Clear recent picks?")) return;
    setHistory([]);
  };

  const resetPlayerProgress = (id: PlayerId) => {
    if (!window.confirm(`Reset progress for ${playerNames[id]}?`)) return;
    setProgress((cur) => ({ ...cur, [id]: { ...cur[id], completed: 0, notes: "" } }));
    setCompletedHeroes((cur) => ({ ...cur, [id]: [] }));
  };

  const markComplete = (id: PlayerId) => {
    const hero = lineup[id];
    if (!hero) return;
    setError("");
    setCompletedHeroes((cur) => {
      const list = cur[id] ?? [];
      if (list.includes(hero)) return cur;
      return { ...cur, [id]: [...list, hero] };
    });
    setProgress((cur) => {
      const info = cur[id];
      return { ...cur, [id]: { ...info, completed: Math.min(999, info.completed + 1) } };
    });
    setCompletionStreak((cs) => {
      const next = cs + 1;
      setBestCompletionStreak((best) => Math.max(best, next));
      return next;
    });
  };

  const undoComplete = (id: PlayerId, hero: string) => {
    setCompletedHeroes((cur) => {
      const list = cur[id] ?? [];
      if (!list.includes(hero)) return cur;
      return { ...cur, [id]: list.filter((h) => h !== hero) };
    });
    setProgress((cur) => {
      const info = cur[id];
      return { ...cur, [id]: { ...info, completed: Math.max(0, info.completed - 1) } };
    });
    setCompletionStreak(0);
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
        const list = next[id] ?? [];
        next[id] = [...list, hero];
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
  };

  const copyLineup = async () => {
    const text = activePlayers
      .map((id) => `${playerNames[id]}: ${lineup[id] ?? "No pick"}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Clipboard copy not supported in this browser.");
    }
  };

  const registerResult = (result: "W" | "L") => {
    if (result === "W") setWins((v) => v + 1);
    else setLosses((v) => v + 1);
    const now = Date.now();
    setResults((cur) => [{ id: `${now}-${result}`, result, at: now }, ...cur].slice(0, 20));
  };

  const totalMatches = wins + losses;
  const winRate = totalMatches === 0 ? 0 : Math.round((wins / totalMatches) * 100);

  const anyHeroPicked = activePlayers.some((id) => !!lineup[id]);
  const totalCompleted = activePlayers.reduce((acc, id) => acc + (completedHeroes[id]?.length ?? 0), 0);
  const avgProgress = activePlayers.length
    ? Math.round(activePlayers.reduce((acc, id) => acc + completionPercent(progress[id]), 0) / activePlayers.length)
    : 0;

  const summaryData = useMemo(
    () => ({
      players: activePlayers.map((id) => ({
        name: playerNames[id],
        role: playerRoles[id],
        hero: lineup[id],
        completed: completedHeroes[id] ?? [],
        progress: progress[id],
      })),
      wins,
      losses,
      totalMatches,
      winRate,
      totalCompleted,
      avgProgress,
    }),
    [activePlayers, completedHeroes, lineup, losses, playerNames, playerRoles, progress, totalCompleted, totalMatches, winRate, wins, avgProgress],
  );

  const exportSummaryPng = () => {
    const w = 1100;
    const h = 760;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#0d0d11");
    grd.addColorStop(1, "#131319");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#f79a2e";
    ctx.font = "700 38px Inter, Segoe UI, sans-serif";
    ctx.fillText("OW2 Draft Summary", 48, 62);
    ctx.fillStyle = "#9b9aa3";
    ctx.font = "600 16px Inter, Segoe UI, sans-serif";
    ctx.fillText(`Generated ${new Date().toLocaleString()}`, 50, 90);

    const panel = (x: number, y: number, pw: number, ph: number, title: string) => {
      ctx.fillStyle = "#1a1a20";
      ctx.strokeStyle = "#2f2f3a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb34d";
      ctx.font = "700 16px Inter, Segoe UI, sans-serif";
      ctx.fillText(title, x + 16, y + 28);
    };

    panel(42, 118, 500, 586, "Players");
    panel(560, 118, 498, 268, "Match Stats");
    panel(560, 402, 498, 302, "Recent Match Results");

    ctx.fillStyle = "#f3f1ec";
    ctx.font = "600 14px Inter, Segoe UI, sans-serif";
    let y = 154;
    summaryData.players.forEach((p) => {
      const hero = p.hero ?? "No pick";
      const done = p.completed.length;
      const percent = completionPercent(p.progress);
      ctx.fillStyle = "#f3f1ec";
      ctx.font = "700 15px Inter, Segoe UI, sans-serif";
      ctx.fillText(`${p.name} (${p.role})`, 58, y + 18);
      ctx.fillStyle = "#9b9aa3";
      ctx.font = "600 13px Inter, Segoe UI, sans-serif";
      ctx.fillText(`Drafted: ${hero}`, 58, y + 38);
      ctx.fillText(`Completed heroes: ${done}   Progress: ${percent}%`, 58, y + 56);
      y += 86;
    });

    ctx.fillStyle = "#f3f1ec";
    ctx.font = "700 18px Inter, Segoe UI, sans-serif";
    ctx.fillText(`Wins: ${summaryData.wins}`, 580, 170);
    ctx.fillText(`Losses: ${summaryData.losses}`, 580, 200);
    ctx.fillText(`Matches: ${summaryData.totalMatches}`, 580, 230);
    ctx.fillText(`Win Rate: ${summaryData.winRate}%`, 580, 260);
    ctx.fillText(`Total Completed Heroes: ${summaryData.totalCompleted}`, 580, 290);
    ctx.fillText(`Average Progress: ${summaryData.avgProgress}%`, 580, 320);

    const resultsToShow = results.slice(0, 10);
    if (resultsToShow.length === 0) {
      ctx.fillStyle = "#9b9aa3";
      ctx.font = "600 14px Inter, Segoe UI, sans-serif";
      ctx.fillText("No recorded results yet.", 580, 446);
    } else {
      let ry = 438;
      resultsToShow.forEach((r, idx) => {
        ctx.fillStyle = r.result === "W" ? "#58c088" : "#ff6b6b";
        ctx.font = "700 15px Inter, Segoe UI, sans-serif";
        ctx.fillText(`#${resultsToShow.length - idx}  ${r.result === "W" ? "Win" : "Loss"}`, 580, ry);
        ctx.fillStyle = "#9b9aa3";
        ctx.font = "600 13px Inter, Segoe UI, sans-serif";
        ctx.fillText(new Date(r.at).toLocaleString(), 700, ry);
        ry += 26;
      });
    }

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `ow2-summary-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className={`ow2-root ${theme}`}>
      {/* STATS STRIP ---------------------------------------------------- */}
      <div className="stats-strip card">
        <div className="stat">
          <span className="stat-label"><Ic.Win /> Match results</span>
          <div className="stat-value">
            <strong>{wins}-{losses}</strong>
            <small>{winRate}% WR</small>
          </div>
          <div className="stat-actions">
            <button className="btn sm" type="button" onClick={() => registerResult("W")} title="Record a win">Win</button>
            <button className="btn sm ghost" type="button" onClick={() => registerResult("L")} title="Record a loss">Loss</button>
          </div>
        </div>
        <div className="stat">
          <span className="stat-label"><Ic.Sparkle /> Completion streak</span>
          <div className="stat-value">
            <strong>{completionStreak}</strong>
            <small>best {bestCompletionStreak}</small>
          </div>
          <div className="stat-actions">
            <button
              className="btn sm ghost"
              type="button"
              onClick={() => setCompletionStreak(0)}
              title="Reset streak"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="stat">
          <span className="stat-label"><Ic.Target /> Match stats</span>
          <div className="stat-value">
            <strong>{totalMatches}</strong>
            <small>matches played</small>
          </div>
          <div className="stat-actions">
            <button className="btn sm" type="button" onClick={rerollAll} disabled={rolling}>
              <Ic.Refresh /> Reroll all
            </button>
          </div>
        </div>
      </div>

      {/* TOOLBAR -------------------------------------------------------- */}
      <div className="ow2-toolbar card">
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
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
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
            Unique per team
          </label>
          <label className="toggle">
            <input type="checkbox" checked={manualOverride} onChange={(e) => setManualOverride(e.target.checked)} />
            Manual override
          </label>
          <button
            className={`btn primary glow ${rolling ? "rolling" : ""}`}
            type="button"
            onClick={runDraft}
            disabled={rolling}
          >
            <Ic.Dice />
            {rolling ? "Rolling..." : "Randomize"}
          </button>
          <button className="btn" type="button" onClick={finishAll} disabled={!anyHeroPicked} title="Mark every current pick as completed">
            <Ic.Trophy />
            Finish All
          </button>
          <button className="btn" type="button" onClick={copyLineup} disabled={!anyHeroPicked}>
            <Ic.Copy />
            Copy
          </button>
          <button className="btn ghost" type="button" onClick={clearLineup} disabled={!anyHeroPicked}>
            <Ic.Trash />
            Clear
          </button>
        </div>
      </div>

      {/* LAYOUT (sidebar + main) --------------------------------------- */}
      <div className="layout">
        {/* HERO POOL SIDEBAR ---------------------------- */}
        <aside className="card hero-sidebar">
          <div className="sidebar-head">
            <div className="section-title-group">
              <span className="section-eyebrow">Hero Pool</span>
              <h3>Favorites</h3>
            </div>
            <div className="pool-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`pool-tab ${poolTab === "all" ? "active" : ""}`}
                onClick={() => setPoolTab("all")}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                className={`pool-tab ${poolTab === "favorites" ? "active" : ""}`}
                onClick={() => setPoolTab("favorites")}
              >
                <Ic.Star filled={poolTab === "favorites"} /> {favCount}
              </button>
            </div>
          </div>

          <div className="sidebar-controls">
            <select value={heroFilter} onChange={(e) => setHeroFilter(e.target.value as RoleFilter)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              value={heroSearch}
              onChange={(e) => setHeroSearch(e.target.value)}
              placeholder="Search heroes..."
            />
          </div>

          <div className="sidebar-actions">
            <button className="btn sm ghost" type="button" onClick={clearFavorites} disabled={favCount === 0}>
              <Ic.Star /> Clear favs
            </button>
          </div>

          {heroPool.length === 0 ? (
            <div className="empty compact">
              <p>Nothing in this tab yet.</p>
            </div>
          ) : (
            <div className="hero-grid">
              {heroPool.map((hero) => (
                <div
                  key={hero.name}
                  className={`hero-chip role-${hero.role} ${favorites[hero.name] ? "favorited" : ""}`}
                >
                  <button
                    type="button"
                    className="hero-chip-main"
                    onClick={() => toggleFav(hero.name)}
                    title={favorites[hero.name] ? "Remove favorite" : "Add favorite"}
                  >
                    <HeroImage name={hero.name} size={36} />
                    <div className="hero-meta">
                      <span className="hero-chip-name">{hero.name}</span>
                      <small>{hero.role}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="hero-chip-fav"
                    onClick={() => toggleFav(hero.name)}
                    title={favorites[hero.name] ? "Remove from priority" : "Priority pick (favorite)"}
                    aria-pressed={!!favorites[hero.name]}
                  >
                    <Ic.Star filled={!!favorites[hero.name]} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="main-column">
          <div className="ow2-player-tools card">
            <input
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players..."
            />
            <select
              value={playerStatus}
              onChange={(e) => setPlayerStatus(e.target.value as "all" | "in-progress" | "completed" | "not-started")}
            >
              <option value="all">All statuses</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="not-started">Not started</option>
            </select>
          </div>

          {error && <div className="alert">{error}</div>}

          {/* PLAYER GRID */}
          <section className="player-grid">
            {visiblePlayers.length === 0 && (
              <div className="empty card">
                <h4>No players match your filter.</h4>
                <p>Clear the search or reset the status filter.</p>
              </div>
            )}
            {visiblePlayers.map((row) => (
              <article
                key={row.id}
                className={`player-card card ${row.hero ? "filled" : ""} ${rolling ? "is-rolling" : ""} role-${row.heroRole ?? "none"}`}
              >
                <header className="pc-head">
                  <div className="pc-meta">
                    <span className="pc-label">Player {row.id}</span>
                    <input
                      className="pc-name"
                      value={playerNames[row.id]}
                      onChange={(e) => setPlayerNames((p) => ({ ...p, [row.id]: e.target.value }))}
                      placeholder={`Player ${row.id}`}
                    />
                  </div>
                  <select
                    className="pc-role"
                    value={playerRoles[row.id]}
                    onChange={(e) => setPlayerRoles((p) => ({ ...p, [row.id]: e.target.value as RoleFilter }))}
                  >
                    {ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </header>

                <div className="pc-hero" key={row.hero ?? "empty"}>
                  <div className="pc-hero-thumb">
                    <HeroImage name={row.hero ?? null} size={60} />
                    {row.heroIsDone && (
                      <span className="pc-done-badge" title="Already completed">
                        <Ic.Check />
                      </span>
                    )}
                  </div>
                  <div className="pc-hero-info">
                    <span className="pc-hero-name">{row.hero ?? "Ready to roll"}</span>
                    <span className="pc-hero-role">{row.hero ? row.heroRole ?? "Unknown" : "No pick yet"}</span>
                  </div>
                </div>

                <div className="pc-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(100, row.pct)}%` }} />
                  </div>
                  <div className="pc-progress-meta">
                    <strong>{row.pct}%</strong>
                    <span>{row.progress.completed}/{row.progress.target}</span>
                  </div>
                </div>

                {row.progress.notes && <p className="notes">{row.progress.notes}</p>}

                <div className="pc-actions">
                  <button
                    className={`btn primary full ${row.heroIsDone ? "is-done" : ""}`}
                    type="button"
                    onClick={() => (row.heroIsDone ? row.hero && undoComplete(row.id, row.hero) : markComplete(row.id))}
                    disabled={!row.hero}
                  >
                    {row.heroIsDone ? (<><Ic.Undo /> Undo Complete</>) : (<><Ic.Check /> Mark Complete</>)}
                  </button>
                  <div className="pc-actions-row">
                    <button className="btn sm" type="button" onClick={() => rerollPlayer(row.id)} disabled={rolling}>
                      <Ic.Refresh /> Reroll
                    </button>
                    <button className="btn sm" type="button" onClick={() => setEditingPlayer(row.id)}>
                      <Ic.Edit /> Edit
                    </button>
                    <button className="btn sm ghost" type="button" onClick={() => resetPlayerProgress(row.id)}>
                      <Ic.Reset /> Reset
                    </button>
                  </div>
                </div>

                {row.doneList.length > 0 && (
                  <div className="pc-completed">
                    <span className="pc-completed-label">
                      <Ic.Trophy />
                      Completed · {row.doneList.length}
                    </span>
                    <div className="pc-completed-chips">
                      {row.doneList.slice(-6).map((h) => (
                        <button
                          key={h}
                          className="chip"
                          type="button"
                          title={`Click to undo ${h}`}
                          onClick={() => undoComplete(row.id, h)}
                        >
                          {h}
                        </button>
                      ))}
                      {row.doneList.length > 6 && (
                        <span className="chip more">+{row.doneList.length - 6}</span>
                      )}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>

          <section className="card summary">
            <button className="summary-head" type="button" onClick={() => setSummaryOpen((v) => !v)}>
              <div className="section-title-group">
                <span className="section-eyebrow"><Ic.Sparkle /> End result summary</span>
                <h3>Draft + progress + match outcome</h3>
              </div>
              <span className={`chev ${summaryOpen ? "open" : ""}`} aria-hidden>▾</span>
            </button>
            {summaryOpen && (
              <div className="summary-body">
                <div className="summary-grid">
                  {summaryData.players.map((p) => (
                    <div key={p.name} className="summary-player">
                      <strong>{p.name}</strong>
                      <span>{p.hero ?? "No pick"} · {p.role}</span>
                      <small>{p.completed.length} completed · {completionPercent(p.progress)}%</small>
                    </div>
                  ))}
                </div>
                <div className="summary-stats">
                  <span>Total completed heroes: <strong>{summaryData.totalCompleted}</strong></span>
                  <span>Matches: <strong>{summaryData.totalMatches}</strong></span>
                  <span>Wins/Losses: <strong>{summaryData.wins}/{summaryData.losses}</strong></span>
                  <span>Win rate: <strong>{summaryData.winRate}%</strong></span>
                  <span>Average progress: <strong>{summaryData.avgProgress}%</strong></span>
                </div>
                <div className="summary-actions">
                  <button className="btn" type="button" onClick={exportSummaryPng}>
                    <Ic.Copy /> Export PNG
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card history">
            <button
              type="button"
              className="history-head"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
            >
              <div className="section-title-group">
                <span className="section-eyebrow"><Ic.History /> Match history</span>
                <h3>Recent picks {history.length > 0 ? `· ${history.length}` : ""}</h3>
              </div>
              <span className={`chev ${historyOpen ? "open" : ""}`} aria-hidden>▾</span>
            </button>
            {historyOpen && (
              <>
                {history.length === 0 ? (
                  <div className="empty compact">
                    <p>Recent picks and match results will appear here.</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {history.map((h) => (
                      <div key={h.id} className={`history-row role-${h.role}`}>
                        <div className="history-thumb">
                          <HeroImage name={h.hero} size={28} />
                        </div>
                        <div className="history-meta">
                          <span className="history-hero">{h.hero}</span>
                          <small>{h.player} · {h.role}</small>
                        </div>
                        <span className="history-time">{formatRelative(h.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {history.length > 0 && (
                  <div className="history-foot">
                    <button className="btn sm ghost" type="button" onClick={clearPickHistory}>
                      <Ic.Trash /> Clear history
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card history">
            <div className="section-title-group">
              <span className="section-eyebrow"><Ic.Win /> Recent results</span>
              <h3>Match result history</h3>
            </div>
            {results.length === 0 ? (
              <div className="empty compact"><p>No results recorded yet.</p></div>
            ) : (
              <div className="result-list">
                {results.slice(0, 12).map((r) => (
                  <div key={r.id} className={`result-row ${r.result === "W" ? "win" : "loss"}`}>
                    <strong>{r.result === "W" ? "Win" : "Loss"}</strong>
                    <small>{new Date(r.at).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {editingPlayer !== null && (
        <EditPlayerModal
          playerName={playerNames[editingPlayer]}
          playerRole={playerRoles[editingPlayer]}
          value={progress[editingPlayer]}
          allHeroes={flatHeroes}
          roleByHero={roleByHero}
          currentHero={lineup[editingPlayer]}
          completedList={completedHeroes[editingPlayer] ?? []}
          allowOverride={manualOverride}
          onClose={() => setEditingPlayer(null)}
          onSaveProgress={(val) => {
            setProgress((cur) => ({ ...cur, [editingPlayer]: val }));
          }}
          onSetHero={(hero) => {
            setLineup((cur) => ({ ...cur, [editingPlayer]: hero }));
            if (hero) {
              const role = roleByHero[hero];
              if (role) addPickHistory([{ hero, role, player: playerNames[editingPlayer] }]);
            }
          }}
          onMarkManualComplete={(hero) => {
            if (!hero) return;
            setCompletedHeroes((cur) => {
              const list = cur[editingPlayer] ?? [];
              if (list.includes(hero)) return cur;
              return { ...cur, [editingPlayer]: [...list, hero] };
            });
            setProgress((cur) => ({
              ...cur,
              [editingPlayer]: {
                ...cur[editingPlayer],
                completed: Math.min(999, cur[editingPlayer].completed + 1),
              },
            }));
          }}
          onUndoManualComplete={(hero) => undoComplete(editingPlayer, hero)}
          onDone={() => setEditingPlayer(null)}
        />
      )}
    </div>
  );
}

function EditPlayerModal({
  playerName,
  playerRole,
  value,
  allHeroes,
  roleByHero,
  currentHero,
  completedList,
  allowOverride,
  onClose,
  onSaveProgress,
  onSetHero,
  onMarkManualComplete,
  onUndoManualComplete,
  onDone,
}: {
  playerName: string;
  playerRole: RoleFilter;
  value: ProgressInfo;
  allHeroes: { name: string; role: Role }[];
  roleByHero: Record<string, Role>;
  currentHero: string | null;
  completedList: string[];
  allowOverride: boolean;
  onClose: () => void;
  onSaveProgress: (v: ProgressInfo) => void;
  onSetHero: (hero: string | null) => void;
  onMarkManualComplete: (hero: string | null) => void;
  onUndoManualComplete: (hero: string) => void;
  onDone: () => void;
}) {
  const [completed, setCompleted] = useState(value.completed);
  const [target, setTarget] = useState(value.target);
  const [notes, setNotes] = useState(value.notes);
  const [heroChoice, setHeroChoice] = useState<string>(currentHero ?? "");
  const [completionHeroChoice, setCompletionHeroChoice] = useState<string>(currentHero ?? "");

  const selectableHeroes = useMemo(() => {
    if (allowOverride || playerRole === "All") return allHeroes;
    return allHeroes.filter((h) => h.role === playerRole);
  }, [allowOverride, allHeroes, playerRole]);

  const save = () => {
    const safeTarget = Math.max(1, Math.floor(target));
    const safeCompleted = Math.max(0, Math.min(999, Math.floor(completed)));
    onSaveProgress({ completed: safeCompleted, target: safeTarget, notes: notes.trim() });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h4>
          <span className="section-eyebrow">Edit progress</span>
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
            Draft hero
            <select value={heroChoice} onChange={(e) => setHeroChoice(e.target.value)}>
              <option value="">No pick</option>
              {selectableHeroes.map((h) => (
                <option key={h.name} value={h.name}>{h.name} · {h.role}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Manual complete hero
            <select value={completionHeroChoice} onChange={(e) => setCompletionHeroChoice(e.target.value)}>
              <option value="">Choose hero...</option>
              {allHeroes.map((h) => (
                <option key={h.name} value={h.name}>{h.name} · {h.role}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Notes
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {completedList.length > 0 && (
          <div className="modal-completed">
            <span className="section-eyebrow">Completed heroes</span>
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
          <button className="btn" type="button" onClick={() => onSetHero(heroChoice || null)}>
            <Ic.Edit /> Set Hero
          </button>
          <button className="btn" type="button" onClick={() => onMarkManualComplete(completionHeroChoice || null)}>
            <Ic.Check /> Add Completion
          </button>
          <button className="btn primary" type="button" onClick={save}>
            <Ic.Check /> Save Progress
          </button>
          <button className="btn primary" type="button" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
