import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dice5, Filter, Trash2, History, Repeat,
  CheckCircle2, Undo2, Trophy, Shield, Sword, Heart, 
  Activity, AlertCircle, Sun, Moon, ChevronDown, Check, Search, Ban
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// --- UTILS ---
function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// --- CUSTOM ANIMATED COMPONENTS (Safe Mode) ---

const AnimatedButton = ({ children, onClick, disabled, className, variant = 'primary' }: any) => {
  const baseStyle = "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-black uppercase tracking-wider transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 px-4 shadow-sm";
  const variants: any = {
    primary: "bg-orange-500 hover:bg-orange-600 text-white border-t border-white/20 shadow-orange-500/20 shadow-lg",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50",
    outline: "border-2 border-border/50 bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground border-transparent",
    danger: "border border-red-500/30 text-red-500 hover:bg-red-500/10"
  };

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyle, variants[variant], className)}
    >
      {children}
    </motion.button>
  );
};

const CustomDropdown = ({ value, options, onChange, label }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (ref.current && !ref.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 items-center justify-between gap-2 rounded-full border border-border/50 bg-background/50 px-3 text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-accent transition-colors min-w-[80px]"
      >
        <span className="truncate">{label || value}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 text-popover-foreground shadow-xl backdrop-blur-md"
          >
            {options.map((opt: any) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 pl-2 pr-8 text-[10px] font-bold uppercase tracking-wider outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                  value === opt && "bg-accent/50 text-orange-500"
                )}
              >
                {opt}
                {value === opt && (
                  <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- CONFIG ---
const ROLE_STYLES = {
  Tank:    { color: "text-blue-500",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Shield },
  Damage:  { color: "text-red-500",     bg: "bg-red-500/10",     border: "border-red-500/20",     icon: Sword },
  Support: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: Heart },
};

// --- HERO ICONS MAP ---
// IMPORTANT: These files MUST be in `public/icons`
const HERO_IMAGES: Record<string, string> = {
  // TANKS
  "D.Va": "icons/000000038C19.webp",
  "Doomfist": "icons/000000038C1A.webp",
  "Hazard": "icons/000000044C5E.webp",
  "Junker Queen": "icons/000000038C1B.webp",
  "Mauga": "icons/00000003DC9C.webp",
  "Orisa": "icons/000000038C1C.webp",
  "Ramattra": "icons/000000038C1D.webp",
  "Reinhardt": "icons/000000038C1E.webp",
  "Roadhog": "icons/000000038C1F.webp",
  "Sigma": "icons/000000038C27.webp",
  "Winston": "icons/000000038C25.webp",
  "Wrecking Ball": "icons/000000038C26.webp",
  "Zarya": "icons/000000038C28.webp",

  // DAMAGE (Updated with your files)
  "Ashe": "icons/150px-Ashe_mini_portrait.png",
  "Bastion": "icons/150px-Bastion_mini_portrait.png",
  "Cassidy": "icons/150px-Cassidy_OW2_mini_portrait.png",
  "Echo": "icons/150px-Echo_mini_portrait.png",
  "Freja": "icons/150px-Freja_mini_portrait.png",
  "Genji": "icons/150px-Genji_OW2_mini_portrait.png",
  "Hanzo": "icons/150px-Hanzo_mini_portrait.png",
  "Junkrat": "icons/150px-Junkrat_OW2_mini_portrait.png",
  "Mei": "icons/150px-Mei_OW2_mini_portrait.png",
  "Pharah": "icons/150px-Pharah_OW2_mini_portrait.png",
  "Reaper": "icons/150px-Reaper_OW2_mini_portrait.png",
  "Sojourn": "icons/150px-Sojourn_mini_portrait.png",
  "Soldier: 76": "icons/150px-Soldier_OW2_mini_portrait.png",
  "Sombra": "icons/150px-Sombra_OW2_mini_portrait.png",
  "Symmetra": "icons/150px-Symmetra_OW2_mini_portrait.png",
  "Torbjörn": "icons/150px-Torbjorn_OW2_mini_portrait.png",
  "Tracer": "icons/150px-Tracer_OW2_mini_portrait.png",
  "Vendetta": "icons/Vendetta_2D_portrait.png",
  "Venture": "icons/150px-Venture_mini_portrait.png",
  "Widowmaker": "icons/150px-Widowmaker_OW2_mini_portrait.png",
};

const HERO_DATABASE = {
  Tank:    ["D.Va","Doomfist","Hazard","Junker Queen","Mauga","Orisa","Ramattra","Reinhardt","Roadhog","Sigma","Winston","Wrecking Ball","Zarya"],
  Damage:  ["Ashe","Bastion","Cassidy","Echo","Freja","Genji","Hanzo","Junkrat","Mei","Pharah","Reaper","Sojourn","Soldier: 76","Sombra","Symmetra","Torbjörn","Tracer","Vendetta","Venture","Widowmaker"],
  Support: ["Ana","Baptiste","Brigitte","Illari","Juno","Kiriko","Lifeweaver","Lúcio","Mercy","Moira","Wuyang","Zenyatta"],
} as const;

const ROLES = ["All", "Tank", "Damage", "Support"] as const;
type RoleType = typeof ROLES[number];
type RoleKey = keyof typeof HERO_DATABASE;

const FLAT_HERO_LIST = (Object.entries(HERO_DATABASE) as [RoleKey, readonly string[]][])
  .flatMap(([role, list]) => list.map((name) => ({ name, role })));

const PLAYERS_INDICES = [1, 2, 3, 4, 5] as const;
type PlayerID = typeof PLAYERS_INDICES[number];

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
      // Faster animation loop (40ms) and slightly longer duration (20 ticks) for smoothness
      if (ticks >= 20) { clearInterval(timer); setIsRolling(false); finalizeMission(draftPicks); }
    }, 40); 
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

  const toggleBan = (name: string) => {
    const isBanned = !!bannedHeroes[name];
    const currentCount = Object.values(bannedHeroes).filter(Boolean).length;
    if (!isBanned && currentCount >= 4) { alert("Ban limit reached (Max 4)."); return; }
    setBannedHeroes(prev => ({ ...prev, [name]: !prev[name] }));
  };

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
    <div className="min-h-screen bg-background transition-colors duration-300 font-sans text-sm selection:bg-orange-500/30">
      <div className="mx-auto max-w-6xl p-3 space-y-4">
      
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-3xl bg-card/50 p-4 border border-border/40 shadow-lg backdrop-blur-md">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-black italic tracking-tighter bg-gradient-to-br from-orange-400 to-amber-600 dark:from-orange-500 dark:to-yellow-500 bg-clip-text text-transparent uppercase">
            Overwatch 2 <span className="text-foreground/70 text-lg not-italic tracking-normal normal-case">/ Randomizer</span>
          </h1>
        </motion.div>
        <div className="flex flex-wrap items-center gap-3">
           <motion.button whileHover={{scale: 1.1}} whileTap={{scale: 0.9}} onClick={toggleTheme} className="h-10 w-10 rounded-full border border-border/50 flex items-center justify-center hover:bg-accent text-foreground transition-colors bg-background/50 backdrop-blur-sm">
              {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-slate-700" />}
           </motion.button>
           <div className="flex items-center gap-3 bg-background/80 border border-border/50 rounded-full p-1.5 px-4 shadow-sm">
             <CustomDropdown 
                value={`${playerCount} ${playerCount === 1 ? "Player" : "Players"}`}
                options={PLAYERS_INDICES.map(n => `${n} ${n === 1 ? "Player" : "Players"}`)}
                onChange={(val: string) => setPlayerCount(parseInt(val.split(" ")[0]))}
             />
             <div className="w-[1px] h-5 bg-border/50"></div>
             <div className="flex items-center gap-2 px-1">
               <label className="text-xs font-bold uppercase cursor-pointer text-muted-foreground hover:text-foreground">Challenge</label>
               <input type="checkbox" checked={challengeMode} onChange={(e) => setChallengeMode(e.target.checked)} className="accent-orange-500 h-4 w-4" />
             </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT PANEL */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-3xl border border-border/40 bg-card/30 backdrop-blur-md shadow-sm overflow-hidden">
            <div className="bg-muted/30 py-3 px-4 border-b border-border/40">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" /> Setup
              </h3>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-3">
                 {activePlayers.map(p => (
                   <motion.div initial={{opacity: 0, x: -10}} animate={{opacity: 1, x: 0}} key={p} className="flex items-center gap-2">
                      <div className="h-9 w-9 flex items-center justify-center rounded-xl bg-background/80 text-xs font-black shadow-sm border border-border/50 shrink-0 text-muted-foreground">{p}</div>
                      <input className="h-9 w-full rounded-xl border border-input bg-background/50 px-3 py-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 transition-all" value={playerNames[p]} onChange={e => setPlayerNames(prev => ({...prev, [p]: e.target.value}))} />
                      <CustomDropdown 
                        value={playerRoles[p]} 
                        options={ROLES} 
                        onChange={(v: RoleType) => setPlayerRoles(prev => ({...prev, [p]: v}))} 
                      />
                   </motion.div>
                 ))}
              </div>
              <div className="h-[1px] w-full bg-border/40"></div>
              <div className="space-y-3">
                 <div className="flex items-center justify-between"><label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bans ({poolStats.banned} / 4)</label></div>
                 
                 <div className="grid w-full grid-cols-4 h-10 bg-muted/40 p-1 rounded-xl border border-border/20">
                    {ROLES.map(r => (
                        <button 
                            key={r} 
                            onClick={() => setFilterRole(r)}
                            className={cn("text-[10px] font-bold uppercase rounded-lg transition-all", filterRole === r ? "bg-background text-foreground shadow-sm scale-105" : "text-muted-foreground hover:text-foreground")}
                        >
                            {r}
                        </button>
                    ))}
                 </div>

                 <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input placeholder="Search heroes..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex h-9 w-full rounded-xl border border-input bg-background/40 pl-9 pr-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50" />
                 </div>
                 
                 <div className="h-[200px] overflow-y-auto rounded-2xl border border-border/40 bg-background/20 p-2 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-2">
                       {filteredPool.map((h) => (
                         <motion.div whileHover={{scale: 1.02}} whileTap={{scale: 0.98}} key={h.name} className={cn("flex items-center gap-2 rounded-xl px-2 py-2 transition-all cursor-pointer select-none border border-transparent", bannedHeroes[h.name] ? "bg-red-500/10 border-red-500/20 opacity-70" : "hover:bg-background/80 hover:border-border/30 hover:shadow-sm")} onClick={() => toggleBan(h.name)}>
                            <div className="relative h-6 w-6 shrink-0 rounded-lg overflow-hidden bg-black/20">
                                {HERO_IMAGES[h.name] ? (
                                  <img 
                                    src={HERO_IMAGES[h.name]} 
                                    alt={h.name} 
                                    className="h-full w-full object-cover"
                                    onError={(e) => e.currentTarget.style.display = 'none'} 
                                  />
                                ) : <div className="h-full w-full bg-muted/50" />}
                            </div>
                            <span className={cn("text-[11px] flex-1 truncate font-bold", bannedHeroes[h.name] ? "text-red-500 line-through" : "text-foreground/80")}>{h.name}</span>
                            {bannedHeroes[h.name] && <Ban className="h-3.5 w-3.5 text-red-500" />}
                         </motion.div>
                       ))}
                    </div>
                 </div>
              </div>
              <AnimatedButton variant="outline" className="w-full h-9 text-[10px] border-dashed" onClick={factoryReset}><Trash2 className="mr-2 h-3.5 w-3.5" /> RESET DATA</AnimatedButton>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-8 space-y-4">
           <div className="flex flex-col sm:flex-row items-center gap-4 bg-card/30 backdrop-blur-md p-5 rounded-3xl border border-border/40 shadow-xl relative overflow-hidden">
             <AnimatedButton onClick={generateLoadout} disabled={isRolling} className="w-full sm:w-auto min-w-[240px] h-14 text-xl italic shadow-orange-500/20">
               <Dice5 className={cn("mr-3 h-6 w-6", isRolling && "animate-spin")} /> {isRolling ? "ROLLING..." : "RANDOMIZE"}
             </AnimatedButton>
             <div className="flex gap-3 w-full sm:w-auto z-10">
                 <AnimatedButton variant="secondary" onClick={() => setCurrentLoadout({1:null,2:null,3:null,4:null,5:null})} disabled={isRolling} className="flex-1 sm:flex-none h-14 px-6"><Repeat className="mr-2 h-4 w-4" /> Clear</AnimatedButton>
                 {playerCount > 1 && <AnimatedButton variant="ghost" onClick={markAllComplete} disabled={Object.values(currentLoadout).every(v => !v)} className="flex-1 sm:flex-none h-14 px-6 border border-green-500/20 text-green-600 hover:bg-green-500/10"><CheckCircle2 className="mr-2 h-4 w-4" /> All Done</AnimatedButton>}
             </div>
           </div>

           <div className={cn("grid gap-4", playerCount === 1 ? "grid-cols-1 max-w-lg mx-auto" : playerCount === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              {activePlayers.map(p => {
                const heroName = currentLoadout[p];
                const heroData = heroName ? FLAT_HERO_LIST.find(h => h.name === heroName) : null;
                const style = heroData ? ROLE_STYLES[heroData.role] : null;
                const isCompleted = heroName && completedMissions[p]?.[heroName];
                
                return (
                  <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} key={p} className={cn("relative overflow-hidden transition-all duration-500 group min-h-[220px] flex flex-col backdrop-blur-md shadow-lg rounded-3xl border-2", heroName ? "border-orange-500/30 bg-gradient-to-b from-card/90 to-background/60" : "border-dashed border-border/40 bg-muted/5 dark:bg-card/10", style ? style.border : "")}>
                      {style && <div className={cn("absolute inset-0 opacity-[0.03] pointer-events-none bg-gradient-to-br", style.bg.replace("/10", "/30"))} />}
                      <div className="p-4 flex justify-between items-start z-10 gap-2">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Player {p}</span>
                            <span className="text-sm font-bold text-foreground truncate">{playerNames[p]}</span>
                         </div>
                         <div className="inline-flex items-center rounded-lg border border-border/30 bg-background/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur-sm">{playerRoles[p]}</div>
                      </div>
                      
                      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
                         <AnimatePresence mode="wait">
                            {heroName ? (
                             <motion.div 
                               key={heroName} 
                               initial={{ opacity: 0, scale: 0.5, filter: "blur(10px)" }} 
                               animate={{ 
                                 opacity: 1, 
                                 scale: isRolling ? [1, 1.1, 1] : 1, 
                                 filter: isRolling ? "blur(4px)" : "blur(0px)",
                                 y: isRolling ? [0, -5, 5, 0] : 0
                               }} 
                               transition={{ duration: isRolling ? 0.1 : 0.4, type: "spring" }}
                               className="flex flex-col items-center gap-4 w-full"
                             >
                                <div className="relative group-hover:scale-105 transition-transform duration-300">
                                    {/* GLOW EFFECT BEHIND ICON */}
                                    <div className={cn("absolute inset-0 blur-2xl opacity-30 scale-150 rounded-full", style ? style.bg.replace("/10", "/50") : "bg-white/10")} />
                                    
                                    {/* HERO ICON - BIGGER NOW */}
                                    {HERO_IMAGES[heroName] ? (
                                      <img 
                                        src={HERO_IMAGES[heroName]} 
                                        alt={heroName} 
                                        className={cn("h-24 w-24 rounded-2xl object-cover shadow-2xl border-2 border-white/10 relative z-10", isRolling && "grayscale")}
                                        onError={(e) => e.currentTarget.style.display = 'none'} 
                                      />
                                    ) : (
                                       <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-muted to-muted/50 border-2 border-white/5 flex items-center justify-center relative z-10 shadow-inner">
                                          {style && <style.icon className={cn("h-10 w-10 opacity-20", style.color)} />}
                                       </div>
                                    )}
                                </div>
                                
                                <div className="text-center space-y-1">
                                  <h2 className="text-3xl font-black tracking-tighter uppercase italic drop-shadow-sm bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent px-1">{heroName}</h2>
                                  {style && <span className={cn("text-[9px] font-black uppercase tracking-[0.3em] px-3 py-1 rounded-full border bg-background/50 backdrop-blur-sm shadow-sm", style.color, style.border)}>{heroData?.role}</span>}
                                </div>
                             </motion.div>
                            ) : (
                             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-muted-foreground/20">
                                <Activity className="h-10 w-10 mb-2 opacity-50 animate-pulse" />
                                <span className="text-xs font-black uppercase tracking-[0.3em]">Ready</span>
                             </motion.div>
                            )}
                         </AnimatePresence>
                      </div>

                      {heroName && (
                        <div className="p-3 z-10">
                           <AnimatedButton 
                             variant={isCompleted ? "outline" : "secondary"} 
                             className={cn("w-full h-9 text-xs", !isCompleted && "bg-white/5 hover:bg-white/10 border-white/10")}
                             onClick={() => isCompleted ? undoMission(p, heroName) : completeMission(p)}
                           >
                             {isCompleted ? <><Undo2 className="mr-2 h-3.5 w-3.5"/> UNDO</> : <><CheckCircle2 className="mr-2 h-3.5 w-3.5"/> COMPLETE</>}
                           </AnimatedButton>
                        </div>
                      )}
                      
                      {isCompleted && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                          <motion.div initial={{scale: 0.5, opacity: 0}} animate={{scale: 1, opacity: 1}} className="bg-green-500 text-white px-5 py-2 rounded-full font-black text-sm uppercase tracking-widest shadow-2xl flex items-center gap-2">
                            <Check className="h-4 w-4" /> Complete
                          </motion.div>
                        </div>
                      )}
                  </motion.div>
                );
              })}
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* COMPLETED LIST */}
              <div className="rounded-3xl border border-border/40 bg-card/30 backdrop-blur-md shadow-md">
                 <div className="bg-muted/30 py-3 px-4 border-b border-border/40"><h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Completed</h3></div>
                 <div className="p-4">
                    <div className="h-[120px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {activePlayers.map(p => {
                            const completed = Object.keys(completedMissions[p] || {}); if(completed.length === 0) return null;
                            return ( <div key={p} className="flex flex-col gap-1.5"><span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider pl-1 opacity-70">{playerNames[p]}</span><div className="flex flex-wrap gap-2">{completed.map(c => <div key={c} className="inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors border-border/30 bg-background/50 hover:bg-red-500 hover:text-white hover:border-red-500 cursor-pointer shadow-sm" onClick={() => undoMission(p, c)}>{c}</div>)}</div></div> )
                        })}
                        {activePlayers.every(p => Object.keys(completedMissions[p] || {}).length === 0) && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-1"><AlertCircle className="h-5 w-5" /><span className="text-[10px] font-bold">No Data</span></div>}
                    </div>
                 </div>
              </div>
              
              {/* HISTORY LOG */}
              <div className="rounded-3xl border border-border/40 bg-card/30 backdrop-blur-md shadow-md">
                 <div className="bg-muted/30 py-3 px-4 border-b border-border/40"><h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><History className="h-4 w-4 text-blue-500" /> History</h3></div>
                 <div className="p-4">
                    <div className="h-[120px] overflow-y-auto custom-scrollbar">
                        <div className="space-y-1 font-mono text-[11px]">
                            {missionLog.length === 0 && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-1 mt-6"><span className="text-[10px] font-bold">Log Empty</span></div>}
                            {missionLog.map((h, i) => {
                                const role = FLAT_HERO_LIST.find(x => x.name === h)?.role;
                                const style = role ? ROLE_STYLES[role] : null;
                                return ( <div key={`${h}-${i}`} className="flex items-center justify-between py-1.5 border-b border-dashed border-border/30 last:border-0 hover:bg-muted/20 px-2 rounded-lg group"><span className="font-bold opacity-70 group-hover:opacity-100 transition-opacity"><span className="text-muted-foreground/40 mr-3">#{String(i + 1).padStart(2, '0')}</span>{h}</span>{style && <span className={cn("text-[9px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity", style.color)}>{role}</span>}</div> );
                            })}
                        </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
      </div>
    </div>
  );
}
