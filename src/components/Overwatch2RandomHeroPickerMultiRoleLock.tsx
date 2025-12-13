import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dice5, Filter, Trash2, History, Repeat,
  CheckCircle2, Undo2, Trophy, Users, Shield, Sword, Heart, 
  Activity, AlertCircle, Sun, Moon, Terminal
} from "lucide-react";

// Shadcn UI Components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// Import the utility
import { cn } from "@/lib/utils";

/* ---------- 1. DATA: Thematic Config ---------- */

const ROLE_STYLES = {
  Tank:    { color: "text-blue-500 dark:text-blue-400",    bg: "bg-blue-500/10 dark:bg-blue-500/20",    border: "border-blue-500/20 dark:border-blue-400/30",    icon: Shield },
  Damage:  { color: "text-red-500 dark:text-red-400",     bg: "bg-red-500/10 dark:bg-red-500/20",     border: "border-red-500/20 dark:border-red-400/30",     icon: Sword },
  Support: { color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", border: "border-emerald-500/20 dark:border-emerald-400/30", icon: Heart },
};

const HERO_DATABASE = {
  Tank:    ["D.Va","Doomfist","Hazard","Junker Queen","Mauga","Orisa","Ramattra","Reinhardt","Roadhog","Sigma","Winston","Wrecking Ball","Zarya"],
  Damage:  ["Ashe","Bastion","Cassidy","Echo","Genji","Hanzo","Junkrat","Mei","Pharah","Reaper","Sojourn","Soldier: 76","Sombra","Symmetra","Torbjörn","Tracer","Venture","Widowmaker"],
  Support: ["Ana","Baptiste","Brigitte","Illari","Juno","Kiriko","Lifeweaver","Lúcio","Mercy","Moira","Zenyatta"],
} as const;

const ROLES = ["All", "Tank", "Damage", "Support"] as const;
type RoleType = typeof ROLES[number];
type RoleKey = keyof typeof HERO_DATABASE;

const FLAT_HERO_LIST = (Object.entries(HERO_DATABASE) as [RoleKey, readonly string[]][])
  .flatMap(([role, list]) => list.map((name) => ({ name, role })));

const PLAYERS_INDICES = [1, 2, 3, 4, 5] as const;
type PlayerID = typeof PLAYERS_INDICES[number];

/* ---------- 2. HOOKS ---------- */

// Hook for localStorage persistence
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      if (typeof window === "undefined") return initialValue;
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}

/* ---------- 3. MAIN COMPONENT ---------- */

export default function Overwatch2TacticalPicker() {
  
  // --- Persistent Settings ---
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>("ow2_theme_pref", "dark");
  const [squadSize, setSquadSize] = useLocalStorage<number>("ow2_squad_size", 2);
  const [squadRoles, setSquadRoles] = useLocalStorage<Record<PlayerID, RoleType>>("ow2_squad_roles", { 1:"All", 2:"All", 3:"All", 4:"All", 5:"All" });
  const [agentNames, setAgentNames] = useLocalStorage<Record<PlayerID, string>>("ow2_agent_names", { 1:"Agent 1", 2:"Agent 2", 3:"Agent 3", 4:"Agent 4", 5:"Agent 5" });
  
  const [filterRole, setFilterRole] = useLocalStorage<RoleType>("ow2_filter_role", "All");
  const [bannedHeroes, setBannedHeroes] = useLocalStorage<Record<string, boolean>>("ow2_banned_list", {});
  const [challengeMode, setChallengeMode] = useLocalStorage<boolean>("ow2_mode_challenge", true);
  const [noDuplicates, setNoDuplicates] = useLocalStorage<boolean>("ow2_mode_unique", false);
  
  // --- Persistent Data ---
  const [completedMissions, setCompletedMissions] = useLocalStorage<Record<PlayerID, Record<string, boolean>>>("ow2_missions_done", {1:{},2:{},3:{},4:{},5:{}});
  const [missionLog, setMissionLog] = useLocalStorage<string[]>("ow2_global_log", []);

  // --- Live State ---
  const [searchQuery, setSearchQuery] = useState("");
  const [currentLoadout, setCurrentLoadout] = useState<Record<PlayerID, string | null>>({1:null, 2:null, 3:null, 4:null, 5:null});
  const [isComputing, setIsComputing] = useState(false);

  // --- Effects ---
  // Apply theme class to html element
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  // --- Derived Data ---
  const activeSquad = useMemo(() => PLAYERS_INDICES.slice(0, squadSize), [squadSize]);

  const getHeroesByRole = useCallback((r: RoleType) => 
    r === "All" ? FLAT_HERO_LIST : FLAT_HERO_LIST.filter(h => h.role === (r as RoleKey)), 
  []);

  const filteredPool = useMemo(() => {
    const list = getHeroesByRole(filterRole);
    return list.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [filterRole, searchQuery, getHeroesByRole]);

  const poolStats = useMemo(() => {
    const total = filteredPool.length;
    const banned = filteredPool.filter(h => bannedHeroes[h.name]).length;
    return { total, banned, ready: Math.max(0, total - banned) };
  }, [filteredPool, bannedHeroes]);

  // --- Logic ---
  
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const generateLoadout = useCallback(() => {
    const availablePools: Record<PlayerID, string[]> = {} as any;
    let hasViablePool = false;
    const sessionBans = new Set(noDuplicates ? missionLog : []); 
    const bannedSet = new Set(Object.keys(bannedHeroes).filter(k => bannedHeroes[k]));

    activeSquad.forEach(p => {
      let pool = getHeroesByRole(squadRoles[p]).map(h => h.name);
      pool = pool.filter(n => !bannedSet.has(n));
      if (challengeMode) {
        const done = completedMissions[p] || {};
        pool = pool.filter(n => !done[n]);
      }
      if (noDuplicates) {
         const strictPool = pool.filter(n => !sessionBans.has(n));
         if (strictPool.length > 0) pool = strictPool;
      }
      availablePools[p] = pool;
      if (pool.length > 0) hasViablePool = true;
    });

    if (!hasViablePool) {
      alert("Tactical Error: Pool empty due to constraints.");
      return;
    }

    setIsComputing(true);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
      const draftPicks = {} as Record<PlayerID, string | null>;
      const takenThisRound = new Set<string>();

      activeSquad.forEach(p => {
        const pool = availablePools[p];
        if (pool.length === 0) {
          draftPicks[p] = null;
        } else {
          const uniquePool = pool.filter(n => !takenThisRound.has(n));
          const finalPool = uniquePool.length > 0 ? uniquePool : pool;
          const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
          draftPicks[p] = pick;
          takenThisRound.add(pick);
        }
      });

      setCurrentLoadout(prev => ({ ...prev, ...draftPicks }));

      if (ticks >= 12) {
        clearInterval(timer);
        setIsComputing(false);
        finalizeMission(draftPicks);
      }
    }, 60);
  }, [activeSquad, squadRoles, bannedHeroes, challengeMode, noDuplicates, missionLog, completedMissions, getHeroesByRole]);

  const finalizeMission = (picks: Record<PlayerID, string | null>) => {
    setMissionLog(prev => {
      const nextLog = [...prev];
      activeSquad.forEach(p => {
        const hero = picks[p];
        if (hero) {
           const idx = nextLog.indexOf(hero);
           if (idx > -1) nextLog.splice(idx, 1);
           nextLog.unshift(hero);
        }
      });
      return nextLog.slice(0, 50);
    });
  };

  const toggleBan = (name: string) => setBannedHeroes(prev => ({ ...prev, [name]: !prev[name] }));
  const completeMission = (p: PlayerID) => {
    const hero = currentLoadout[p];
    if (!hero) return;
    setCompletedMissions(prev => ({ ...prev, [p]: { ...(prev[p] || {}), [hero]: true } }));
    setCurrentLoadout(prev => ({ ...prev, [p]: null }));
  };
  const undoMission = (p: PlayerID, hero: string) => {
    setCompletedMissions(prev => {
      const pData = { ...(prev[p] || {}) };
      delete pData[hero];
      return { ...prev, [p]: pData };
    });
  };
  const markAllComplete = () => activeSquad.forEach(p => completeMission(p));
  const factoryReset = () => {
    if (confirm("WARNING: Wipe all mission data?")) {
      setBannedHeroes({}); setMissionLog([]); setCompletedMissions({1:{},2:{},3:{},4:{},5:{}}); setCurrentLoadout({1:null,2:null,3:null,4:null,5:null});
    }
  };

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-8 font-sans">
      
      {/* 1. TOP BAR */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between rounded-2xl bg-card/50 p-4 backdrop-blur-sm border shadow-sm">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-4xl font-black italic tracking-tighter bg-gradient-to-br from-orange-400 to-amber-600 dark:from-orange-500 dark:to-yellow-500 bg-clip-text text-transparent uppercase drop-shadow-sm">
            Overwatch 2 <span className="text-foreground/70 text-2xl not-italic tracking-normal normal-case">/ Tactical Link</span>
          </h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1 pl-1">
            Squad Randomization Protocol • v2.5
          </p>
        </motion.div>
        
        <div className="flex items-center gap-3">
           {/* Theme Toggle */}
           <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full bg-background/50 border hover:bg-accent text-foreground">
              <AnimatePresence mode="wait">
                {theme === 'dark' ? 
                  <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}><Sun className="h-[1.2rem] w-[1.2rem] text-yellow-500" /></motion.div> : 
                  <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}><Moon className="h-[1.2rem] w-[1.2rem] text-slate-700" /></motion.div>
                }
              </AnimatePresence>
           </Button>
           
           <div className="flex items-center gap-3 bg-background/80 border rounded-full p-1.5 shadow-sm pl-4">
             <div className="flex items-center gap-2">
               <Users className="h-4 w-4 text-primary" />
               <Select value={String(squadSize)} onValueChange={(v) => setSquadSize(Number(v))}>
                 <SelectTrigger className="w-[90px] h-8 text-xs font-bold uppercase border-0 bg-transparent focus:ring-0"><SelectValue /></SelectTrigger>
                 <SelectContent>{PLAYERS_INDICES.map(n => <SelectItem key={n} value={String(n)}>{n} Agents</SelectItem>)}</SelectContent>
               </Select>
             </div>
             <Separator orientation="vertical" className="h-5" />
             <div className="flex items-center gap-2 pr-2">
               <label htmlFor="challenge-mode" className="text-xs font-bold uppercase cursor-pointer flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                 <Trophy className="h-3.5 w-3.5 text-amber-500" /> Challenge
               </label>
               <Switch id="challenge-mode" checked={challengeMode} onCheckedChange={setChallengeMode} className="scale-75 data-[state=checked]:bg-amber-500" />
             </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* 2. LEFT PANEL */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-border/40 shadow-lg bg-card/30 backdrop-blur-md overflow-hidden">
            <CardHeader className="bg-muted/30 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" /> Squad Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-3">
                 {activeSquad.map(p => (
                   <div key={p} className="flex items-center gap-2">
                      <Badge variant="outline" className="h-8 w-8 flex items-center justify-center rounded-md bg-background/80 backdrop-blur-md text-xs font-black shadow-sm border-border/50">{p}</Badge>
                      <Input className="h-8 text-sm font-semibold bg-background/50 border-border/50 focus-visible:ring-primary/30" placeholder={`Agent ${p}`} value={agentNames[p]} onChange={e => setAgentNames(prev => ({...prev, [p]: e.target.value}))} />
                      <Select value={squadRoles[p]} onValueChange={v => setSquadRoles(prev => ({...prev, [p]: v as RoleType}))}>
                        <SelectTrigger className="h-8 w-[105px] text-[10px] font-bold uppercase tracking-wider bg-background/50 border-border/50"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                   </div>
                 ))}
              </div>
              <Separator className="bg-border/60" />
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">DB Status: <span className="text-primary">{poolStats.ready} Ready</span> <span className="opacity-50">/ {poolStats.banned} Banned</span></label>
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-background" onClick={() => setBannedHeroes({})} title="Reset Bans"><Undo2 className="h-3.5 w-3.5" /></Button>
                 </div>
                 <Tabs value={filterRole} onValueChange={v => setFilterRole(v as RoleType)} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 h-8 bg-muted/40 p-0.5">
                       {ROLES.map(r => <TabsTrigger key={r} value={r} className="text-[10px] font-bold uppercase data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">{r}</TabsTrigger>)}
                    </TabsList>
                 </Tabs>
                 <Input placeholder="Search database..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 text-xs bg-background/40 border-border/40 focus-visible:ring-primary/30" />
                 <div className="h-[220px] overflow-y-auto rounded-md border border-border/40 bg-background/20 p-1 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-1">
                       {filteredPool.map((h) => (
                         <div key={h.name} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 transition-all cursor-pointer select-none group border border-transparent", bannedHeroes[h.name] ? "bg-destructive/5 opacity-60" : "hover:bg-background/80 hover:border-border/30 hover:shadow-sm")} onClick={() => toggleBan(h.name)}>
                            <Checkbox id={`ban-${h.name}`} checked={!!bannedHeroes[h.name]} className="h-3.5 w-3.5 rounded-sm data-[state=checked]:bg-destructive data-[state=checked]:border-destructive/80" />
                            <span className={cn("text-xs flex-1 truncate font-semibold", bannedHeroes[h.name] ? "text-muted-foreground line-through decoration-destructive/50" : "text-foreground/90 group-hover:text-foreground")}>{h.name}</span>
                            <div className={cn("h-1.5 w-1.5 rounded-full ring-1 ring-inset ring-white/10", ROLE_STYLES[h.role].bg.replace("/10", ""))} />
                         </div>
                       ))}
                       {filteredPool.length === 0 && <div className="col-span-2 text-center text-xs text-muted-foreground py-8 opacity-50">No matching data found.</div>}
                    </div>
                 </div>
                 <div className={cn("flex items-center gap-2 rounded-md p-2 border transition-colors", noDuplicates ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/10 border-border/30")}>
                    <Switch id="unique-mode" checked={noDuplicates} onCheckedChange={setNoDuplicates} className="scale-75 data-[state=checked]:bg-amber-500" />
                    <label htmlFor="unique-mode" className={cn("text-[10px] font-bold uppercase tracking-wide cursor-pointer transition-colors", noDuplicates ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>Unique Protocol (No Session Repeats)</label>
                 </div>
              </div>
              <Button variant="outline" className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 uppercase tracking-widest font-bold h-9 border-border/40" onClick={factoryReset}>
                 <Trash2 className="mr-2 h-3.5 w-3.5" /> Abort & Factory Reset
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 3. RIGHT PANEL */}
        <div className="lg:col-span-8 space-y-6">
           <div className="flex flex-col sm:flex-row items-center gap-4 bg-card/30 backdrop-blur-md p-4 rounded-2xl border border-border/40 shadow-lg relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none" />
             <Button size="lg" onClick={generateLoadout} disabled={isComputing} className="w-full sm:w-auto min-w-[260px] bg-gradient-to-r from-[#f99e1a] to-[#e0890d] hover:from-[#ffaa33] hover:to-[#f99e1a] text-white font-black text-xl italic tracking-widest h-16 shadow-xl shadow-orange-500/20 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase relative z-10 border-t border-white/20">
               <Dice5 className={cn("mr-3 h-7 w-7", isComputing && "animate-spin")} />
               {isComputing ? "DEPLOYING..." : "INITIATE DEPLOYMENT"}
             </Button>
             <div className="flex gap-3 w-full sm:w-auto z-10">
                 <Button variant="secondary" onClick={() => setCurrentLoadout({1:null,2:null,3:null,4:null,5:null})} disabled={isComputing} className="flex-1 sm:flex-none bg-background/50 hover:bg-background/80 border border-border/30">
                    <Repeat className="mr-2 h-4 w-4" /> Clear
                 </Button>
                 {squadSize > 1 && (
                   <Button variant="outline" onClick={markAllComplete} disabled={Object.values(currentLoadout).every(v => !v)} className="flex-1 sm:flex-none border-green-500/30 hover:bg-green-500/10 hover:text-green-500 dark:hover:text-green-400">
                     <CheckCircle2 className="mr-2 h-4 w-4" /> Complete All
                   </Button>
                 )}
             </div>
           </div>

           <div className={cn("grid gap-4", squadSize === 1 ? "grid-cols-1 max-w-md mx-auto" : squadSize === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              {activeSquad.map(p => {
                const heroName = currentLoadout[p];
                const heroData = heroName ? FLAT_HERO_LIST.find(h => h.name === heroName) : null;
                const style = heroData ? ROLE_STYLES[heroData.role] : null;
                const isCompleted = heroName && completedMissions[p]?.[heroName];
                
                return (
                  <Card key={p} className={cn("relative overflow-hidden transition-all duration-300 group min-h-[200px] flex flex-col backdrop-blur-md shadow-md dark:shadow-none", heroName ? "border-primary/40 dark:border-primary/30 bg-gradient-to-br from-card/80 to-background/40" : "border-dashed border-border/40 bg-muted/5 dark:bg-card/10", style ? style.border : "")}>
                      {style && <div className={cn("absolute inset-0 opacity-[0.05] dark:opacity-[0.08] pointer-events-none group-hover:opacity-[0.1] transition-opacity bg-gradient-to-br", style.bg.replace("/10", "/30"))} />}
                      <div className="p-3 flex justify-between items-start z-10">
                         <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-70">Operative {p}</span>
                            <span className="text-xs font-bold text-foreground">{agentNames[p]}</span>
                         </div>
                         <Badge variant="outline" className="text-[9px] uppercase tracking-wider bg-background/50 backdrop-blur-sm border-border/40 text-muted-foreground">{squadRoles[p]}</Badge>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
                         <AnimatePresence mode="wait">
                            {heroName ? (
                             <motion.div key={heroName} initial={{ opacity: 0, scale: 0.8, filter: "blur(8px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} className="flex flex-col items-center gap-3">
                                <div className="relative">
                                    {style && <style.icon className={cn("h-12 w-12 opacity-10 dark:opacity-20 absolute -top-2 -left-2 transform -rotate-12", style.color)} />}
                                    <h2 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic drop-shadow-lg relative z-10 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">{heroName}</h2>
                                </div>
                                {style && <span className={cn("text-[9px] font-black uppercase tracking-[0.3em] px-3 py-1 rounded-full bg-background/80 backdrop-blur-md border shadow-sm", style.color, style.border)}>{heroData?.role}</span>}
                             </motion.div>
                            ) : (
                             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-muted-foreground/30">
                                <Activity className="h-10 w-10 mb-2 opacity-30 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-[0.25em]">Awaiting Orders</span>
                             </motion.div>
                            )}
                         </AnimatePresence>
                      </div>
                      {heroName && (
                        <div className="p-2 border-t border-border/20 bg-muted/10 backdrop-blur-sm z-10">
                           <Button size="sm" variant={isCompleted ? "outline" : "secondary"} className={cn("w-full h-8 text-[10px] font-black uppercase tracking-widest transition-all", isCompleted ? "text-muted-foreground border-border/40" : "bg-foreground/90 text-background hover:bg-foreground")} onClick={() => isCompleted ? undoMission(p, heroName) : completeMission(p)}>
                             {isCompleted ? <><Undo2 className="mr-2 h-3.5 w-3.5"/> Reactivate</> : <><CheckCircle2 className="mr-2 h-3.5 w-3.5"/> Mark Complete</>}
                           </Button>
                        </div>
                      )}
                      {isCompleted && <div className="absolute inset-0 bg-background/60 dark:bg-background/80 backdrop-blur-[1px] z-0 flex items-center justify-center pointer-events-none"><Badge className="bg-green-500 dark:bg-green-600 text-white border-none text-[10px] font-black uppercase tracking-widest px-3 py-1 shadow-lg animate-in zoom-in">Mission Complete</Badge></div>}
                  </Card>
                );
              })}
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-border/40 shadow-md bg-card/30 backdrop-blur-md">
                 <CardHeader className="bg-muted/30 pb-2 border-b border-border/40">
                    <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Mission Debrief</CardTitle>
                 </CardHeader>
                 <CardContent className="p-4">
                    <div className="h-[150px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {activeSquad.map(p => {
                            const completed = Object.keys(completedMissions[p] || {});
                            if(completed.length === 0) return null;
                            return (
                                <div key={p} className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider pl-1 opacity-70">{agentNames[p]}</span>
                                    <div className="flex flex-wrap gap-1.5">{completed.map(c => <Badge key={c} variant="secondary" className="text-[9px] px-2 h-5 cursor-pointer hover:bg-destructive hover:text-white transition-colors border border-border/30 bg-background/50" onClick={() => undoMission(p, c)}>{c}</Badge>)}</div>
                                </div>
                            )
                        })}
                        {activeSquad.every(p => Object.keys(completedMissions[p] || {}).length === 0) && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-2"><AlertCircle className="h-6 w-6 opacity-40" /><span className="text-[10px] uppercase font-bold tracking-wider">No successful missions logged</span></div>}
                    </div>
                 </CardContent>
              </Card>

              <Card className="border-border/40 shadow-md bg-card/30 backdrop-blur-md">
                 <CardHeader className="bg-muted/30 pb-2 border-b border-border/40">
                    <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Terminal className="h-4 w-4 text-blue-500" /> Operation Log</CardTitle>
                 </CardHeader>
                 <CardContent className="p-4 relative">
                    <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)] pointer-events-none"></div>
                    <div className="h-[150px] overflow-y-auto custom-scrollbar relative z-10">
                        <div className="space-y-1 font-mono text-[11px]">
                            {missionLog.length === 0 && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-2 mt-4"><span className="text-[10px] uppercase font-bold tracking-wider">Log Empty</span></div>}
                            {missionLog.map((h, i) => {
                                const role = FLAT_HERO_LIST.find(x => x.name === h)?.role;
                                const style = role ? ROLE_STYLES[role] : null;
                                return (
                                    <div key={`${h}-${i}`} className="flex items-center justify-between py-1.5 border-b border-dashed border-border/40 last:border-0 hover:bg-muted/20 px-2 rounded-sm group">
                                        <span className="font-semibold opacity-80 group-hover:opacity-100 transition-opacity"><span className="text-muted-foreground/50 mr-2">[{String(i + 1).padStart(2, '0')}]</span> {h}</span>
                                        {style && <span className={cn("text-[9px] font-black uppercase tracking-wider opacity-50 group-hover:opacity-100 transition-opacity", style.color)}>{role}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                 </CardContent>
              </Card>
           </div>
        </div>
      </div>
      </div>
    </div>
  );
}
