import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shuffle, Dice5, Filter, Trash2, History, Repeat,
  CheckCircle2, Undo2, Trophy, Users, Shield, Sword, Heart
} from "lucide-react";

// Shadcn UI Components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// Import the utility we just fixed
import { cn } from "@/lib/utils";

/* ---------- Configuration & Data ---------- */

const ROLE_CONFIG = {
  Tank: { color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: Shield },
  Damage: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", icon: Sword },
  Support: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: Heart },
};

const HEROES = {
  Tank: ["D.Va","Doomfist","Hazard","Junker Queen","Mauga","Orisa","Ramattra","Reinhardt","Roadhog","Sigma","Winston","Wrecking Ball","Zarya"],
  Damage: ["Ashe","Bastion","Cassidy","Echo","Freja","Genji","Hanzo","Junkrat","Mei","Pharah","Reaper","Sojourn","Soldier: 76","Sombra","Symmetra","Torbjörn","Tracer","Vendetta","Venture","Widowmaker"],
  Support: ["Ana","Baptiste","Brigitte","Illari","Juno","Kiriko","Lifeweaver","Lúcio","Mercy","Moira","Zenyatta","Wuyang"],
} as const;

const ALL_ROLES = ["All", "Tank", "Damage", "Support"] as const;
type Role = typeof ALL_ROLES[number];
type RoleKey = keyof typeof HEROES;
type HeroInfo = { name: string; role: RoleKey };

const ALL_HEROES: HeroInfo[] = (Object.entries(HEROES) as [RoleKey, readonly string[]][])
  .flatMap(([role, list]) => list.map((name) => ({ name, role })));

const PLAYERS = [1, 2, 3, 4, 5] as const;
type PlayerNum = typeof PLAYERS[number];

/* ---------- Custom Hook for Storage ---------- */

function usePersistentState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    try {
      if (typeof window === "undefined") return initialValue;
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState] as const;
}

/* ---------- Main Component ---------- */

export default function Overwatch2RandomHeroPickerMultiRoleLock() {
  // -- State --
  const [playersCount, setPlayersCount] = usePersistentState<number>("ow2_multi_players", 2);
  
  const [roles, setRoles] = usePersistentState<Record<PlayerNum, Role>>("ow2_multi_roles", { 1:"All",2:"All",3:"All",4:"All",5:"All" });
  const [names, setNames] = usePersistentState<Record<PlayerNum, string>>("ow2_multi_names", { 1:"Player 1",2:"Player 2",3:"Player 3",4:"Player 4",5:"Player 5" });
  
  const [listRole, setListRole] = usePersistentState<Role>("ow2_multi_list_role", "All");
  const [excluded, setExcluded] = usePersistentState<Record<string, boolean>>("ow2_multi_excluded", {});
  const [challengeMode, setChallengeMode] = usePersistentState<boolean>("ow2_multi_challenge", true);
  const [noRepeat, setNoRepeat] = usePersistentState<boolean>("ow2_multi_norepeat", false);
  
  const [completedByPlayer, setCompletedByPlayer] = usePersistentState<Record<PlayerNum, Record<string, boolean>>>("ow2_multi_completed", {1:{},2:{},3:{},4:{},5:{}});
  const [history, setHistory] = usePersistentState<string[]>("ow2_multi_history_global", []);
  const [historyByPlayer, setHistoryByPlayer] = usePersistentState<Record<PlayerNum, string[]>>("ow2_multi_history_by_player", {1:[],2:[],3:[],4:[],5:[]});

  // Transient state (not saved)
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Record<PlayerNum, string | null>>({1:null,2:null,3:null,4:null,5:null});
  const [isRolling, setIsRolling] = useState(false);

  // -- Derived --
  const activePlayers = useMemo(() => PLAYERS.slice(0, playersCount), [playersCount]);

  const byRole = useCallback((role: Role) => 
    role === "All" ? ALL_HEROES : ALL_HEROES.filter((h) => h.role === (role as RoleKey)), 
  []);

  const listBase = useMemo(() => byRole(listRole), [listRole, byRole]);

  // Filter visible heroes in the exclusion list based on search
  const visibleHeroes = useMemo(() => 
    listBase.filter((h) => h.name.toLowerCase().includes(query.toLowerCase())),
    [listBase, query]
  );

  // Compute eligible pool per player
  const eligibleByPlayer = useMemo(() => {
    const map = {} as Record<PlayerNum, string[]>;
    const excludedSet = new Set(Object.keys(excluded).filter(k => excluded[k]));
    const usedInCurrentSession = new Set(history); // For no-repeat mode

    activePlayers.forEach((p) => {
      // 1. Filter by Role
      let pool = byRole(roles[p]).map(h => h.name);
      
      // 2. Filter Excluded (Global)
      pool = pool.filter(n => !excludedSet.has(n));

      // 3. Filter Challenge (Personal)
      if (challengeMode) {
        const completed = completedByPlayer[p] || {};
        pool = pool.filter(n => !completed[n]);
      }

      // 4. Filter No-Repeat (Session)
      if (noRepeat) {
        const remaining = pool.filter(n => !usedInCurrentSession.has(n));
        // Only apply no-repeat if we still have heroes left, otherwise reset pool
        if (remaining.length > 0) pool = remaining;
      }

      map[p] = pool;
    });
    return map;
  }, [roles, excluded, challengeMode, completedByPlayer, noRepeat, history, activePlayers, byRole]);

  // -- Actions --

  const roll = useCallback(() => {
    // Check if anyone can roll
    const pools: Record<PlayerNum, string[]> = {} as any;
    let canRoll = false;

    activePlayers.forEach(p => {
      pools[p] = eligibleByPlayer[p];
      if (pools[p].length > 0) canRoll = true;
    });

    if (!canRoll) return;

    setIsRolling(true);
    const duration = 800;
    const intervalTime = 60;
    let elapsed = 0;

    const intervalId = setInterval(() => {
      const currentPicks = {} as Record<PlayerNum, string | null>;
      const sessionPicked = new Set<string>();

      // Rolling animation logic
      activePlayers.forEach(p => {
        const pool = pools[p];
        if (pool.length === 0) {
          currentPicks[p] = null;
        } else {
          // Try to pick unique within this specific roll frame
          const available = pool.filter(n => !sessionPicked.has(n));
          const finalPool = available.length > 0 ? available : pool;
          const randomHero = finalPool[Math.floor(Math.random() * finalPool.length)];
          
          currentPicks[p] = randomHero;
          sessionPicked.add(randomHero);
        }
      });

      setPicked(prev => ({ ...prev, ...currentPicks }));
      elapsed += intervalTime;

      if (elapsed >= duration) {
        clearInterval(intervalId);
        setIsRolling(false);
        // Call finalize logic cleanly
        finalizeRoll(currentPicks);
      }
    }, intervalTime);
  }, [activePlayers, eligibleByPlayer]);

  const finalizeRoll = (finalPicks: Record<PlayerNum, string | null>) => {
    setHistory(prevHistory => {
      const newGlobalHistory = [...prevHistory];
      
      activePlayers.forEach(p => {
        const hero = finalPicks[p];
        if (hero) {
          if (!newGlobalHistory.includes(hero)) {
            newGlobalHistory.unshift(hero);
          } else {
            const idx = newGlobalHistory.indexOf(hero);
            newGlobalHistory.splice(idx, 1);
            newGlobalHistory.unshift(hero);
          }
        }
      });
      return newGlobalHistory.slice(0, 30);
    });

    setHistoryByPlayer(prev => {
      const newPlayerHistory = { ...prev };
      activePlayers.forEach(p => {
        const hero = finalPicks[p];
        if (hero) {
          const pHist = [...(newPlayerHistory[p] || [])];
          if (!pHist.includes(hero)) {
            pHist.unshift(hero);
          } else {
            const idx = pHist.indexOf(hero);
            pHist.splice(idx, 1);
            pHist.unshift(hero);
          }
          newPlayerHistory[p] = pHist.slice(0, 15);
        }
      });
      return newPlayerHistory;
    });
  };

  // -- Handlers --

  const toggleExclude = (name: string) => setExcluded(prev => ({ ...prev, [name]: !prev[name] }));
  
  const markDone = (player: PlayerNum) => {
    const hero = picked[player];
    if (!hero) return;
    
    setCompletedByPlayer(prev => ({
      ...prev,
      [player]: { ...(prev[player] || {}), [hero]: true }
    }));
    setPicked(prev => ({ ...prev, [player]: null }));
  };

  const markAllDone = () => {
    setCompletedByPlayer(prev => {
      const next = { ...prev };
      activePlayers.forEach(p => {
        const hero = picked[p];
        if (hero) next[p] = { ...(next[p] || {}), [hero]: true };
      });
      return next;
    });
    setPicked(prev => {
        const cleared = { ...prev };
        activePlayers.forEach(p => cleared[p] = null);
        return cleared;
    });
  };

  const undoDone = (player: PlayerNum, hero: string) => {
    setCompletedByPlayer(prev => {
      const newMap = { ...(prev[player] || {}) };
      delete newMap[hero];
      return { ...prev, [player]: newMap };
    });
  };

  const resetAllFilters = () => {
    if(confirm("Reset all filters, history, and challenge progress?")) {
      setExcluded({});
      setHistory([]);
      setHistoryByPlayer({1:[],2:[],3:[],4:[],5:[]});
      setCompletedByPlayer({1:{},2:{},3:{},4:{},5:{}});
      setPicked({1:null,2:null,3:null,4:null,5:null});
    }
  };

  const clearPicks = () => setPicked({1:null,2:null,3:null,4:null,5:null});

  // -- Stats --
  const poolStats = useMemo(() => {
    const total = listBase.length;
    const excludedCount = listBase.filter(h => excluded[h.name]).length;
    return { total, excluded: excludedCount, available: Math.max(0, total - excludedCount) };
  }, [listBase, excluded]);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-black italic tracking-tighter bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent uppercase">
            Overwatch 2 Randomizer
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Multi-player role lock • Challenge Mode • Smart Filtering
          </p>
        </motion.div>
        
        <div className="flex items-center gap-4 rounded-lg border bg-card/50 p-2 shadow-sm backdrop-blur-sm">
           <div className="flex items-center gap-2">
             <Users className="h-4 w-4 text-muted-foreground" />
             <Select value={String(playersCount)} onValueChange={(v) => setPlayersCount(Number(v))}>
               <SelectTrigger className="w-[80px] h-8 text-xs font-bold">
                   <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 {PLAYERS.map(n => <SelectItem key={n} value={String(n)}>{n} Players</SelectItem>)}
               </SelectContent>
             </Select>
           </div>
           <Separator orientation="vertical" className="h-6" />
           <div className="flex items-center gap-2">
             <Switch id="challenge" checked={challengeMode} onCheckedChange={setChallengeMode} className="scale-75 origin-right" />
             <label htmlFor="challenge" className="text-xs font-bold cursor-pointer select-none flex items-center gap-1 uppercase tracking-wider">
               <Trophy className="h-3 w-3 text-amber-500" /> Challenge
             </label>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* LEFT COLUMN: Controls & Filters (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-muted/60 shadow-sm">
            <CardHeader className="pb-3 bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2 font-bold uppercase tracking-wide">
                <Filter className="h-4 w-4" /> Player Setup & Pool
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              
              {/* Player Configuration Rows */}
              <div className="space-y-3">
                 {activePlayers.map(p => (
                   <div key={p} className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-black text-muted-foreground shadow-inner border">
                        P{p}
                      </div>
                      <Input 
                        className="h-8 text-sm font-medium" 
                        placeholder={`Player ${p}`} 
                        value={names[p]} 
                        onChange={e => setNames(prev => ({...prev, [p]: e.target.value}))} 
                      />
                      <Select value={roles[p]} onValueChange={v => setRoles(prev => ({...prev, [p]: v as Role}))}>
                        <SelectTrigger className="h-8 w-[110px] text-xs font-bold uppercase">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                   </div>
                 ))}
              </div>

              <Separator />

              {/* Pool Filters */}
              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hero Pool ({poolStats.available})</label>
                    <div className="flex gap-2">
                         <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={() => setExcluded({})}>
                            <Undo2 className="h-3 w-3" />
                         </Button>
                    </div>
                 </div>

                 <Tabs value={listRole} onValueChange={v => setListRole(v as Role)} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 h-8 bg-muted/40">
                       {ALL_ROLES.map(r => <TabsTrigger key={r} value={r} className="text-[10px] font-bold uppercase">{r}</TabsTrigger>)}
                    </TabsList>
                 </Tabs>

                 <Input 
                   placeholder="Search heroes..." 
                   value={query} 
                   onChange={e => setQuery(e.target.value)} 
                   className="h-8 text-xs"
                 />

                 <div className="h-[200px] overflow-y-auto rounded-md border p-1 bg-muted/10">
                    <div className="grid grid-cols-2 gap-1">
                       {visibleHeroes.map((h) => (
                         <div key={h.name} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 transition-colors group">
                            <Checkbox 
                                id={`ex-${h.name}`} 
                                checked={!!excluded[h.name]} 
                                onCheckedChange={() => toggleExclude(h.name)}
                                className="h-3.5 w-3.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                            />
                            <label htmlFor={`ex-${h.name}`} className={cn("text-xs flex-1 cursor-pointer select-none truncate font-medium group-hover:text-foreground transition-colors", excluded[h.name] ? "text-muted-foreground line-through decoration-destructive/50" : "text-muted-foreground")}>
                                {h.name}
                            </label>
                            {/* Dot indicator for role */}
                            <div className={cn("h-1.5 w-1.5 rounded-full ring-1 ring-inset ring-white/20", ROLE_CONFIG[h.role].bg.replace("/10", ""))} />
                         </div>
                       ))}
                       {visibleHeroes.length === 0 && <div className="col-span-2 text-center text-xs text-muted-foreground py-4">No heroes found</div>}
                    </div>
                 </div>

                 <div className="flex items-center gap-2 pt-2 rounded-md bg-muted/30 p-2 border border-dashed">
                    <Switch id="norepeat" checked={noRepeat} onCheckedChange={setNoRepeat} className="scale-75" />
                    <label htmlFor="norepeat" className="text-xs font-semibold text-muted-foreground cursor-pointer select-none">No repeats this session</label>
                 </div>
              </div>

              {/* Reset Button */}
              <Button variant="ghost" className="w-full h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 font-bold uppercase tracking-wide" onClick={resetAllFilters}>
                 <Trash2 className="mr-2 h-3 w-3" /> Reset Everything
              </Button>

            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: The Picker (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
           
           {/* Action Bar */}
           <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
             <Button 
               size="lg" 
               onClick={roll} 
               disabled={isRolling}
               className="w-full sm:w-auto min-w-[200px] bg-[hsl(25,100%,50%)] hover:bg-[hsl(25,100%,45%)] text-white font-black text-xl shadow-lg hover:shadow-orange-500/25 active:scale-95 transition-all uppercase italic tracking-wider h-14"
             >
               <Dice5 className={cn("mr-3 h-6 w-6", isRolling && "animate-spin")} />
               {isRolling ? "Rolling..." : "ROLL HEROES"}
             </Button>

             <div className="flex gap-2 w-full sm:w-auto">
                 <Button variant="outline" onClick={clearPicks} disabled={isRolling} className="flex-1 sm:flex-none">
                    <Repeat className="mr-2 h-4 w-4" /> Clear
                 </Button>
                 
                 {playersCount > 1 && (
                   <Button variant="secondary" onClick={markAllDone} disabled={Object.values(picked).every(v => !v)} className="flex-1 sm:flex-none">
                     <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" /> All Done
                   </Button>
                 )}
             </div>
           </div>

           {/* Hero Cards Grid */}
           <div className={cn(
             "grid gap-4", 
             playersCount === 1 ? "grid-cols-1 max-w-md mx-auto" : 
             playersCount === 2 ? "grid-cols-1 sm:grid-cols-2" :
             "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
           )}>
              {activePlayers.map(p => {
                const heroName = picked[p];
                const heroData = heroName ? ALL_HEROES.find(h => h.name === heroName) : null;
                const roleConfig = heroData ? ROLE_CONFIG[heroData.role] : null;
                const isDone = heroName && completedByPlayer[p]?.[heroName];
                
                return (
                  <Card key={p} className={cn("relative overflow-hidden transition-all duration-300 group", 
                      heroName ? "border-opacity-100 shadow-md ring-1 ring-black/5 dark:ring-white/10" : "border-dashed border-opacity-60 bg-muted/10",
                      roleConfig ? roleConfig.border : "border-border"
                  )}>
                      {/* Background tint based on role */}
                      {roleConfig && <div className={cn("absolute inset-0 opacity-[0.03] pointer-events-none group-hover:opacity-[0.07] transition-opacity", roleConfig.bg.replace("/10", ""))} />}

                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wider font-bold bg-background/50 backdrop-blur-sm">
                                    {names[p]}
                                </Badge>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase">{roles[p]}</span>
                            </div>
                            {isDone && <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold tracking-wide">DONE</Badge>}
                        </div>
                      </CardHeader>
                      
                      <CardContent className="p-4 pt-2 min-h-[120px] flex flex-col justify-center items-center text-center">
                         <AnimatePresence mode="wait">
                            {heroName ? (
                             <motion.div 
                               key={heroName}
                               initial={{ opacity: 0, scale: 0.8, y: 10 }}
                               animate={{ opacity: 1, scale: 1, y: 0 }}
                               exit={{ opacity: 0, scale: 0.9 }}
                               transition={{ type: "spring", bounce: 0.5 }}
                               className="space-y-3"
                             >
                                <div className="flex flex-col items-center justify-center gap-1">
                                    {roleConfig && <roleConfig.icon className={cn("h-8 w-8 opacity-80", roleConfig.color)} />}
                                    <h2 className="text-3xl font-black tracking-tighter uppercase italic drop-shadow-sm">{heroName}</h2>
                                </div>
                                {roleConfig && (
                                    <span className={cn("inline-block text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-secondary/50", roleConfig.color)}>
                                        {heroData?.role}
                                    </span>
                                )}
                             </motion.div>
                            ) : (
                             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground/40 flex flex-col items-center">
                                <Shuffle className="h-10 w-10 mb-3 opacity-20" />
                                <span className="text-sm font-bold uppercase tracking-widest opacity-60">Ready to roll</span>
                             </motion.div>
                            )}
                         </AnimatePresence>
                      </CardContent>

                      {/* Card Actions */}
                      {heroName && (
                        <div className="border-t p-2 flex justify-center bg-muted/30 backdrop-blur-sm">
                           <Button 
                             size="sm" 
                             variant={isDone ? "outline" : "secondary"}
                             className={cn("w-full text-xs h-8 font-bold uppercase tracking-wider", isDone && "text-muted-foreground opacity-70")}
                             onClick={() => isDone ? undoDone(p, heroName) : markDone(p)}
                           >
                             {isDone ? <><Undo2 className="mr-2 h-3 w-3"/> Undo</> : <><CheckCircle2 className="mr-2 h-3 w-3"/> Complete</>}
                           </Button>
                        </div>
                      )}
                  </Card>
                );
              })}
           </div>

           {/* Bottom Section: History & Completed */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Completed List (Collapsible/Scrollable) */}
              <Card>
                 <CardHeader className="p-4 pb-2 bg-muted/10">
                    <CardTitle className="text-sm flex items-center gap-2 font-bold uppercase tracking-wide">
                        <Trophy className="h-4 w-4 text-amber-500" /> 
                        Session Completed
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="p-4 pt-4">
                    <div className="h-[150px] overflow-y-auto pr-2 space-y-4">
                        {activePlayers.map(p => {
                            const completed = Object.keys(completedByPlayer[p] || {});
                            if(completed.length === 0) return null;
                            return (
                                <div key={p} className="text-sm">
                                    <span className="text-[10px] font-black text-muted-foreground block mb-1.5 uppercase tracking-wider">{names[p]}</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {completed.map(c => (
                                            <Badge key={c} variant="secondary" className="text-[10px] px-2 h-6 cursor-pointer hover:line-through hover:bg-destructive hover:text-white transition-colors" onClick={() => undoDone(p, c)}>
                                                {c}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                        {activePlayers.every(p => Object.keys(completedByPlayer[p] || {}).length === 0) && (
                            <div className="h-full flex items-center justify-center text-xs font-medium text-muted-foreground/60 italic">
                                No challenges completed yet.
                            </div>
                        )}
                    </div>
                 </CardContent>
              </Card>

              {/* Recent History */}
              <Card>
                 <CardHeader className="p-4 pb-2 bg-muted/10">
                    <CardTitle className="text-sm flex items-center gap-2 font-bold uppercase tracking-wide">
                        <History className="h-4 w-4" /> 
                        Global History (Last 20)
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="p-4 pt-4">
                    <div className="h-[150px] overflow-y-auto custom-scrollbar">
                        <ul className="space-y-1">
                            {history.length === 0 && (
                                <div className="h-full flex items-center justify-center text-xs font-medium text-muted-foreground/60 italic pt-10">
                                    History is empty.
                                </div>
                            )}
                            {history.map((h, i) => {
                                const role = ALL_HEROES.find(x => x.name === h)?.role;
                                const style = role ? ROLE_CONFIG[role] : null;
                                return (
                                    <li key={`${h}-${i}`} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 border-dashed border-muted">
                                        <span className="font-medium text-foreground/80">{h}</span>
                                        {style && (
                                            <Badge variant="outline" className={cn("text-[9px] h-4 px-1 uppercase tracking-wider", style.color, style.bg, "border-0")}>
                                                {role}
                                            </Badge>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                 </CardContent>
              </Card>

           </div>
        </div>
      </div>
    </div>
  );
}
