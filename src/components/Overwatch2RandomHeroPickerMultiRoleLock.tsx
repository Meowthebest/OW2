import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dice5, Filter, Trash2, History, Repeat,
  CheckCircle2, Undo2, Trophy, Users, Shield, Sword, Heart, 
  Activity, AlertCircle
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
  Tank:    { color: "text-blue-500",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Shield },
  Damage:  { color: "text-red-500",     bg: "bg-red-500/10",     border: "border-red-500/20",     icon: Sword },
  Support: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: Heart },
};

// CLEAN Hero List (No fake heroes)
const HERO_DATABASE = {
Tank: [
  "D.Va","Doomfist","Hazard","Junker Queen","Mauga","Orisa",
  "Ramattra","Reinhardt","Roadhog","Sigma","Winston",
  "Wrecking Ball","Zarya"
],

Damage: [
  "Ashe","Bastion","Cassidy","Echo","Genji","Hanzo","Junkrat",
  "Mei","Pharah","Reaper","Sojourn","Soldier: 76","Sombra",
  "Symmetra","Torbjörn","Tracer","Venture","Widowmaker",
  "Freja","Vendetta"
],

Support: [
  "Ana","Baptiste","Brigitte","Illari","Juno","Kiriko",
  "Lifeweaver","Lúcio","Mercy","Moira","Zenyatta",
  "Wuyang"
]
,
} as const;

const ROLES = ["All", "Tank", "Damage", "Support"] as const;
type RoleType = typeof ROLES[number];
type RoleKey = keyof typeof HERO_DATABASE;

// Flatten database for searching
const FLAT_HERO_LIST = (Object.entries(HERO_DATABASE) as [RoleKey, readonly string[]][])
  .flatMap(([role, list]) => list.map((name) => ({ name, role })));

const MAX_PLAYERS = 5;
const PLAYERS_INDICES = [1, 2, 3, 4, 5] as const;
type PlayerID = typeof PLAYERS_INDICES[number];

/* ---------- 2. HOOK: Persistent Storage ---------- */

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
  
  // --- Persistent State (Saved Settings) ---
  const [squadSize, setSquadSize] = useLocalStorage<number>("ow2_squad_size", 2);
  const [squadRoles, setSquadRoles] = useLocalStorage<Record<PlayerID, RoleType>>("ow2_squad_roles", { 1:"All", 2:"All", 3:"All", 4:"All", 5:"All" });
  const [agentNames, setAgentNames] = useLocalStorage<Record<PlayerID, string>>("ow2_agent_names", { 1:"Agent 1", 2:"Agent 2", 3:"Agent 3", 4:"Agent 4", 5:"Agent 5" });
  
  const [filterRole, setFilterRole] = useLocalStorage<RoleType>("ow2_filter_role", "All");
  const [bannedHeroes, setBannedHeroes] = useLocalStorage<Record<string, boolean>>("ow2_banned_list", {});
  const [challengeMode, setChallengeMode] = useLocalStorage<boolean>("ow2_mode_challenge", true);
  const [noDuplicates, setNoDuplicates] = useLocalStorage<boolean>("ow2_mode_unique", false);
  
  const [completedMissions, setCompletedMissions] = useLocalStorage<Record<PlayerID, Record<string, boolean>>>("ow2_missions_done", {1:{},2:{},3:{},4:{},5:{}});
  const [missionLog, setMissionLog] = useLocalStorage<string[]>("ow2_global_log", []);

  // --- Transient State (Live Data) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [currentLoadout, setCurrentLoadout] = useState<Record<PlayerID, string | null>>({1:null, 2:null, 3:null, 4:null, 5:null});
  const [isComputing, setIsComputing] = useState(false);

  // --- Derived Data ---
  const activeSquad = useMemo(() => PLAYERS_INDICES.slice(0, squadSize), [squadSize]);

  const getHeroesByRole = useCallback((r: RoleType) => 
    r === "All" ? FLAT_HERO_LIST : FLAT_HERO_LIST.filter(h => h.role === (r as RoleKey)), 
  []);

  const filteredPool = useMemo(() => {
    const list = getHeroesByRole(filterRole);
    return list.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [filterRole, searchQuery, getHeroesByRole]);

  // Calculate stats for the UI
  const poolStats = useMemo(() => {
    const total = filteredPool.length;
    const banned = filteredPool.filter(h => bannedHeroes[h.name]).length;
    return { total, banned, ready: Math.max(0, total - banned) };
  }, [filteredPool, bannedHeroes]);

  // --- Logic Engine ---
  
  const generateLoadout = useCallback(() => {
    // 1. Validate if we can roll
    const availablePools: Record<PlayerID, string[]> = {} as any;
    let hasViablePool = false;

    const sessionBans = new Set(noDuplicates ? missionLog : []); 
    const bannedSet = new Set(Object.keys(bannedHeroes).filter(k => bannedHeroes[k]));

    activeSquad.forEach(p => {
      // Start with role-based list
      let pool = getHeroesByRole(squadRoles[p]).map(h => h.name);
      
      // Remove Global Bans
      pool = pool.filter(n => !bannedSet.has(n));
      
      // Remove Completed Challenges (if mode active)
      if (challengeMode) {
        const done = completedMissions[p] || {};
        pool = pool.filter(n => !done[n]);
      }

      // Remove Session Duplicates (if mode active)
      if (noDuplicates) {
         // Try to remove recent history
         const strictPool = pool.filter(n => !sessionBans.has(n));
         if (strictPool.length > 0) pool = strictPool;
      }
      
      availablePools[p] = pool;
      if (pool.length > 0) hasViablePool = true;
    });

    if (!hasViablePool) {
      alert("Tactical Error: No heroes available in the pool based on current filters.");
      return;
    }

    // 2. Animate the Roll
    setIsComputing(true);
    let ticks = 0;
    const maxTicks = 12; // Length of animation
    const interval = 60; // Speed of shuffle

    const timer = setInterval(() => {
      ticks++;
      const draftPicks = {} as Record<PlayerID, string | null>;
      const takenThisRound = new Set<string>();

      activeSquad.forEach(p => {
        const pool = availablePools[p];
        if (pool.length === 0) {
          draftPicks[p] = null;
        } else {
          // Avoid duplicate heroes across players in the same roll
          const uniquePool = pool.filter(n => !takenThisRound.has(n));
          const finalPool = uniquePool.length > 0 ? uniquePool : pool;
          
          const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
          draftPicks[p] = pick;
          takenThisRound.add(pick);
        }
      });

      setCurrentLoadout(prev => ({ ...prev, ...draftPicks }));

      if (ticks >= maxTicks) {
        clearInterval(timer);
        setIsComputing(false);
        finalizeMission(draftPicks);
      }
    }, interval);
  }, [activeSquad, squadRoles, bannedHeroes, challengeMode, noDuplicates, missionLog, completedMissions, getHeroesByRole]);

  const finalizeMission = (picks: Record<PlayerID, string | null>) => {
    setMissionLog(prev => {
      const nextLog = [...prev];
      activeSquad.forEach(p => {
        const hero = picks[p];
        if (hero) {
           // Remove if exists to move to top
           const idx = nextLog.indexOf(hero);
           if (idx > -1) nextLog.splice(idx, 1);
           nextLog.unshift(hero);
        }
      });
      return nextLog.slice(0, 40); // Keep last 40
    });
  };

  // --- Interactions ---

  const toggleBan = (name: string) => setBannedHeroes(prev => ({ ...prev, [name]: !prev[name] }));
  
  const completeMission = (p: PlayerID) => {
    const hero = currentLoadout[p];
    if (!hero) return;
    setCompletedMissions(prev => ({
      ...prev,
      [p]: { ...(prev[p] || {}), [hero]: true }
    }));
    // Clear pick visually to show done state
    setCurrentLoadout(prev => ({ ...prev, [p]: null }));
  };

  const undoMission = (p: PlayerID, hero: string) => {
    setCompletedMissions(prev => {
      const pData = { ...(prev[p] || {}) };
      delete pData[hero];
      return { ...prev, [p]: pData };
    });
  };

  const markAllComplete = () => {
    activeSquad.forEach(p => completeMission(p));
  };

  const factoryReset = () => {
    if (confirm("WARNING: This will wipe all mission data and configurations. Proceed?")) {
      setBannedHeroes({});
      setMissionLog([]);
      setCompletedMissions({1:{},2:{},3:{},4:{},5:{}});
      setCurrentLoadout({1:null,2:null,3:null,4:null,5:null});
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-8 font-sans">
      
      {/* 1. TOP BAR */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-4xl font-black italic tracking-tighter bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent uppercase drop-shadow-sm">
            Overwatch 2 <span className="text-foreground/80 text-2xl not-italic tracking-normal normal-case">/ Tactical Link</span>
          </h1>
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mt-1">
            Squad Randomization Protocol • v2.4
          </p>
        </motion.div>
        
        <div className="flex items-center gap-3 bg-card border rounded-lg p-2 shadow-sm">
           <div className="flex items-center gap-2 px-2">
             <Users className="h-4 w-4 text-primary" />
             <Select value={String(squadSize)} onValueChange={(v) => setSquadSize(Number(v))}>
               <SelectTrigger className="w-[110px] h-8 text-xs font-bold uppercase"><SelectValue /></SelectTrigger>
               <SelectContent>
                 {PLAYERS_INDICES.map(n => <SelectItem key={n} value={String(n)}>{n} Operatives</SelectItem>)}
               </SelectContent>
             </Select>
           </div>
           <Separator orientation="vertical" className="h-6" />
           <div className="flex items-center gap-2 px-2">
             <Switch id="challenge-mode" checked={challengeMode} onCheckedChange={setChallengeMode} />
             <label htmlFor="challenge-mode" className="text-xs font-bold uppercase cursor-pointer flex items-center gap-1">
               <Trophy className="h-3 w-3 text-amber-500" /> Challenge
             </label>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* 2. LEFT PANEL: CONFIGURATION */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-border/60 shadow-md">
            <CardHeader className="bg-muted/30 pb-3 border-b">
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" /> Squad Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              
              {/* Squad Setup */}
              <div className="space-y-3">
                 {activeSquad.map(p => (
                   <div key={p} className="flex items-center gap-2 animate-in slide-in-from-left-2 fade-in duration-300" style={{ animationDelay: `${p * 50}ms` }}>
                      <Badge variant="outline" className="h-8 w-8 flex items-center justify-center rounded-md bg-background text-xs font-black shadow-sm">
                        {p}
                      </Badge>
                      <Input 
                        className="h-8 text-sm font-semibold bg-background/50" 
                        placeholder={`Agent ${p}`} 
                        value={agentNames[p]} 
                        onChange={e => setAgentNames(prev => ({...prev, [p]: e.target.value}))} 
                      />
                      <Select value={squadRoles[p]} onValueChange={v => setSquadRoles(prev => ({...prev, [p]: v as RoleType}))}>
                        <SelectTrigger className="h-8 w-[110px] text-[10px] font-bold uppercase tracking-wider"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                   </div>
                 ))}
              </div>

              <Separator />

              {/* Hero Pool Filter */}
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                       Database Status: <span className="text-primary">{poolStats.ready} Ready</span> <span className="text-muted-foreground/50">/ {poolStats.banned} Banned</span>
                    </label>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setBannedHeroes({})} title="Unban All">
                       <Undo2 className="h-3 w-3" />
                    </Button>
                 </div>

                 <Tabs value={filterRole} onValueChange={v => setFilterRole(v as RoleType)} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 h-8">
                       {ROLES.map(r => <TabsTrigger key={r} value={r} className="text-[10px] font-bold uppercase">{r}</TabsTrigger>)}
                    </TabsList>
                 </Tabs>

                 <Input 
                    placeholder="Search database..." 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                    className="h-8 text-xs bg-background/50"
                 />

                 <div className="h-[220px] overflow-y-auto rounded-md border bg-muted/20 p-1">
                    <div className="grid grid-cols-2 gap-1">
                       {filteredPool.map((h) => (
                         <div key={h.name} 
                              className={cn(
                                "flex items-center gap-2 rounded px-2 py-1.5 transition-all cursor-pointer select-none group border border-transparent",
                                bannedHeroes[h.name] ? "bg-destructive/10 opacity-70" : "hover:bg-background hover:border-border hover:shadow-sm"
                              )}
                              onClick={() => toggleBan(h.name)}
                         >
                            <Checkbox 
                                id={`ban-${h.name}`} 
                                checked={!!bannedHeroes[h.name]} 
                                className="h-3.5 w-3.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive" 
                            />
                            <span className={cn(
                                "text-xs flex-1 truncate font-semibold", 
                                bannedHeroes[h.name] ? "text-muted-foreground line-through decoration-destructive" : "text-foreground"
                            )}>
                                {h.name}
                            </span>
                            <div className={cn("h-1.5 w-1.5 rounded-full ring-1 ring-inset ring-white/10", ROLE_STYLES[h.role].bg.replace("/10", ""))} />
                         </div>
                       ))}
                       {filteredPool.length === 0 && <div className="col-span-2 text-center text-xs text-muted-foreground py-8">No matching data found.</div>}
                    </div>
                 </div>

                 <div className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 border border-amber-500/20">
                    <Switch id="unique-mode" checked={noDuplicates} onCheckedChange={setNoDuplicates} className="scale-75 data-[state=checked]:bg-amber-500" />
                    <label htmlFor="unique-mode" className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 cursor-pointer">
                       Unique Protocol (No Session Repeats)
                    </label>
                 </div>
              </div>

              <Button variant="outline" className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 uppercase tracking-widest font-bold h-9" onClick={factoryReset}>
                 <Trash2 className="mr-2 h-3 w-3" /> Abort & Factory Reset
              </Button>

            </CardContent>
          </Card>
        </div>

        {/* 3. RIGHT PANEL: MISSION CONTROL */}
        <div className="lg:col-span-8 space-y-6">
           
           {/* Command Bar */}
           <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
             <Button 
               size="lg" 
               onClick={generateLoadout} 
               disabled={isComputing}
               // Used HEX color to guarantee orange visibility regardless of tailwind config issues
               className="w-full sm:w-auto min-w-[240px] bg-[#f99e1a] hover:bg-[#e0890d] text-white font-black text-xl italic tracking-widest h-14 shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all uppercase"
             >
               <Dice5 className={cn("mr-3 h-6 w-6", isComputing && "animate-spin")} />
               {isComputing ? "DEPLOYING..." : "INITIATE DEPLOYMENT"}
             </Button>

             <div className="flex gap-2 w-full sm:w-auto">
                 <Button variant="secondary" onClick={() => setCurrentLoadout({1:null,2:null,3:null,4:null,5:null})} disabled={isComputing} className="flex-1 sm:flex-none">
                    <Repeat className="mr-2 h-4 w-4" /> Clear
                 </Button>
                 {squadSize > 1 && (
                   <Button variant="outline" onClick={markAllComplete} disabled={Object.values(currentLoadout).every(v => !v)} className="flex-1 sm:flex-none border-green-500/30 hover:bg-green-500/10 hover:text-green-600">
                     <CheckCircle2 className="mr-2 h-4 w-4" /> Complete All
                   </Button>
                 )}
             </div>
           </div>

           {/* Deployment Grid */}
           <div className={cn("grid gap-4", squadSize === 1 ? "grid-cols-1 max-w-md mx-auto" : squadSize === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              {activeSquad.map(p => {
                const heroName = currentLoadout[p];
                const heroData = heroName ? FLAT_HERO_LIST.find(h => h.name === heroName) : null;
                const style = heroData ? ROLE_STYLES[heroData.role] : null;
                const isCompleted = heroName && completedMissions[p]?.[heroName];
                
                return (
                  <Card key={p} className={cn(
                      "relative overflow-hidden transition-all duration-300 group min-h-[180px] flex flex-col", 
                      heroName ? "border-primary/50 shadow-lg" : "border-dashed border-border/60 bg-muted/5",
                      style ? style.border : ""
                  )}>
                      {style && <div className={cn("absolute inset-0 opacity-[0.04] pointer-events-none group-hover:opacity-[0.08] transition-opacity", style.bg.replace("/10", ""))} />}
                      
                      {/* Card Header */}
                      <div className="p-3 flex justify-between items-start z-10">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-70">Operative {p}</span>
                            <span className="text-xs font-bold text-foreground">{agentNames[p]}</span>
                         </div>
                         <Badge variant="outline" className="text-[9px] uppercase tracking-wider bg-background/80 backdrop-blur-sm border-border/50">
                            {squadRoles[p]}
                         </Badge>
                      </div>

                      {/* Card Body */}
                      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
                         <AnimatePresence mode="wait">
                            {heroName ? (
                             <motion.div 
                               key={heroName}
                               initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                               animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                               className="flex flex-col items-center gap-2"
                             >
                                <div className="relative">
                                    {style && <style.icon className={cn("h-10 w-10 opacity-20 absolute -top-1 -left-1", style.color)} />}
                                    <h2 className="text-3xl font-black tracking-tighter uppercase italic drop-shadow-md relative z-10">
                                       {heroName}
                                    </h2>
                                </div>
                                {style && (
                                   <span className={cn("text-[9px] font-black uppercase tracking-[0.3em] px-2 py-0.5 rounded-full bg-background/50 border", style.color, style.border)}>
                                     {heroData?.role}
                                   </span>
                                )}
                             </motion.div>
                            ) : (
                             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-muted-foreground/30">
                                <Activity className="h-12 w-12 mb-2 opacity-20 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Awaiting Orders</span>
                             </motion.div>
                            )}
                         </AnimatePresence>
                      </div>

                      {/* Card Footer */}
                      {heroName && (
                        <div className="p-2 border-t bg-muted/10 backdrop-blur-sm z-10">
                           <Button 
                             size="sm" 
                             variant={isCompleted ? "outline" : "secondary"}
                             className={cn("w-full h-8 text-[10px] font-black uppercase tracking-widest transition-all", isCompleted ? "text-muted-foreground" : "bg-foreground text-background hover:bg-foreground/90")}
                             onClick={() => isCompleted ? undoMission(p, heroName) : completeMission(p)}
                           >
                             {isCompleted ? <><Undo2 className="mr-2 h-3 w-3"/> Reactivate</> : <><CheckCircle2 className="mr-2 h-3 w-3"/> Mark Complete</>}
                           </Button>
                        </div>
                      )}
                      
                      {/* Success Overlay */}
                      {isCompleted && (
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] z-0 flex items-center justify-center pointer-events-none">
                           <Badge className="bg-green-500 text-white border-none text-xs font-black uppercase tracking-widest px-3 py-1 shadow-lg animate-in zoom-in">
                              Mission Complete
                           </Badge>
                        </div>
                      )}
                  </Card>
                );
              })}
           </div>

           {/* 4. STATS AREA */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Completed List */}
              <Card>
                 <CardHeader className="bg-muted/20 pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-500" /> Mission Debrief
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="p-4">
                    <div className="h-[140px] overflow-y-auto pr-2 space-y-3">
                        {activeSquad.map(p => {
                            const completed = Object.keys(completedMissions[p] || {});
                            if(completed.length === 0) return null;
                            return (
                                <div key={p} className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider pl-1">{agentNames[p]}</span>
                                    <div className="flex flex-wrap gap-1">
                                        {completed.map(c => (
                                            <Badge key={c} variant="secondary" className="text-[9px] px-2 h-5 cursor-pointer hover:bg-destructive hover:text-white transition-colors" onClick={() => undoMission(p, c)}>
                                                {c}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                        {activeSquad.every(p => Object.keys(completedMissions[p] || {}).length === 0) && (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                                <AlertCircle className="h-6 w-6 opacity-50" />
                                <span className="text-[10px] uppercase font-bold tracking-wider">No successful missions logged</span>
                            </div>
                        )}
                    </div>
                 </CardContent>
              </Card>

              {/* History Log */}
              <Card>
                 <CardHeader className="bg-muted/20 pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <History className="h-4 w-4 text-blue-500" /> Operation Log
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="p-4">
                    <div className="h-[140px] overflow-y-auto custom-scrollbar">
                        <div className="space-y-1 font-mono text-xs">
                            {missionLog.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2 mt-4">
                                    <span className="text-[10px] uppercase font-bold tracking-wider">Log Empty</span>
                                </div>
                            )}
                            {missionLog.map((h, i) => {
                                const role = FLAT_HERO_LIST.find(x => x.name === h)?.role;
                                const style = role ? ROLE_STYLES[role] : null;
                                return (
                                    <div key={`${h}-${i}`} className="flex items-center justify-between py-1 border-b border-dashed border-border/50 last:border-0 hover:bg-muted/20 px-1">
                                        <span className="font-semibold opacity-90">{i + 1}. {h}</span>
                                        {style && <span className={cn("text-[9px] font-black uppercase tracking-wider opacity-60", style.color)}>{role}</span>}
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
  );
}
