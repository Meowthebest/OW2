import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shuffle, Dice5, Filter, Trash2, History, Repeat, CheckCircle2, Undo2, Trophy, Users, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// ----- Hero Data (kept in sync with your other canvases) -----
const HEROES: Record<string, string[]> = {
  Tank: [
    "D.Va", "Doomfist", "Hazard", "Junker Queen", "Mauga", "Orisa",
    "Ramattra", "Reinhardt", "Roadhog", "Sigma", "Winston",
    "Wrecking Ball", "Zarya",
  ],
  Damage: [
    "Ashe", "Bastion", "Cassidy", "Echo", "Freja", "Genji", "Hanzo",
    "Junkrat", "Mei", "Pharah", "Reaper", "Sojourn", "Soldier: 76",
    "Sombra", "Symmetra", "Torbjörn", "Tracer", "Venture", "Widowmaker",
  ],
  Support: [
    "Ana", "Baptiste", "Brigitte", "Illari", "Juno", "Kiriko",
    "Lifeweaver", "Lúcio", "Mercy", "Moira", "Zenyatta", "Wuyang",
  ],
};

const ALL_ROLES = ["All", "Tank", "Damage", "Support"] as const;
type Role = typeof ALL_ROLES[number];
type HeroInfo = { name: string; role: keyof typeof HEROES };

const ALL_HEROES: HeroInfo[] = Object.entries(HEROES).flatMap(([role, list]) =>
  list.map((name) => ({ name, role: role as keyof typeof HEROES }))
);

const STORAGE_KEYS = {
  excluded: "ow2_duo_rolelock_excluded",
  norepeat: "ow2_duo_rolelock_norepeat",
  history: "ow2_duo_rolelock_history",
  history_p1: "ow2_duo_rolelock_history_p1",
  history_p2: "ow2_duo_rolelock_history_p2",
  listRole: "ow2_duo_rolelock_list_role",
  p1Role: "ow2_duo_rolelock_p1_role",
  p2Role: "ow2_duo_rolelock_p2_role",
  completedByPlayer: "ow2_duo_rolelock_completed_by_player",
  challengeMode: "ow2_duo_rolelock_challenge_mode",
  twoPlayer: "ow2_duo_rolelock_two_player",
};

type PlayerNum = 1 | 2;

export default function Overwatch2RandomHeroPickerDuoRoleLock() {
  // Role filters
  const [listRole, setListRole] = useState<Role>(() => (localStorage.getItem(STORAGE_KEYS.listRole) as Role) || "All");
  const [p1Role, setP1Role] = useState<Role>(() => (localStorage.getItem(STORAGE_KEYS.p1Role) as Role) || "All");
  const [p2Role, setP2Role] = useState<Role>(() => (localStorage.getItem(STORAGE_KEYS.p2Role) as Role) || "All");
  const [twoPlayer, setTwoPlayer] = useState<boolean>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.twoPlayer);
    return raw === null ? true : raw === "true"; // default ON
  });

  // Search + state
  const [query, setQuery] = useState("");
  const [excluded, setExcluded] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.excluded) || "{}"); } catch { return {}; }
  });
  const [completedByPlayer, setCompletedByPlayer] = useState<Record<PlayerNum, Record<string, boolean>>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.completedByPlayer) || "{}"); } catch { return {} as any; }
  });
  const [challengeMode, setChallengeMode] = useState<boolean>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.challengeMode);
    return raw === null ? true : raw === "true";
  });
  const [noRepeat, setNoRepeat] = useState<boolean>(() => localStorage.getItem(STORAGE_KEYS.norepeat) === "true");
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || "[]"); } catch { return []; }
  });
  const [historyP1, setHistoryP1] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.history_p1) || "[]"); } catch { return []; }
  });
  const [historyP2, setHistoryP2] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.history_p2) || "[]"); } catch { return []; }
  });
  const [picked1, setPicked1] = useState<string | null>(null);
  const [picked2, setPicked2] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  // Manual add state
  const [addPlayer, setAddPlayer] = useState<PlayerNum>(1);
  const [addHero, setAddHero] = useState<string>("");

  // Persist
  useEffect(() => localStorage.setItem(STORAGE_KEYS.listRole, listRole), [listRole]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.p1Role, p1Role), [p1Role]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.p2Role, p2Role), [p2Role]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.twoPlayer, String(twoPlayer)), [twoPlayer]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.excluded, JSON.stringify(excluded)), [excluded]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.completedByPlayer, JSON.stringify(completedByPlayer)), [completedByPlayer]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.challengeMode, String(challengeMode)), [challengeMode]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.norepeat, String(noRepeat)), [noRepeat]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.history_p1, JSON.stringify(historyP1)), [historyP1]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.history_p2, JSON.stringify(historyP2)), [historyP2]);

  // Helpers
  const byRole = (role: Role) => (role === "All" ? ALL_HEROES : ALL_HEROES.filter((h) => h.role === role));
  const listBase = useMemo(() => byRole(listRole), [listRole]);
  const baseP1 = useMemo(() => byRole(p1Role), [p1Role]);
  const baseP2 = useMemo(() => byRole(p2Role), [p2Role]);
  const visibleHeroes = useMemo(() => listBase.filter((h) => h.name.toLowerCase().includes(query.toLowerCase())), [listBase, query]);

  function computeEligible(base: HeroInfo[], player: PlayerNum) {
    const excludedSet = new Set(Object.entries(excluded).filter(([, v]) => v).map(([k]) => k));
    const completedForPlayer = new Set(Object.entries(completedByPlayer[player] || {}).filter(([, v]) => v).map(([k]) => k));
    let pool = base.map((h) => h.name).filter((n) => !excludedSet.has(n));
    if (challengeMode) pool = pool.filter((n) => !completedForPlayer.has(n));
    if (!noRepeat) return pool;
    const used = new Set(history);
    const remaining = pool.filter((n) => !used.has(n));
    return remaining.length > 0 ? remaining : pool; // if exhausted, allow repeats
  }

  const eligibleP1 = useMemo(() => computeEligible(baseP1, 1), [baseP1, excluded, completedByPlayer, challengeMode, noRepeat, history]);
  const eligibleP2 = useMemo(() => computeEligible(baseP2, 2), [baseP2, excluded, completedByPlayer, challengeMode, noRepeat, history]);

  function roll() {
    if (!twoPlayer) return singleRoll();
    if (eligibleP1.length === 0 && eligibleP2.length === 0) { setPicked1(null); setPicked2(null); return; }
    setIsRolling(true);
    const duration = 900, interval = 60; let elapsed = 0;
    const id = setInterval(() => {
      const p1 = eligibleP1.length > 0 ? eligibleP1[Math.floor(Math.random() * eligibleP1.length)] : null;
      let p2Pool = eligibleP2;
      if (p1) p2Pool = p2Pool.filter((n) => n !== p1);
      const p2 = p2Pool.length > 0 ? p2Pool[Math.floor(Math.random() * p2Pool.length)] : null;
      setPicked1(p1); setPicked2(p2);
      elapsed += interval;
      if (elapsed >= duration) { clearInterval(id); setIsRolling(false); finalizeTwo(p1, p2); }
    }, interval);
  }

  function singleRoll() {
    if (eligibleP1.length === 0) { setPicked1(null); setPicked2(null); return; }
    setIsRolling(true);
    const duration = 900, interval = 60; let elapsed = 0;
    const id = setInterval(() => {
      const n = eligibleP1[Math.floor(Math.random() * eligibleP1.length)];
      setPicked1(n); setPicked2(null);
      elapsed += interval;
      if (elapsed >= duration) { clearInterval(id); setIsRolling(false); finalizeOne(n); }
    }, interval);
  }

  function finalizeOne(n: string | null) {
    if (!n) return;
    setHistory((prev) => [n, ...prev.filter((x) => x !== n)].slice(0, 14));
    setHistoryP1((prev) => [n, ...prev.filter((x) => x !== n)].slice(0, 10));
  }
  function finalizeTwo(p1: string | null, p2: string | null) {
    const names = [p1, p2].filter(Boolean) as string[];
    if (names.length === 0) return;
    setHistory((prev) => [...names, ...prev.filter((x) => !names.includes(x))].slice(0, 20));
    if (p1) setHistoryP1((prev) => [p1, ...prev.filter((x) => x !== p1)].slice(0, 10));
    if (p2) setHistoryP2((prev) => [p2, ...prev.filter((x) => x !== p2)].slice(0, 10));
  }

  function toggleExclude(name: string) {
    setExcluded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function markDone(name?: string, player?: PlayerNum) {
    const target = name ?? (player === 2 ? picked2 : picked1);
    const p: PlayerNum = player ?? 1;
    if (!target) return;
    setCompletedByPlayer((prev) => ({ ...prev, [p]: { ...(prev[p] || {}), [target]: true } }));
    if (p === 2) setPicked2(null); else setPicked1(null);
  }

  function undoDone(name: string, player: PlayerNum) {
    setCompletedByPlayer((prev) => ({ ...prev, [player]: { ...(prev[player] || {}), [name]: false } }));
  }

  function handleManualAdd() {
    if (!addHero) return;
    markDone(addHero, addPlayer);
    setAddHero("");
  }

  function setAllExcluded(value: boolean) {
    const updates: Record<string, boolean> = { ...excluded };
    for (const h of listBase) updates[h.name] = value;
    setExcluded(updates);
  }

  function clearAll() {
    setExcluded({});
    setHistory([]); setHistoryP1([]); setHistoryP2([]);
    setPicked1(null); setPicked2(null);
  }

  function resetChallenge() {
    setCompletedByPlayer({} as any);
    setPicked1(null); setPicked2(null);
  }

  const totals = useMemo(() => {
    const total = listBase.length;
    const excludedCount = listBase.filter((h) => excluded[h.name]).length;
    const available = Math.max(0, total - excludedCount);
    const c1 = Object.values(completedByPlayer[1] || {}).filter(Boolean).length;
    const c2 = Object.values(completedByPlayer[2] || {}).filter(Boolean).length;
    return { total, excluded: excludedCount, available, c1, c2 };
  }, [listBase, excluded, completedByPlayer]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold tracking-tight">
        Overwatch 2 – Random Hero Picker <span className="text-muted-foreground">(Duo Role Lock)</span>
      </motion.h1>

      <p className="mt-2 text-sm text-muted-foreground">
        Choose a role for <span className="font-medium">Player 1</span> and <span className="font-medium">Player 2</span>. Rolls are unique if possible. Mark heroes <em>Done</em> to exclude them for that specific player while Challenge Mode is on.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-5">
        {/* Left: Controls */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" /> Filters & Roles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Global options */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <Switch id="twoplayer" checked={twoPlayer} onCheckedChange={setTwoPlayer} />
                <label htmlFor="twoplayer" className="text-sm flex items-center gap-1"><Users className="h-4 w-4" /> Two Players</label>
              </div>
              <Badge variant="secondary" className="text-xs">Pool: {totals.available}/{totals.total}</Badge>
            </div>

            {/* Per-player role selects */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase text-muted-foreground">Player 1 Role</label>
                <Select value={p1Role} onValueChange={(v) => setP1Role(v as Role)}>
                  <SelectTrigger><SelectValue placeholder="Choose role" /></SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => (<SelectItem key={`p1_${r}`} value={r}>{r}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase text-muted-foreground">Player 2 Role</label>
                <Select value={p2Role} onValueChange={(v) => setP2Role(v as Role)}>
                  <SelectTrigger><SelectValue placeholder="Choose role" /></SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => (<SelectItem key={`p2_${r}`} value={r}>{r}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
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

            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <Switch id="norepeat" checked={noRepeat} onCheckedChange={setNoRepeat} />
                <label htmlFor="norepeat" className="text-sm">No repeats until pool is used</label>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <Switch id="challenge" checked={challengeMode} onCheckedChange={setChallengeMode} />
                <label htmlFor="challenge" className="text-sm flex items-center gap-1"><Trophy className="h-4 w-4" /> Challenge Mode (per-player)</label>
              </div>
              <Badge variant="secondary" className="text-xs">Completed: P1 {totals.c1} • P2 {totals.c2}</Badge>
            </div>

            {/* Manual Add Completed */}
            <div className="rounded-xl border p-3">
              <div className="mb-2 text-xs uppercase text-muted-foreground">Add Completed (Manual)</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs uppercase text-muted-foreground">Player</label>
                  <Select value={String(addPlayer)} onValueChange={(v) => setAddPlayer(Number(v) as PlayerNum)}>
                    <SelectTrigger><SelectValue placeholder="Player" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Player 1</SelectItem>
                      <SelectItem value="2">Player 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs uppercase text-muted-foreground">Hero</label>
                  <Select value={addHero} onValueChange={setAddHero}>
                    <SelectTrigger><SelectValue placeholder="Choose a hero" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(HEROES).map(([role, list]) => (
                        <div key={`group_${role}`}>
                          {list.map((name) => (<SelectItem key={`add_${name}`} value={name}>{name}</SelectItem>))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2">
                <Button size="sm" onClick={handleManualAdd} disabled={!addHero}>Add to Completed</Button>
              </div>
            </div>

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
                    <Badge variant="outline" className="text-[10px]">{r}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetChallenge}><Undo2 className="mr-1 h-4 w-4" /> Reset Challenge (clear both players)</Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: Picker */}
        <Card className="relative md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2"><Dice5 className="h-5 w-5" /> Randomizer</span>
              <div className="text-xs text-muted-foreground">Eligible: P1 {eligibleP1.length} • P2 {twoPlayer ? eligibleP2.length : 0}</div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button className="gap-2" onClick={roll} disabled={(twoPlayer ? (eligibleP1.length === 0 && eligibleP2.length === 0) : eligibleP1.length === 0) || isRolling}>
                <Shuffle className="h-4 w-4" /> {twoPlayer ? "Get Random Heroes" : "Get Random Hero"}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => { setHistory([]); setHistoryP1([]); setHistoryP2([]); }} disabled={history.length === 0 && historyP1.length === 0 && historyP2.length === 0}>
                <History className="h-4 w-4" /> Clear History
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => { setPicked1(null); setPicked2(null); }} disabled={!picked1 && !picked2}>
                <Repeat className="h-4 w-4" /> Clear Picks
              </Button>
              {twoPlayer ? (
                <>
                  <Button variant="secondary" className="gap-2 ml-auto" onClick={() => markDone(undefined, 1)} disabled={!picked1}><CheckCircle2 className="h-4 w-4" /> Mark P1 Done</Button>
                  <Button variant="secondary" className="gap-2" onClick={() => markDone(undefined, 2)} disabled={!picked2}><CheckCircle2 className="h-4 w-4" /> Mark P2 Done</Button>
                  <Button variant="secondary" className="gap-2" onClick={() => { markDone(undefined, 1); markDone(undefined, 2); }} disabled={!picked1 && !picked2}><CheckCircle2 className="h-4 w-4" /> Mark Both Done</Button>
                </>
              ) : (
                <Button variant="secondary" className="gap-2 ml-auto" onClick={() => markDone()} disabled={!picked1}><CheckCircle2 className="h-4 w-4" /> Mark Done</Button>
              )}
            </div>

            {/* Picks Display */}
            {twoPlayer ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {([ {label: "Player 1", pick: picked1, role: p1Role, p: 1}, {label: "Player 2", pick: picked2, role: p2Role, p: 2} ] as const).map(({label, pick, role, p}) => (
                  <div key={label} className="rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><User className="h-3.5 w-3.5" /> {label} • {role}</div>
                    <div className="mt-2 min-h-[92px]">
                      <AnimatePresence mode="wait">
                        {pick ? (
                          <motion.div key={pick} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} className="flex items-center justify-between">
                            <div>
                              <div className="text-2xl font-bold leading-tight">{pick}</div>
                              <div className="text-sm text-muted-foreground">{ALL_HEROES.find((h) => h.name === pick)?.role}</div>
                            </div>
                            <Badge variant="secondary" className="text-xs">{isRolling ? "Rolling…" : (completedByPlayer[p]?.[pick] ? "Done" : "Locked")}</Badge>
                          </motion.div>
                        ) : (
                          <motion.div key={`${label}-placeholder`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">No hero picked yet.</motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase text-muted-foreground">Current Pick • {p1Role}</div>
                <div className="mt-2 min-h-[92px]">
                  <AnimatePresence mode="wait">
                    {picked1 ? (
                      <motion.div key={picked1} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} className="flex items-center justify-between">
                        <div>
                          <div className="text-2xl font-bold leading-tight">{picked1}</div>
                          <div className="text-sm text-muted-foreground">{ALL_HEROES.find((h) => h.name === picked1)?.role}</div>
                        </div>
                        <Badge variant="secondary" className="text-xs">{isRolling ? "Rolling…" : (completedByPlayer[1]?.[picked1] ? "Done" : "Locked")}</Badge>
                      </motion.div>
                    ) : (
                      <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">No hero picked yet.</motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Histories */}
            <div>
              <div className="mb-2 text-xs uppercase text-muted-foreground">Recent Picks</div>
              {twoPlayer ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center gap-1 text-xs uppercase text-muted-foreground"><User className="h-3.5 w-3.5" /> Player 1</div>
                    {historyP1.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No history yet.</div>
                    ) : (
                      <ul className="grid grid-cols-2 gap-2">
                        {historyP1.map((h) => (
                          <li key={`p1_${h}`} className="flex items-center justify-between rounded-lg border p-2">
                            <span className="text-sm font-medium">{h}</span>
                            <Badge variant="outline" className="text-[10px]">{ALL_HEROES.find((x) => x.name === h)?.role}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center gap-1 text-xs uppercase text-muted-foreground"><User className="h-3.5 w-3.5" /> Player 2</div>
                    {historyP2.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No history yet.</div>
                    ) : (
                      <ul className="grid grid-cols-2 gap-2">
                        {historyP2.map((h) => (
                          <li key={`p2_${h}`} className="flex items-center justify-between rounded-lg border p-2">
                            <span className="text-sm font-medium">{h}</span>
                            <Badge variant="outline" className="text-[10px]">{ALL_HEROES.find((x) => x.name === h)?.role}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border p-3">
                  {history.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No history yet.</div>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {history.map((h) => (
                        <li key={h} className="flex items-center justify-between rounded-lg border p-2">
                          <span className="text-sm font-medium">{h}</span>
                          <Badge variant="outline" className="text-[10px]">{ALL_HEROES.find((x) => x.name === h)?.role}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Completed per player */}
            <div>
              <div className="mb-2 text-xs uppercase text-muted-foreground">Completed Heroes (per player)</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1,2].map((p) => {
                  const completedList = Object.entries(completedByPlayer[p as PlayerNum] || {}).filter(([, v]) => v).map(([k]) => k);
                  return (
                    <div key={`done_${p}`} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-1 text-xs uppercase text-muted-foreground"><User className="h-3.5 w-3.5" /> Player {p}</div>
                      {completedList.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No completed heroes yet.</div>
                      ) : (
                        <ul className="grid grid-cols-2 gap-2">
                          {completedList.map((name) => (
                            <li key={`done_${p}_${name}`} className="flex items-center justify-between rounded-lg border p-2">
                              <span className="text-sm font-medium">{name}</span>
                              <Button variant="outline" size="sm" onClick={() => undoDone(name, p as PlayerNum)}><Undo2 className="mr-1 h-4 w-4" /> Undo</Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Settings, per-player histories, and challenge progress are saved locally in your browser.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        <p>Tip: You can set different roles per player. A hero completed by one player stays available for the other until they also complete it.</p>
      </div>
    </div>
  );
}
