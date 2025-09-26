// src/components/Overwatch2RandomHeroPickerMultiRoleLock.tsx
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shuffle, Dice5, Filter, Trash2, History, Repeat,
  CheckCircle2, Undo2, Trophy, Users, User
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/* ---------- Hero Data ---------- */
const HEROES: Record<"Tank" | "Damage" | "Support", string[]> = {
  Tank: ["D.Va","Doomfist","Hazard","Junker Queen","Mauga","Orisa","Ramattra","Reinhardt","Roadhog","Sigma","Winston","Wrecking Ball","Zarya"],
  Damage: ["Ashe","Bastion","Cassidy","Echo","Freja","Genji","Hanzo","Junkrat","Mei","Pharah","Reaper","Sojourn","Soldier: 76","Sombra","Symmetra","Torbjörn","Tracer","Venture","Widowmaker"],
  Support: ["Ana","Baptiste","Brigitte","Illari","Juno","Kiriko","Lifeweaver","Lúcio","Mercy","Moira","Zenyatta","Wuyang"],
};
const ALL_ROLES = ["All", "Tank", "Damage", "Support"] as const;
type Role = typeof ALL_ROLES[number];
type RoleKey = keyof typeof HEROES;
type HeroInfo = { name: string; role: RoleKey };

const ALL_HEROES: HeroInfo[] = (Object.entries(HEROES) as [RoleKey, string[]][])
  .flatMap(([role, list]) => list.map((name) => ({ name, role })));

/* ---------- Players ---------- */
type PlayerNum = 1 | 2 | 3 | 4 | 5;
const PLAYERS: PlayerNum[] = [1, 2, 3, 4, 5];

/* ---------- LocalStorage keys ---------- */
const K = {
  players: "ow2_multi_players",
  roles: "ow2_multi_roles",
  names: "ow2_multi_names",
  listRole: "ow2_multi_list_role",
  excluded: "ow2_multi_excluded",
  challenge: "ow2_multi_challenge",
  norepeat: "ow2_multi_norepeat",
  completed: "ow2_multi_completed",
  history: "ow2_multi_history_global",
  historyBy: "ow2_multi_history_by_player",
} as const;

export default function Overwatch2RandomHeroPickerMultiRoleLock() {
  /* players 1–5 */
  const [playersCount, setPlayersCount] = useState<number>(() => {
    const n = Number(localStorage.getItem(K.players));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 2;
  });
  const activePlayers = useMemo<PlayerNum[]>(() => PLAYERS.slice(0, playersCount), [playersCount]);

  /* roles per player */
  const [roles, setRoles] = useState<Record<PlayerNum, Role>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(K.roles) || "{}") as Partial<Record<PlayerNum, Role>>;
      const r: Record<PlayerNum, Role> = { 1:"All",2:"All",3:"All",4:"All",5:"All" };
      PLAYERS.forEach((p) => { r[p] = parsed?.[p] ?? "All"; });
      return r;
    } catch { return { 1:"All",2:"All",3:"All",4:"All",5:"All" }; }
  });

  /* names per player (optional) */
  const [names, setNames] = useState<Record<PlayerNum, string>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(K.names) || "{}") as Partial<Record<PlayerNum, string>>;
      const n: Record<PlayerNum, string> = { 1:"Player 1",2:"Player 2",3:"Player 3",4:"Player 4",5:"Player 5" };
      PLAYERS.forEach((p) => { n[p] = parsed?.[p] ?? `Player ${p}`; });
      return n;
    } catch { return { 1:"Player 1",2:"Player 2",3:"Player 3",4:"Player 4",5:"Player 5" }; }
  });

  /* filters & state */
  const [listRole, setListRole] = useState<Role>(() => (localStorage.getItem(K.listRole) as Role) || "All");
  const [query, setQuery] = useState("");
  const [excluded, setExcluded] = useState<Record<string, boolean>>(
    () => { try { return JSON.parse(localStorage.getItem(K.excluded) || "{}"); } catch { return {}; } }
  );
  const [challengeMode, setChallengeMode] = useState<boolean>(() => {
    const raw = localStorage.getItem(K.challenge);
    return raw === null ? true : raw === "true";
  });
  const [completedByPlayer, setCompletedByPlayer] =
    useState<Record<PlayerNum, Record<string, boolean>>>(() => {
      try { return JSON.parse(localStorage.getItem(K.completed) || "{}"); } catch { return {} as any; }
    });

  const [noRepeat, setNoRepeat] = useState<boolean>(() => localStorage.getItem(K.norepeat) === "true");
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(K.history) || "[]"); } catch { return []; }
  });
  const [historyByPlayer, setHistoryByPlayer] =
    useState<Record<PlayerNum, string[]>>(() => {
      try { return JSON.parse(localStorage.getItem(K.historyBy) || "{}"); } catch { return {} as any; }
    });

  const [picked, setPicked] = useState<Record<PlayerNum, string | null>>(
    {1:null,2:null,3:null,4:null,5:null}
  );
  const [isRolling, setIsRolling] = useState(false);

  /* persist */
  useEffect(() => localStorage.setItem(K.players, String(playersCount)), [playersCount]);
  useEffect(() => localStorage.setItem(K.roles, JSON.stringify(roles)), [roles]);
  useEffect(() => localStorage.setItem(K.names, JSON.stringify(names)), [names]);
  useEffect(() => localStorage.setItem(K.listRole, listRole), [listRole]);
  useEffect(() => localStorage.setItem(K.excluded, JSON.stringify(excluded)), [excluded]);
  useEffect(() => localStorage.setItem(K.challenge, String(challengeMode)), [challengeMode]);
  useEffect(() => localStorage.setItem(K.completed, JSON.stringify(completedByPlayer)), [completedByPlayer]);
  useEffect(() => localStorage.setItem(K.norepeat, String(noRepeat)), [noRepeat]);
  useEffect(() => localStorage.setItem(K.history, JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem(K.historyBy, JSON.stringify(historyByPlayer)), [historyByPlayer]);

  /* helpers */
  const byRole = (role: Role) =>
    role === "All" ? ALL_HEROES : ALL_HEROES.filter((h) => h.role === (role as RoleKey));
  const listBase = useMemo(() => byRole(listRole), [listRole]);

  const baseByPlayer = useMemo(() => {
    const map = {} as Record<PlayerNum, HeroInfo[]>;
    PLAYERS.forEach((p) => { map[p] = byRole(roles[p]); });
    return map;
  }, [roles]);

  const visibleHeroes = useMemo(
    () => listBase.filter((h) => h.name.toLowerCase().includes(query.toLowerCase())),
    [listBase, query]
  );

  function computeEligible(base: HeroInfo[], player: PlayerNum) {
    const excludedSet = new Set(Object.entries(excluded).filter(([, v]) => v).map(([k]) => k));
    const completedForPlayer = new Set(
      Object.entries(completedByPlayer[player] || {}).filter(([, v]) => v).map(([k]) => k)
    );
    let pool = base.map((h) => h.name).filter((n) => !excludedSet.has(n));
    if (challengeMode) pool = pool.filter((n) => !completedForPlayer.has(n));
    if (!noRepeat) return pool;
    const used = new Set(history);
    const remaining = pool.filter((n) => !used.has(n));
    return remaining.length > 0 ? remaining : pool;
  }

  const eligibleByPlayer = useMemo(() => {
    const map = {} as Record<PlayerNum, string[]>;
    PLAYERS.forEach((p) => { map[p] = computeEligible(baseByPlayer[p], p); });
    return map;
  }, [baseByPlayer, excluded, completedByPlayer, challengeMode, noRepeat, history]);

  /* rolling */
  function roll() {
    if (playersCount === 1) return singleRoll(1);
    const pools: Record<PlayerNum, string[]> = {} as any;
    activePlayers.forEach((p) => { pools[p] = eligibleByPlayer[p].slice(); });

    if (activePlayers.every((p) => pools[p].length === 0)) {
      const cleared: Partial<Record<PlayerNum, null>> = {};
      activePlayers.forEach((p) => (cleared[p] = null));
      setPicked((prev) => ({ ...prev, ...cleared } as Record<PlayerNum, string | null>));
      return;
    }

    setIsRolling(true);
    const duration = 900, interval = 60; let elapsed = 0;

    const id = setInterval(() => {
      const chosen = new Set<string>();
      const next = {} as Record<PlayerNum, string | null>;

      for (const p of activePlayers) {
        const uniquePool = pools[p].filter((n) => !chosen.has(n));
        const pickFrom = uniquePool.length > 0 ? uniquePool : pools[p];
        next[p] = pickFrom.length > 0 ? pickFrom[Math.floor(Math.random() * pickFrom.length)] : null;
        if (next[p]) chosen.add(next[p] as string);
      }

      setPicked((prev) => ({ ...prev, ...next }));
      elapsed += interval;
      if (elapsed >= duration) {
        clearInterval(id);
        setIsRolling(false);
        finalizeMulti(next);
      }
    }, interval);
  }

  function singleRoll(p: PlayerNum) {
    const pool = eligibleByPlayer[p];
    if (pool.length === 0) { setPicked((prev) => ({ ...prev, [p]: null })); return; }
    setIsRolling(true);
    const duration = 900, interval = 60; let elapsed = 0;
    const id = setInterval(() => {
      const n = pool[Math.floor(Math.random() * pool.length)];
      setPicked((prev) => ({ ...prev, [p]: n }));
      elapsed += interval;
      if (elapsed >= duration) {
        clearInterval(id);
        setIsRolling(false);
        finalizeOne(p, n);
      }
    }, interval);
  }

  function finalizeOne(p: PlayerNum, n: string | null) {
    if (!n) return;
    setHistory((prev) => [n, ...prev.filter((x) => x !== n)].slice(0, 20));
    setHistoryByPlayer((prev) => ({
      ...prev,
      [p]: [n, ...((prev[p] || []).filter((x) => x !== n))].slice(0, 10),
    }));
  }

  function finalizeMulti(picks: Record<PlayerNum, string | null>) {
    const namesPicked = activePlayers.map((p) => picks[p]).filter(Boolean) as string[];
    if (namesPicked.length === 0) return;
    setHistory((prev) => [...namesPicked, ...prev.filter((x) => !namesPicked.includes(x))].slice(0, 20));
    setHistoryByPlayer((prev) => {
      const updated = { ...prev };
      for (const p of activePlayers) {
        const n = picks[p];
        if (n) updated[p] = [n, ...((updated[p] || []).filter((x) => x !== n))].slice(0, 10);
      }
      return updated;
    });
  }

  /* ui actions */
  function toggleExclude(name: string) { setExcluded((prev) => ({ ...prev, [name]: !prev[name] })); }
  function markDone(name?: string, player?: PlayerNum) {
    const p = (player ?? 1) as PlayerNum;
    const target = name ?? picked[p];
    if (!target) return;
    setCompletedByPlayer((prev) => ({ ...prev, [p]: { ...(prev[p] || {}), [target]: true } }));
    setPicked((prev) => ({ ...prev, [p]: null }));
  }
  function markAllDone() {
    const updates: Partial<Record<PlayerNum, Record<string, boolean>>> = {};
    const cleared: Partial<Record<PlayerNum, null>> = {};
    for (const p of activePlayers) {
      const hero = picked[p]; cleared[p] = null;
      if (hero) updates[p] = { ...(completedByPlayer[p] || {}), [hero]: true };
    }
    setCompletedByPlayer((prev) => ({ ...prev, ...(updates as Record<PlayerNum, Record<string, boolean>>) }));
    setPicked((prev) => ({ ...prev, ...(cleared as Record<PlayerNum, string | null>) }));
  }
  function undoDone(name: string, player: PlayerNum) {
    setCompletedByPlayer((prev) => ({ ...prev, [player]: { ...(prev[player] || {}), [name]: false } }));
  }
  function setAllExcluded(value: boolean) {
    const updates: Record<string, boolean> = { ...excluded };
    for (const h of listBase) updates[h.name] = value;
    setExcluded(updates);
  }
  function clearAll() {
    setExcluded({}); setHistory([]); setHistoryByPlayer({});
    setPicked({1:null,2:null,3:null,4:null,5:null});
  }
  function resetChallenge() {
    setCompletedByPlayer({} as any);
    setPicked({1:null,2:null,3:null,4:null,5:null});
  }

  const totals = useMemo(() => {
    const total = listBase.length;
    const excludedCount = listBase.filter((h) => excluded[h.name]).length;
    const available = Math.max(0, total - excludedCount);
    const compCounts: Record<PlayerNum, number> = {} as any;
    activePlayers.forEach((p) => { compCounts[p] = Object.values(completedByPlayer[p] || {}).filter(Boolean).length; });
    return { total, excluded: excludedCount, available, compCounts };
  }, [listBase, excluded, completedByPlayer, activePlayers]);

  const eligibleBadge = activePlayers.map((p) => `${names[p] || `P${p}`}: ${eligibleByPlayer[p].length}`).join(" • ");

  /* render */
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold tracking-tight">
        Overwatch 2 – Random Hero Picker <span className="text-muted-foreground">(Multi-Player Role Lock)</span>
      </motion.h1>

      <p className="mt-2 text-sm text-muted-foreground">
        Set a role and (optionally) a name for each player. Rolls are unique across players when possible. Mark heroes <em>Done</em> to exclude them for that player while Challenge Mode is on.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-5">
        {/* Left: Controls */}
        <Card className="panel md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" /> Filters & Roles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Players + Pool */}
            <div className="toolbar flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4" />
                <div className="text-sm">Players</div>
                <Select value={String(playersCount)} onValueChange={(v) => setPlayersCount(Number(v))}>
                  <SelectTrigger className="w-24"><SelectValue placeholder="Players" /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map((n) => (<SelectItem key={`players_${n}`} value={String(n)}>{n}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="secondary" className="text-xs">Pool: {totals.available}/{ALL_HEROES.length}</Badge>
            </div>

            {/* Roles + Names */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activePlayers.map((p) => (
                <div key={`role_${p}`} className="space-y-2">
                  <label className="block text-xs uppercase text-muted-foreground">{names[p]} • Role</label>
                  <Select value={roles[p]} onValueChange={(v) => setRoles((prev) => ({ ...prev, [p]: v as Role }))}>
                    <SelectTrigger><SelectValue placeholder="Choose role" /></SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.map((r) => (<SelectItem key={`p${p}_${r}`} value={r}>{r}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={names[p]}
                    onChange={(e) => setNames((prev) => ({ ...prev, [p]: e.target.value }))}
                    placeholder={`Player ${p} name (optional)`}
                  />
                </div>
              ))}
            </div>

            {/* List role filter for browsing/excluding */}
            <Tabs value={listRole} onValueChange={(v) => setListRole(v as Role)} className="w-full mt-2">
              <TabsList className="grid w-full grid-cols-4">
                {ALL_ROLES.map((r) => (<TabsTrigger key={`list_${r}`} value={r} className="text-xs sm:text-sm">{r}</TabsTrigger>))}
              </TabsList>
              {ALL_ROLES.map((r) => (<TabsContent key={`list_content_${r}`} value={r} />))}
            </Tabs>

            <div>
              <label className="mb-1 block text-sm font-medium">Search heroes</label>
              <Input placeholder="Type to filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>

            <div className="toolbar flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch id="norepeat" checked={noRepeat} onCheckedChange={setNoRepeat} />
                <label htmlFor="norepeat" className="text-sm">No repeats until pool is used</label>
              </div>
            </div>

            <div className="toolbar flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch id="challenge" checked={challengeMode} onCheckedChange={setChallengeMode} />
                <label htmlFor="challenge" className="text-sm flex items-center gap-1"><Trophy className="h-4 w-4" /> Challenge Mode (per-player)</label>
              </div>
              <div className="flex flex-wrap gap-1">
                {activePlayers.map((p) => (
                  <Badge key={`done_badge_${p}`} variant="secondary" className="text-[10px]">
                    {(names[p] || `P${p}`)} {Object.values(completedByPlayer[p] || {}).filter(Boolean).length}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Include/Exclude + list */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAllExcluded(false)}>Include All</Button>
              <Button variant="outline" size="sm" onClick={() => setAllExcluded(true)}>Exclude All</Button>
              <Button variant="destructive" size="sm" onClick={clearAll} className="ml-auto">
                <Trash2 className="mr-1 h-4 w-4" /> Reset Filters
              </Button>
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border p-2">
              <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {visibleHeroes.map(({ name, role: r }) => (
                  <li key={name} className="flex items-center gap-2 rounded-md p-1 hover:bg-muted/60">
                    <Checkbox id={`ex_${name}`} checked={!!excluded[name]} onCheckedChange={() => toggleExclude(name)} />
                    <label htmlFor={`ex_${name}`} className="flex-1 cursor-pointer select-none text-sm">{name}</label>
                    <Badge variant="outline" className="role-badge" data-role={r}>{r}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetChallenge}>
                <Undo2 className="mr-1 h-4 w-4" /> Reset Challenge (clear completed)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: Picker */}
        <Card className="panel relative md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2"><Dice5 className="h-5 w-5" /> Randomizer</span>
              <div className="text-xs text-muted-foreground">Eligible: {eligibleBadge}</div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="gap-2"
                onClick={roll}
                disabled={activePlayers.every((p) => eligibleByPlayer[p].length === 0) || isRolling}
              >
                <Shuffle className="h-4 w-4" /> {playersCount === 1 ? "Get Random Hero" : "Get Random Heroes"}
              </Button>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => { setHistory([]); setHistoryByPlayer({}); }}
                disabled={history.length === 0 && Object.values(historyByPlayer).every((v) => !v || v.length === 0)}
              >
                <History className="h-4 w-4" /> Clear History
              </Button>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setPicked({1:null,2:null,3:null,4:null,5:null})}
                disabled={activePlayers.every((p) => !picked[p])}
              >
                <Repeat className="h-4 w-4" /> Clear Picks
              </Button>

              {playersCount === 1 ? (
                <Button variant="secondary" className="gap-2 ml-auto" onClick={() => markDone(undefined, 1)} disabled={!picked[1]}>
                  <CheckCircle2 className="h-4 w-4" /> Mark {names[1]} Done
                </Button>
              ) : (
                <>
                  {activePlayers.map((p) => (
                    <Button
                      key={`mark_${p}`}
                      variant="secondary"
                      className="gap-2 ml-auto"
                      onClick={() => markDone(undefined, p)}
                      disabled={!picked[p]}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark {names[p]} Done
                    </Button>
                  ))}
                  <Button variant="secondary" className="gap-2" onClick={markAllDone} disabled={activePlayers.every((p) => !picked[p])}>
                    <CheckCircle2 className="h-4 w-4" /> Mark All Done
                  </Button>
                </>
              )}
            </div>

            {/* Picks grid (gap-fixed) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activePlayers.map((p) => {
                const pick = picked[p];
                return (
                  <div key={`pick_${p}`} className="rounded-xl border p-4 pick-card relative">
                    <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                      <User className="h-3.5 w-3.5" /> {names[p]} • {roles[p]}
                    </div>

                    {/* status badge is ABSOLUTE and does not affect layout */}
                    {pick && (
                      <Badge variant="secondary" className="status-badge">
                        {isRolling ? "Rolling…" : (completedByPlayer[p]?.[pick] ? "Done" : "Locked")}
                      </Badge>
                    )}

                    <div className="pick-block mt-2">
                      <AnimatePresence mode="wait">
                        {pick ? (
                          <motion.div
                            key={pick}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ type: "spring", stiffness: 260, damping: 22 }}
                            className="space-y-1"
                          >
                            <div className="pick-title">{pick}</div>
                            <Badge
                              variant="outline"
                              className="role-badge"
                              data-role={ALL_HEROES.find((h) => h.name === pick)?.role as RoleKey}
                            >
                              {ALL_HEROES.find((h) => h.name === pick)?.role}
                            </Badge>
                          </motion.div>
                        ) : (
                          <motion.div key={`placeholder_${p}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">
                            No hero picked yet.
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Histories */}
            <div>
              <div className="mb-2 text-xs uppercase text-muted-foreground">Recent Picks</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activePlayers.map((p) => {
                  const list = historyByPlayer[p] || [];
                  return (
                    <div key={`hist_${p}`} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-1 text-xs uppercase text-muted-foreground">
                        <User className="h-3.5 w-3.5" /> {names[p]}
                      </div>
                      {list.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No history yet.</div>
                      ) : (
                        <ul className="grid grid-cols-2 gap-2">
                          {list.map((h) => (
                            <li key={`p${p}_${h}`} className="flex items-center justify-between rounded-lg border p-2">
                              <span className="text-sm font-medium">{h}</span>
                              <Badge
                                variant="outline"
                                className="role-badge"
                                data-role={ALL_HEROES.find((x) => x.name === h)?.role as RoleKey}
                              >
                                {ALL_HEROES.find((x) => x.name === h)?.role}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Completed per player */}
            <div>
              <div className="mb-2 text-xs uppercase text-muted-foreground">Completed Heroes (per player)</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activePlayers.map((p) => {
                  const completedList = Object.entries(completedByPlayer[p] || {}).filter(([, v]) => v).map(([k]) => k);
                  return (
                    <div key={`done_${p}`} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-1 text-xs uppercase text-muted-foreground">
                        <User className="h-3.5 w-3.5" /> {names[p]}
                      </div>
                      {completedList.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No completed heroes yet.</div>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {completedList.map((name) => (
                            <li key={`done_${p}_${name}`} className="chip">
                              <span className="chip__name">{name}</span>
                              <button
                                type="button"
                                onClick={() => undoDone(name, p)}
                                aria-label={`Undo ${name}`}
                                className="chip__undo"
                              >
                                Undo
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Settings, per-player histories, names, and challenge progress are saved locally in your browser.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        <p>Tip: A hero completed by one player stays available for others until they complete it too.</p>
      </div>
    </div>
  );
}
