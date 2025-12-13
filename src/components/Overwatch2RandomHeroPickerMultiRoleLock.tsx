import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dice5, Filter, Trash2, History, Repeat,
  CheckCircle2, Undo2, Trophy, Users, Shield, Sword, Heart, 
  Activity, AlertCircle, Sun, Moon, Ban
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

import { cn } from "@/lib/utils";

/* ---------- CONFIG ---------- */

const ROLE_STYLES = {
  Tank:    { color: "text-blue-500",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Shield },
  Damage:  { color: "text-red-500",     bg: "bg-red-500/10",     border: "border-red-500/20",     icon: Sword },
  Support: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: Heart },
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

/* ---------- COMPONENT ---------- */

function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      if (typeof window === "undefined") return initialValue;
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) { return initialValue; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(storedValue)); } catch (error) {}
  }, [key, storedValue]);
  return [storedValue, setStoredValue] as const;
}

export default function Overwatch2TacticalPicker() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>("ow2_theme_pref", "dark");
  const [playerCount, setPlayerCount] = useLocalStorage<number>("ow2_player_count", 2);
  const [playerRoles, setPlayerRoles] = useLocalStorage<Record<PlayerID, RoleType>>("ow2_player_roles", { 1:"All", 2:"All", 3:"All", 4:"All", 5:"All" });
  const [playerNames, setPlayerNames] = useLocalStorage<Record<PlayerID, string>>("ow2_player_names", { 1:"Player 1", 2:"Player 2", 3:"Player 3", 4:"Player 4", 5:"Player 5" });
  
  const [filterRole, setFilterRole] = useLocalStorage<RoleType>("ow2_filter_role", "All");
  const [bannedHeroes, setBannedHeroes] = useLocalStorage<Record<string, boolean>>("ow2_banned_list", {});
  const [challengeMode, setChallengeMode] = useLocalStorage<boolean>("ow2_mode_challenge", true);
  const [noDuplicates, setNoDuplicates] = useLocalStorage<boolean>("ow2_mode_unique", false);
  const [completedMissions, setCompletedMissions] = useLocalStorage<Record<PlayerID, Record<string, boolean>>>("ow2_missions_done", {1:{},2:{},3:{},4:{},5:{}});
  const [missionLog, setMissionLog] = useLocalStorage<string[]>("ow2_global_log", []);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentLoadout, setCurrentLoadout] = useState<Record<PlayerID, string | null>>({1:null, 2:null, 3:null, 4:null, 5:null});
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const activePlayers = useMemo(() => PLAYERS_INDICES.slice(0, playerCount), [playerCount]);
  const getHeroesByRole = useCallback((r: RoleType) => r === "All" ? FLAT_HERO_LIST : FLAT_HERO_LIST.filter(h => h.role === (r as RoleKey)), []);
  const filteredPool = useMemo(() => {
    const list = getHeroesByRole(filterRole);
    return list.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [filterRole, searchQuery, getHeroesByRole]);
  const poolStats = useMemo(() => {
    const total = filteredPool.length;
    const banned = filteredPool.filter(h => bannedHeroes[h.name]).length;
    return { total, banned, ready: Math.max(0, total - banned) };
  }, [filteredPool, bannedHeroes]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const generateLoadout = useCallback(() => {
    const availablePools: Record<PlayerID, string[]> = {} as any;
    let hasViablePool = false;
    const sessionBans = new Set(noDuplicates ? missionLog : []); 
    const bannedSet = new Set(Object.keys(bannedHeroes).filter(k => bannedHeroes[k]));

    activePlayers.forEach(p => {
      let pool = getHeroesByRole(playerRoles[p]).map(h => h.name);
      pool = pool.filter(n => !bannedSet.has(n));
      if (challengeMode) { const done = completedMissions[p] || {}; pool = pool.filter(n => !done[n]); }
      if (noDuplicates) { const strictPool = pool.filter(n => !sessionBans.has(n)); if (strictPool.length > 0) pool = strictPool; }
      availablePools[p] = pool;
      if (pool.length > 0) hasViablePool = true;
    });

    if (!hasViablePool) { alert("Error: No heroes available."); return; }

    setIsRolling(true);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
      const draftPicks = {} as Record<PlayerID, string | null>;
      const takenThisRound = new Set<string>();
      activePlayers.forEach(p => {
        const pool = availablePools[p];
        if (pool.length === 0) { draftPicks[p] = null; } else {
          const uniquePool = pool.filter(n => !takenThisRound.has(n));
          const finalPool = uniquePool.length > 0 ? uniquePool : pool;
          const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
          draftPicks[p] = pick;
          takenThisRound.add(pick);
        }
      });
      setCurrentLoadout(prev => ({ ...prev, ...draftPicks }));
      if (ticks >= 10) { clearInterval(timer); setIsRolling(false); finalizeMission(draftPicks); }
    }, 60);
  }, [activePlayers, playerRoles, bannedHeroes, challengeMode, noDuplicates, missionLog, completedMissions, getHeroesByRole]);

  const finalizeMission = (picks: Record<PlayerID, string | null>) => {
    setMissionLog(prev => {
      const nextLog = [...prev];
      activePlayers.forEach(p => {
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
    const hero = currentLoadout[p]; if (!hero) return;
    setCompletedMissions(prev => ({ ...prev, [p]: { ...(prev[p] || {}), [hero]: true } }));
    setCurrentLoadout(prev => ({ ...prev, [p]: null }));
  };
  const undoMission = (p: PlayerID, hero: string) => {
    setCompletedMissions(prev => { const pData = { ...(prev[p] || {}) }; delete pData[hero]; return { ...prev, [p]: pData }; });
  };
  const markAllComplete = () => activePlayers.forEach(p => completeMission(p));
  const factoryReset = () => { if (confirm("Reset?")) { setBannedHeroes({}); setMissionLog([]); setCompletedMissions({1:{},2:{},3:{},4:{},5:{}}); setCurrentLoadout({1:null,2:null,3:null,4:null,5:null}); } };

  return (
    <div className="min-h-screen bg-background transition-colors duration-300 font-sans text-sm">
      <div className="mx-auto max-w-6xl p-3 space-y-4">
      
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl bg-card/50 p-3 border shadow-sm">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-2xl font-black italic tracking-tighter bg-gradient-to-br from-orange-400 to-amber-600 dark:from-orange-500 dark:to-yellow-500 bg-clip-text text-transparent uppercase">
            Overwatch 2 <span className="text-foreground/70 text-lg not-italic tracking-normal normal-case">/ Randomizer</span>
          </h1>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2">
           <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 rounded-full border hover:bg-accent text-foreground">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-yellow-500" /> : <Moon className="h-4 w-4 text-slate-700" />}
           </Button>
           <div className="flex items-center gap-2 bg-background/80 border rounded-full p-1 px-3 shadow-sm">
             <Select value={String(playerCount)} onValueChange={(v) => setPlayerCount(Number(v))}>
                 <SelectTrigger className="h-6 text-xs font-bold uppercase border-0 bg-transparent focus:ring-0 gap-1 w-auto"><SelectValue /></SelectTrigger>
                 <SelectContent>{PLAYERS_INDICES.map(n => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "Player" : "Players"}</SelectItem>)}</SelectContent>
             </Select>
             <Separator orientation="vertical" className="h-4" />
             <div className="flex items-center gap-2">
               <label className="text-[10px] font-bold uppercase cursor-pointer text-muted-foreground hover:text-foreground">Challenge</label>
               <Switch checked={challengeMode} onCheckedChange={setChallengeMode} className="scale-75 data-[state=checked]:bg-amber-500" />
             </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT PANEL */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-border/40 bg-card/30 backdrop-blur-md">
            <CardHeader className="bg-muted/30 py-2 px-3 border-b border-border/40">
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Filter className="h-3 w-3 text-primary" /> Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              <div className="space-y-2">
                 {activePlayers.map(p => (
                   <div key={p} className="flex items-center gap-1">
                      <Badge variant="outline" className="h-7 w-7 flex items-center justify-center rounded-md bg-background/80 text-[10px] font-black shadow-sm border-border/50 shrink-0">{p}</Badge>
                      <Input className="h-7 text-xs font-semibold bg-background/50 border-border/50 focus-visible:ring-primary/30 min-w-0" value={playerNames[p]} onChange={e => setPlayerNames(prev => ({...prev, [p]: e.target.value}))} />
                      <Select value={playerRoles[p]} onValueChange={v => setPlayerRoles(prev => ({...prev, [p]: v as RoleType}))}>
                        <SelectTrigger className="h-7 w-[90px] text-[9px] font-bold uppercase tracking-wider bg-background/50 border-border/50 shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                   </div>
                 ))}
              </div>
              <Separator className="bg-border/60" />
              <div className="space-y-2">
                 <div className="flex items-center justify-between"><label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Bans ({poolStats.banned})</label></div>
                 <Tabs value={filterRole} onValueChange={v => setFilterRole(v as RoleType)} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 h-6 bg-muted/40 p-0.5">{ROLES.map(r => <TabsTrigger key={r} value={r} className="text-[9px] font-bold uppercase">{r}</TabsTrigger>)}</TabsList>
                 </Tabs>
                 <Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-7 text-xs bg-background/40 border-border/40" />
                 <div className="h-[180px] overflow-y-auto rounded-md border border-border/40 bg-background/20 p-1 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-1">
                       {filteredPool.map((h) => (
                         <div key={h.name} className={cn("flex items-center gap-1 rounded-md px-1.5 py-1 transition-all cursor-pointer select-none border border-transparent", bannedHeroes[h.name] ? "bg-destructive/10 border-destructive/20 opacity-80" : "hover:bg-background/80 hover:border-border/30")} onClick={() => toggleBan(h.name)}>
                            <Checkbox checked={!!bannedHeroes[h.name]} className="h-3 w-3 rounded-sm" />
                            <span className={cn("text-[10px] flex-1 truncate font-medium", bannedHeroes[h.name] ? "text-destructive line-through" : "text-foreground/90")}>{h.name}</span>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
              <Button variant="outline" className="w-full h-7 text-[10px] text-muted-foreground hover:text-destructive uppercase tracking-widest font-bold border-border/40" onClick={factoryReset}><Trash2 className="mr-2 h-3 w-3" /> Reset</Button>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-8 space-y-4">
           <div className="flex flex-col sm:flex-row items-center gap-3 bg-card/30 backdrop-blur-md p-3 rounded-xl border border-border/40 shadow-lg relative overflow-hidden">
             <Button size="lg" onClick={generateLoadout} disabled={isRolling} className="w-full sm:w-auto min-w-[200px] bg-[#f99e1a] hover:bg-[#e0890d] text-white font-black text-lg italic tracking-widest h-12 shadow-xl shadow-orange-500/20 uppercase relative z-10 border-t border-white/20 active:scale-[0.98]">
               <Dice5 className={cn("mr-2 h-5 w-5", isRolling && "animate-spin")} /> {isRolling ? "Rolling..." : "RANDOMIZE"}
             </Button>
             <div className="flex gap-2 w-full sm:w-auto z-10">
                 <Button variant="secondary" onClick={() => setCurrentLoadout({1:null,2:null,3:null,4:null,5:null})} disabled={isRolling} className="flex-1 sm:flex-none h-12 bg-background/50 hover:bg-background/80 border border-border/30"><Repeat className="mr-2 h-4 w-4" /> Clear</Button>
                 {playerCount > 1 && <Button variant="outline" onClick={markAllComplete} disabled={Object.values(currentLoadout).every(v => !v)} className="flex-1 sm:flex-none h-12 border-green-500/30 hover:bg-green-500/10 hover:text-green-500 dark:hover:text-green-400"><CheckCircle2 className="mr-2 h-4 w-4" /> All Done</Button>}
             </div>
           </div>

           <div className={cn("grid gap-3", playerCount === 1 ? "grid-cols-1 max-w-md mx-auto" : playerCount === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              {activePlayers.map(p => {
                const heroName = currentLoadout[p];
                const heroData = heroName ? FLAT_HERO_LIST.find(h => h.name === heroName) : null;
                const style = heroData ? ROLE_STYLES[heroData.role] : null;
                const isCompleted = heroName && completedMissions[p]?.[heroName];
                
                return (
                  <Card key={p} className={cn("relative overflow-hidden transition-all duration-300 group min-h-[160px] flex flex-col backdrop-blur-md shadow-md dark:shadow-none", heroName ? "border-primary/40 dark:border-primary/30 bg-gradient-to-br from-card/80 to-background/40" : "border-dashed border-border/40 bg-muted/5 dark:bg-card/10", style ? style.border : "")}>
                      {style && <div className={cn("absolute inset-0 opacity-[0.05] dark:opacity-[0.08] pointer-events-none transition-opacity bg-gradient-to-br", style.bg.replace("/10", "/30"))} />}
                      <div className="p-2 flex justify-between items-start z-10 gap-2">
                         <div className="flex flex-col overflow-hidden">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-70 truncate">Player {p}</span>
                            <span className="text-[10px] font-bold text-foreground truncate">{playerNames[p]}</span>
                         </div>
                         <Badge variant="outline" className="text-[9px] uppercase tracking-wider bg-background/50 backdrop-blur-sm border-border/40 text-muted-foreground shrink-0">{playerRoles[p]}</Badge>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center p-3 relative z-10 overflow-hidden">
                         <AnimatePresence mode="wait">
                            {heroName ? (
                             <motion.div key={heroName} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-1 w-full">
                                <div className="relative w-full flex justify-center">
                                    {style && <style.icon className={cn("h-8 w-8 opacity-10 dark:opacity-20 absolute -top-1 -left-1 transform -rotate-12", style.color)} />}
                                    <h2 className="text-xl sm:text-2xl font-black tracking-tighter uppercase italic drop-shadow-lg relative z-10 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent truncate w-full text-center px-1">{heroName}</h2>
                                </div>
                                {style && <span className={cn("text-[9px] font-black uppercase tracking-[0.3em] px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-md border shadow-sm shrink-0", style.color, style.border)}>{heroData?.role}</span>}
                             </motion.div>
                            ) : (
                             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-muted-foreground/30">
                                <Activity className="h-6 w-6 mb-1 opacity-30 animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-[0.25em]">Ready</span>
                             </motion.div>
                            )}
                         </AnimatePresence>
                      </div>
                      {heroName && (
                        <div className="p-2 border-t border-border/20 bg-muted/10 backdrop-blur-sm z-10">
                           <Button size="sm" variant={isCompleted ? "outline" : "secondary"} className={cn("w-full h-7 text-[10px] font-black uppercase tracking-widest transition-all", isCompleted ? "text-muted-foreground border-border/40" : "bg-foreground/90 text-background hover:bg-foreground")} onClick={() => isCompleted ? undoMission(p, heroName) : completeMission(p)}>
                             {isCompleted ? <><Undo2 className="mr-2 h-3 w-3"/> Undo</> : <><CheckCircle2 className="mr-2 h-3 w-3"/> Complete</>}
                           </Button>
                        </div>
                      )}
                      {isCompleted && <div className="absolute inset-0 bg-background/60 dark:bg-background/80 backdrop-blur-[1px] z-0 flex items-center justify-center pointer-events-none"><Badge className="bg-green-500 dark:bg-green-600 text-white border-none text-[10px] font-black uppercase tracking-widest px-3 py-1 shadow-lg animate-in zoom-in">Complete</Badge></div>}
                  </Card>
                );
              })}
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-border/40 shadow-md bg-card/30 backdrop-blur-md">
                 <CardHeader className="bg-muted/30 py-2 px-3 border-b border-border/40"><CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Trophy className="h-3 w-3 text-amber-500" /> Completed</CardTitle></CardHeader>
                 <CardContent className="p-3">
                    <div className="h-[120px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                        {activePlayers.map(p => {
                            const completed = Object.keys(completedMissions[p] || {}); if(completed.length === 0) return null;
                            return ( <div key={p} className="flex flex-col gap-1"><span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider pl-1 opacity-70">{playerNames[p]}</span><div className="flex flex-wrap gap-1.5">{completed.map(c => <Badge key={c} variant="secondary" className="text-[9px] px-1.5 h-4 cursor-pointer hover:bg-destructive hover:text-white transition-colors border border-border/30 bg-background/50" onClick={() => undoMission(p, c)}>{c}</Badge>)}</div></div> )
                        })}
                        {activePlayers.every(p => Object.keys(completedMissions[p] || {}).length === 0) && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-2"><AlertCircle className="h-5 w-5 opacity-40" /><span className="text-[9px] uppercase font-bold tracking-wider">No Data</span></div>}
                    </div>
                 </CardContent>
              </Card>
              <Card className="border-border/40 shadow-md bg-card/30 backdrop-blur-md">
                 <CardHeader className="bg-muted/30 py-2 px-3 border-b border-border/40"><CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><History className="h-3 w-3 text-blue-500" /> History</CardTitle></CardHeader>
                 <CardContent className="p-3 relative">
                    <div className="h-[120px] overflow-y-auto custom-scrollbar relative z-10">
                        <div className="space-y-1 font-mono text-[10px]">
                            {missionLog.length === 0 && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-2 mt-4"><span className="text-[9px] uppercase font-bold tracking-wider">Log Empty</span></div>}
                            {missionLog.map((h, i) => {
                                const role = FLAT_HERO_LIST.find(x => x.name === h)?.role;
                                const style = role ? ROLE_STYLES[role] : null;
                                return ( <div key={`${h}-${i}`} className="flex items-center justify-between py-1 border-b border-dashed border-border/40 last:border-0 hover:bg-muted/20 px-2 rounded-sm group gap-2"><span className="font-semibold opacity-80 group-hover:opacity-100 transition-opacity truncate flex-1"><span className="text-muted-foreground/50 mr-2">[{String(i + 1).padStart(2, '0')}]</span>{h}</span>{style && <span className={cn("text-[9px] font-black uppercase tracking-wider opacity-50 group-hover:opacity-100 transition-opacity shrink-0", style.color)}>{role}</span>}</div> );
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
