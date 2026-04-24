import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

const ROLE_ORDER = ["All", "Tank", "Damage", "Support"] as const;
type RoleFilter = (typeof ROLE_ORDER)[number];
type Role = Exclude<RoleFilter, "All">;
type PlayerId = 1 | 2 | 3 | 4 | 5;
type SortMode = "name" | "progress" | "completion" | "status";

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

type ProgressInfo = { completed: number; target: number; notes: string };
type ProgressByPlayer = Record<PlayerId, ProgressInfo>;

const initialProgress: ProgressByPlayer = {
  1: { completed: 0, target: 10, notes: "" },
  2: { completed: 0, target: 10, notes: "" },
  3: { completed: 0, target: 10, notes: "" },
  4: { completed: 0, target: 10, notes: "" },
  5: { completed: 0, target: 10, notes: "" },
};

const defaultNames: Record<PlayerId, string> = { 1: "Player 1", 2: "Player 2", 3: "Player 3", 4: "Player 4", 5: "Player 5" };

function allHeroes() {
  return (Object.entries(HERO_BY_ROLE) as [Role, string[]][])
    .flatMap(([role, heroes]) => heroes.map((name) => ({ name, role })));
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function completionPercent(p: ProgressInfo) {
  if (p.target <= 0) return 0;
  return Math.round((p.completed / p.target) * 100);
}

function heroFallback(name: string) {
  const parts = name.split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function Overwatch2RandomHeroPickerMultiRoleLock() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [playerCount, setPlayerCount] = useState(3);
  const [playerNames, setPlayerNames] = useState<Record<PlayerId, string>>(defaultNames);
  const [playerRoles, setPlayerRoles] = useState<Record<PlayerId, RoleFilter>>({ 1: "All", 2: "All", 3: "All", 4: "All", 5: "All" });
  const [lineup, setLineup] = useState<Record<PlayerId, string | null>>({ 1: null, 2: null, 3: null, 4: null, 5: null });
  const [banSet, setBanSet] = useState<Record<string, boolean>>({});
  const [uniqueAcrossTeam, setUniqueAcrossTeam] = useState(true);
  const [heroSearch, setHeroSearch] = useState("");
  const [heroFilter, setHeroFilter] = useState<RoleFilter>("All");
  const [isRolling, setIsRolling] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const [progress, setProgress] = useState<ProgressByPlayer>(initialProgress);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerFilterStatus, setPlayerFilterStatus] = useState<"all" | "in-progress" | "completed" | "not-started">("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [editingPlayer, setEditingPlayer] = useState<PlayerId | null>(null);
  const [missingImages, setMissingImages] = useState<Record<string, boolean>>({});

  const activePlayers = PLAYER_IDS.slice(0, playerCount);
  const allHeroList = useMemo(() => allHeroes(), []);

  const heroPool = useMemo(() => {
    return allHeroList.filter((hero) => {
      if (heroFilter !== "All" && hero.role !== heroFilter) return false;
      if (!hero.name.toLowerCase().includes(heroSearch.toLowerCase())) return false;
      return true;
    });
  }, [allHeroList, heroFilter, heroSearch]);

  const visiblePlayers = useMemo(() => {
    const rows = activePlayers
      .map((id) => ({
        id,
        name: playerNames[id],
        progress: progress[id],
        hero: lineup[id],
        status:
          completionPercent(progress[id]) >= 100
            ? "completed"
            : progress[id].completed > 0
              ? "in-progress"
              : "not-started",
      }))
      .filter((row) => row.name.toLowerCase().includes(playerSearch.toLowerCase()))
      .filter((row) => playerFilterStatus === "all" || row.status === playerFilterStatus);

    rows.sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "progress") return completionPercent(b.progress) - completionPercent(a.progress);
      if (sortMode === "completion") return b.progress.completed - a.progress.completed;
      return a.status.localeCompare(b.status);
    });
    return rows;
  }, [activePlayers, lineup, playerFilterStatus, playerNames, playerSearch, progress, sortMode]);

  const toggleBan = (name: string) => setBanSet((current) => ({ ...current, [name]: !current[name] }));

  const runDraft = () => {
    setIsRolling(true);
    setError("");
    window.setTimeout(() => {
      const next: Record<PlayerId, string | null> = { ...lineup };
      const taken = new Set<string>();
      let found = false;

      for (const playerId of activePlayers) {
        const role = playerRoles[playerId];
        const pool = (role === "All" ? allHeroList : HERO_BY_ROLE[role].map((name) => ({ name, role })))
          .map((h) => h.name)
          .filter((name) => !banSet[name] && (!uniqueAcrossTeam || !taken.has(name)));
        if (pool.length === 0) {
          next[playerId] = null;
          continue;
        }
        const picked = randomItem(pool);
        found = true;
        next[playerId] = picked;
        taken.add(picked);
      }

      if (!found) {
        setError("No valid heroes available. Remove bans or change role filters.");
        setIsRolling(false);
        return;
      }

      setLineup(next);
      setHistory((prev) => [JSON.stringify(next), ...prev].slice(0, 10));
      setIsRolling(false);
    }, 600);
  };

  const rerollPlayer = (playerId: PlayerId) => {
    const role = playerRoles[playerId];
    const takenByOthers = new Set(
      Object.entries(lineup)
        .filter(([id, hero]) => Number(id) !== playerId && hero)
        .map(([, hero]) => hero as string),
    );
    const pool = (role === "All" ? allHeroList : HERO_BY_ROLE[role].map((name) => ({ name, role })))
      .map((h) => h.name)
      .filter((name) => !banSet[name] && (!uniqueAcrossTeam || !takenByOthers.has(name)));
    if (pool.length === 0) {
      setError(`No reroll options left for ${playerNames[playerId]}.`);
      return;
    }
    setError("");
    setLineup((prev) => ({ ...prev, [playerId]: randomItem(pool) }));
  };

  const updateProgress = (playerId: PlayerId, completed: number, target: number, notes: string) => {
    setProgress((prev) => ({
      ...prev,
      [playerId]: {
        completed: clampInt(completed, 0, 999),
        target: clampInt(target, 1, 999),
        notes: notes.trim(),
      },
    }));
  };

  const resetPlayerProgress = (playerId: PlayerId) => {
    if (!window.confirm(`Reset completion for ${playerNames[playerId]}?`)) return;
    setProgress((prev) => ({ ...prev, [playerId]: { completed: 0, target: prev[playerId].target, notes: "" } }));
  };

  const resetAllProgress = () => {
    if (!window.confirm("Reset progress for all visible players?")) return;
    setProgress((prev) => {
      const next = { ...prev };
      for (const p of activePlayers) next[p] = { ...next[p], completed: 0, notes: "" };
      return next;
    });
  };

  const clearAll = () => {
    if (!window.confirm("Clear lineup and bans?")) return;
    setLineup({ 1: null, 2: null, 3: null, 4: null, 5: null });
    setBanSet({});
    setError("");
  };

  const copyLineup = async () => {
    const text = activePlayers.map((p) => `${playerNames[p]}: ${lineup[p] ?? "No pick"}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Unable to copy lineup in this browser.");
    }
  };

  return (
    <motion.div
      className={`draft-root ${theme}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <section className="draft-toolbar glass">
        <div className="toolbar-group">
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
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hero Filter
            <select value={heroFilter} onChange={(e) => setHeroFilter(e.target.value as RoleFilter)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="name">Name</option>
              <option value="progress">Progress %</option>
              <option value="completion">Completed #</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
        <div className="toolbar-right">
          <label className="toggle">
            <input type="checkbox" checked={uniqueAcrossTeam} onChange={(e) => setUniqueAcrossTeam(e.target.checked)} />
            Unique team picks
          </label>
          <motion.button whileTap={{ scale: 0.97 }} className="btn subtle" onClick={resetAllProgress} type="button">
            Reset Progress
          </motion.button>
        </div>
      </section>

      <section className="player-tools glass">
        <input
          value={playerSearch}
          onChange={(e) => setPlayerSearch(e.target.value)}
          placeholder="Search players..."
        />
        <select value={playerFilterStatus} onChange={(e) => setPlayerFilterStatus(e.target.value as "all" | "in-progress" | "completed" | "not-started")}>
          <option value="all">All statuses</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="not-started">Not started</option>
        </select>
      </section>

      <section className="players-grid">
        <AnimatePresence mode="popLayout">
          {visiblePlayers.length === 0 && (
            <motion.div className="empty-state glass" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h4>No players match your filter.</h4>
              <p>Try clearing search or selecting a different status.</p>
            </motion.div>
          )}
          {visiblePlayers.map((row) => {
            const heroName = row.hero;
            const pct = completionPercent(row.progress);
            return (
              <motion.article
                key={row.id}
                className="player-card glass"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                layout
                transition={{ duration: 0.2 }}
              >
                <div className="player-head">
                  <input
                    className="name-input"
                    value={playerNames[row.id]}
                    onChange={(e) => setPlayerNames((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  />
                  <select
                    value={playerRoles[row.id]}
                    onChange={(e) =>
                      setPlayerRoles((prev) => ({ ...prev, [row.id]: e.target.value as RoleFilter }))
                    }
                  >
                    {ROLE_ORDER.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hero-slot">
                  <div className="hero-thumb" aria-hidden="true">
                    {heroName && HERO_IMAGE_MAP[heroName] && !missingImages[heroName] ? (
                      <img
                        src={HERO_IMAGE_MAP[heroName]}
                        alt={heroName}
                        onError={() => setMissingImages((prev) => ({ ...prev, [heroName]: true }))}
                      />
                    ) : (
                      <span>{heroName ? heroFallback(heroName) : "?"}</span>
                    )}
                  </div>
                  <div>
                    <p className="hero-name">{heroName ?? "Awaiting draft..."}</p>
                    <p className="hero-meta">{heroName ? `Role: ${allHeroList.find((h) => h.name === heroName)?.role ?? "Unknown"}` : "No hero picked yet"}</p>
                  </div>
                </div>

                <div className="progress-wrap">
                  <div className="progress-meta">
                    <strong>{pct}%</strong>
                    <span>{row.progress.completed}/{row.progress.target} complete</span>
                  </div>
                  <div className="progress-bar">
                    <motion.div
                      className="progress-fill"
                      animate={{ width: `${Math.min(100, pct)}%` }}
                      transition={{ duration: 0.35 }}
                    />
                  </div>
                </div>

                <div className="card-actions">
                  <motion.button whileTap={{ scale: 0.96 }} className="btn primary" onClick={() => rerollPlayer(row.id)} type="button">
                    Reroll
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} className="btn" onClick={() => setEditingPlayer(row.id)} type="button">
                    Edit Progress
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} className="btn subtle" onClick={() => resetPlayerProgress(row.id)} type="button">
                    Reset
                  </motion.button>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </section>

      <section className="actions glass">
        <motion.button whileTap={{ scale: 0.97 }} className="btn primary big" type="button" onClick={runDraft} disabled={isRolling}>
          {isRolling ? "Rolling..." : "Randomize Team"}
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} className="btn" type="button" onClick={copyLineup}>
          Copy Lineup
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} className="btn subtle" type="button" onClick={clearAll}>
          Clear Picks + Bans
        </motion.button>
      </section>

      <section className="ban-panel glass">
        <div className="ban-head">
          <h3>Hero Ban List</h3>
          <input value={heroSearch} onChange={(e) => setHeroSearch(e.target.value)} placeholder="Search heroes..." />
        </div>
        {heroPool.length === 0 ? (
          <div className="empty-state compact">
            <p>No heroes found for this filter.</p>
          </div>
        ) : (
          <div className="hero-list">
            {heroPool.map((hero) => (
              <motion.button
                key={hero.name}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className={banSet[hero.name] ? "hero-chip banned" : "hero-chip"}
                onClick={() => toggleBan(hero.name)}
                type="button"
              >
                <span>{hero.name}</span>
                <small>{hero.role}</small>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      <section className="history-panel glass">
        <h3>Recent Drafts</h3>
        {history.length === 0 && (
          <div className="empty-state compact">
            <p>No drafts yet. Randomize to create your first lineup.</p>
          </div>
        )}
        {history.map((raw, index) => {
          const parsed = JSON.parse(raw) as Record<string, string | null>;
          return (
            <div key={index} className="history-item">
              {activePlayers.map((id) => (
                <span key={id}>
                  {playerNames[id]}: {parsed[id] ?? "No pick"}
                </span>
              ))}
            </div>
          );
        })}
      </section>

      <AnimatePresence>
        {editingPlayer !== null && (
          <ProgressModal
            playerName={playerNames[editingPlayer]}
            value={progress[editingPlayer]}
            onClose={() => setEditingPlayer(null)}
            onSave={(next) => {
              updateProgress(editingPlayer, next.completed, next.target, next.notes);
              setEditingPlayer(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p className="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProgressModal({
  playerName,
  value,
  onClose,
  onSave,
}: {
  playerName: string;
  value: ProgressInfo;
  onClose: () => void;
  onSave: (value: ProgressInfo) => void;
}) {
  const [completed, setCompleted] = useState(value.completed);
  const [target, setTarget] = useState(value.target);
  const [notes, setNotes] = useState(value.notes);

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal" initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>
        <h4>Edit Progress - {playerName}</h4>
        <div className="modal-grid">
          <label>
            Completed
            <input type="number" value={completed} min={0} onChange={(e) => setCompleted(Number(e.target.value))} />
          </label>
          <label>
            Target
            <input type="number" value={target} min={1} onChange={(e) => setTarget(Number(e.target.value))} />
          </label>
          <label className="wide">
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn subtle" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSave({ completed, target, notes })} type="button">
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
