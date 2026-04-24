import { useMemo, useState } from "react";

const ROLE_ORDER = ["All", "Tank", "Damage", "Support"] as const;
type RoleFilter = (typeof ROLE_ORDER)[number];
type Role = Exclude<RoleFilter, "All">;
type PlayerId = 1 | 2 | 3 | 4 | 5;

const HERO_BY_ROLE: Record<Role, string[]> = {
  Tank: [
    "D.Va",
    "Domina",
    "Doomfist",
    "Hazard",
    "Junker Queen",
    "Mauga",
    "Orisa",
    "Ramattra",
    "Reinhardt",
    "Roadhog",
    "Sigma",
    "Winston",
    "Wrecking Ball",
    "Zarya",
  ],
  Damage: [
    "Anran",
    "Ashe",
    "Bastion",
    "Cassidy",
    "Echo",
    "Emre",
    "Freja",
    "Genji",
    "Hanzo",
    "Junkrat",
    "Mei",
    "Pharah",
    "Reaper",
    "Sojourn",
    "Soldier: 76",
    "Sombra",
    "Symmetra",
    "Torbjorn",
    "Tracer",
    "Vendetta",
    "Venture",
    "Widowmaker",
  ],
  Support: [
    "Ana",
    "Baptiste",
    "Brigitte",
    "Illari",
    "Jetpack Cat",
    "Juno",
    "Kiriko",
    "Lifeweaver",
    "Lucio",
    "Mercy",
    "Mizuki",
    "Moira",
    "Wuyang",
    "Zenyatta",
  ],
};

const PLAYER_IDS: PlayerId[] = [1, 2, 3, 4, 5];
const DEFAULT_NAMES: Record<PlayerId, string> = {
  1: "Player 1",
  2: "Player 2",
  3: "Player 3",
  4: "Player 4",
  5: "Player 5",
};

function allHeroes() {
  return (Object.entries(HERO_BY_ROLE) as [Role, string[]][])
    .flatMap(([role, heroes]) => heroes.map((name) => ({ name, role })));
}

function roleFor(heroName: string): Role | null {
  if (HERO_BY_ROLE.Tank.includes(heroName)) return "Tank";
  if (HERO_BY_ROLE.Damage.includes(heroName)) return "Damage";
  if (HERO_BY_ROLE.Support.includes(heroName)) return "Support";
  return null;
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export default function Overwatch2RandomHeroPickerMultiRoleLock() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [playerCount, setPlayerCount] = useState(3);
  const [playerNames, setPlayerNames] = useState<Record<PlayerId, string>>(DEFAULT_NAMES);
  const [playerRoles, setPlayerRoles] = useState<Record<PlayerId, RoleFilter>>({
    1: "All",
    2: "All",
    3: "All",
    4: "All",
    5: "All",
  });
  const [heroFilter, setHeroFilter] = useState<RoleFilter>("All");
  const [search, setSearch] = useState("");
  const [banSet, setBanSet] = useState<Record<string, boolean>>({});
  const [uniqueAcrossTeam, setUniqueAcrossTeam] = useState(true);
  const [lineup, setLineup] = useState<Record<PlayerId, string | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
  });
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState("");

  const activePlayers = PLAYER_IDS.slice(0, playerCount);
  const heroPool = useMemo(() => {
    const list = allHeroes();
    return list.filter((hero) => {
      if (heroFilter !== "All" && hero.role !== heroFilter) return false;
      if (!hero.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [heroFilter, search]);

  const toggleBan = (name: string) => {
    setBanSet((current) => ({ ...current, [name]: !current[name] }));
  };

  const runDraft = () => {
    const nextLineup: Record<PlayerId, string | null> = { ...lineup };
    const taken = new Set<string>();
    let hasAtLeastOne = false;

    for (const playerId of activePlayers) {
      const role = playerRoles[playerId];
      const source =
        role === "All"
          ? allHeroes()
          : HERO_BY_ROLE[role].map((name) => ({ name, role }));
      const available = source
        .map((entry) => entry.name)
        .filter((name) => !banSet[name] && (!uniqueAcrossTeam || !taken.has(name)));

      if (available.length === 0) {
        nextLineup[playerId] = null;
        continue;
      }
      hasAtLeastOne = true;
      const picked = randomItem(available);
      nextLineup[playerId] = picked;
      taken.add(picked);
    }

    if (!hasAtLeastOne) {
      setError("No valid heroes available. Remove bans or adjust role filters.");
      return;
    }
    setError("");
    setLineup(nextLineup);
    setHistory((current) =>
      [JSON.stringify(nextLineup), ...current].slice(0, 8),
    );
  };

  const rerollPlayer = (playerId: PlayerId) => {
    const role = playerRoles[playerId];
    const taken = new Set(
      Object.entries(lineup)
        .filter(([id, hero]) => Number(id) !== playerId && hero)
        .map(([, hero]) => hero as string),
    );

    const source =
      role === "All"
        ? allHeroes()
        : HERO_BY_ROLE[role].map((name) => ({ name, role }));
    const pool = source
      .map((entry) => entry.name)
      .filter((name) => !banSet[name] && (!uniqueAcrossTeam || !taken.has(name)));

    if (pool.length === 0) {
      setError(`No reroll options available for ${playerNames[playerId]}.`);
      return;
    }
    setError("");
    setLineup((current) => ({ ...current, [playerId]: randomItem(pool) }));
  };

  const copyLineup = async () => {
    const text = activePlayers
      .map((id) => `${playerNames[id]}: ${lineup[id] ?? "No pick"}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Clipboard copy failed in this browser.");
    }
  };

  return (
    <div className={`draft-root ${theme}`}>
      <section className="draft-toolbar">
        <div className="toolbar-group">
          <label>
            Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}>
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
            Filter
            <select value={heroFilter} onChange={(e) => setHeroFilter(e.target.value as RoleFilter)}>
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={uniqueAcrossTeam}
            onChange={(e) => setUniqueAcrossTeam(e.target.checked)}
          />
          Unique heroes in team
        </label>
      </section>

      <section className="players-grid">
        {activePlayers.map((id) => (
          <article key={id} className="player-card">
            <input
              className="name-input"
              value={playerNames[id]}
              onChange={(e) => setPlayerNames((p) => ({ ...p, [id]: e.target.value }))}
            />
            <select
              value={playerRoles[id]}
              onChange={(e) =>
                setPlayerRoles((p) => ({ ...p, [id]: e.target.value as RoleFilter }))
              }
            >
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <div className="picked-hero">{lineup[id] ?? "Awaiting draft..."}</div>
            <button onClick={() => rerollPlayer(id)} type="button">
              Reroll player
            </button>
          </article>
        ))}
      </section>

      <section className="actions">
        <button className="primary" type="button" onClick={runDraft}>
          Randomize Team
        </button>
        <button type="button" onClick={copyLineup}>
          Copy lineup
        </button>
        <button
          type="button"
          onClick={() =>
            setLineup({
              1: null,
              2: null,
              3: null,
              4: null,
              5: null,
            })
          }
        >
          Clear
        </button>
      </section>

      <section className="ban-panel">
        <div className="ban-head">
          <h3>Hero Ban List</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search heroes..."
          />
        </div>
        <div className="hero-list">
          {heroPool.map((hero) => (
            <button
              key={hero.name}
              className={banSet[hero.name] ? "hero-chip banned" : "hero-chip"}
              onClick={() => toggleBan(hero.name)}
              type="button"
            >
              <span>{hero.name}</span>
              <small>{hero.role}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="history-panel">
        <h3>Recent Drafts</h3>
        {history.length === 0 && <p>No drafts yet.</p>}
        {history.map((item, index) => {
          const parsed = JSON.parse(item) as Record<string, string | null>;
          return (
            <div key={index} className="history-item">
              {activePlayers.map((id) => {
                const hero = parsed[id] ?? "No pick";
                return (
                  <span key={id}>
                    {playerNames[id]} - {hero}
                    {hero !== "No pick" ? ` (${roleFor(hero) ?? "Role?"})` : ""}
                  </span>
                );
              })}
            </div>
          );
        })}
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
