import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dice5, Filter, Trash2, History, Repeat,
  CheckCircle2, Undo2, Trophy, Shield, Sword, Heart, 
  Activity, AlertCircle, Sun, Moon, Ban, Search, Check, ChevronDown, Sparkles
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
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyle, variants[variant], className)}
    >
      {children}
    </motion.button>
  );
};

const CustomDropdown = ({ value, options, onChange, label, align = "left" }: any) => {
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
    <div className="relative z-50" ref={ref}>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/50 px-3 text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-accent hover:text-accent-foreground transition-all min-w-[100px]"
      >
        <span className="truncate">{label || value}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={cn(
              "absolute top-full mt-1 w-48 overflow-hidden rounded-xl border border-border/50 bg-popover/95 p-1 text-popover-foreground shadow-2xl backdrop-blur-xl z-[100]",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            {options.map((opt: any) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 pl-3 pr-8 text-[10px] font-bold uppercase tracking-wider outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                  value === opt && "bg-orange-500/10 text-orange-500"
                )}
              >
                {opt}
                {value === opt && (
                  <span className="absolute right-3 flex h-3.5 w-3.5 items-center justify-center">
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
const HERO_IMAGES: Record<string, string> = {
  // --- TANKS ---
  "D.Va": "icons/000000038C19.webp",
  "Domina": "icons/Domina.png",
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

  // --- DAMAGE ---
  "Anran": "icons/Anran.png",
  "Ashe": "icons/150px-Ashe_mini_portrait.png",
  "Bastion": "icons/150px-Bastion_mini_portrait.png",
  "Cassidy": "icons/150px-Cassidy_OW2_mini_portrait.png",
  "Echo": "icons/150px-Echo_mini_portrait.png",
  "Emre": "icons/Emre.png",
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

  // --- SUPPORT ---
  "Ana": "icons/150px-Ana_OW2_mini_portrait.png",
  "Baptiste": "icons/150px-Baptiste_mini_portrait.png",
  "Brigitte": "icons/150px-Brigitte_OW2_mini_portrait.png",
  "Illari": "icons/150px-Illari_mini_portrait.png",
  "Jetpack Cat": "icons/JetpackCat.png",
  "Juno": "icons/150px-Juno_mini_portrait.png",
  "Kiriko": "icons/150px-Kiriko_OW2_mini_portrait.png",
  "Lifeweaver": "icons/150px-Lifeweaver_mini_portrait.png",
  "Lúcio": "icons/150px-Lucio_OW2_mini_portrait.png",
  "Mercy": "icons/150px-Mercy_OW2_mini_portrait.png",
  "Mizuki": "icons/Mizuki.png",
  "Moira": "icons/150px-Moira_OW2_mini_portrait.png",
  "Wuyang": "icons/150px-Wuyang_mini_portrait.png",
  "Zenyatta": "icons/150px-Zenyatta_OW2_mini_portrait.png",
};

const HERO_DATABASE = {
  Tank:    ["D.Va","Domina","Doomfist","Hazard","Junker Queen","Mauga","Orisa","Ramattra","Reinhardt","Roadhog","Sigma","Winston","Wrecking Ball","Zarya"],
  Damage:  ["Anran","Ashe","Bastion","Cassidy","Echo","Emre","Freja","Genji","Hanzo","Junkrat","Mei","Pharah","Reaper","Sojourn","Soldier: 76","Sombra","Symmetra","Torbjörn","Tracer","Vendetta","Venture","Widowmaker"],
  Support: ["Ana","Baptiste","Brigitte","Illari","Jetpack Cat","Juno","Kiriko","Lifeweaver","Lúcio","Mercy","Mizuki","Moira","Wuyang","Zenyatta"],
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
      <div className="mx-auto max-w-6xl p-4 space-y-6">
      
      {/* --- HEADER --- */}
      <div className="relative rounded-2xl bg-card border border-border/40 shadow-xl">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 -mb-16 -ml-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"></div>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between p-6 gap-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20 overflow-hidden border border-white/10">
              <img 
                src="icons/logo.jpg" 
                alt="Logo" 
                className="h-full w-full object-cover" 
                onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
              />
              <Dice5 className="h-6 w-6 text-white hidden" />
            </div>
            <div>
              <h1 className="text-2xl font-black italic tracking-tighter uppercase text-foreground leading-none">
                Overwatch 2 <span className="text-orange-500">/</span> Randomizer
              </h1>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1">
                Tactical Hero Selector
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
             <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl border border-border/40 backdrop-blur-sm">
                <CustomDropdown 
                  value={`${playerCount} ${playerCount === 1 ? "Player" : "Players"}`}
                  options={PLAYERS_INDICES.map(n => `${n} ${n === 1 ? "Player" : "Players"}`)}
                  onChange={(val: string) => setPlayerCount(parseInt(val.split(" ")[0]))}
                  align="right"
                />
                <div className="w-[1px] h-6 bg-border/40 mx-1"></div>
                <div className="flex items-center gap-2 px-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setChallengeMode(!challengeMode)}>
                   <div className={cn("w-4 h-4 rounded border flex items-center justify-center transition-colors", challengeMode ? "bg-orange-500 border-orange-500" : "border-muted-foreground")}>
                      {challengeMode && <Check className="h-3 w-3 text-white" />}
                   </div>
                   <span className="text-[10px] font-bold uppercase text-muted-foreground">Challenge</span>
                </div>
             </div>

             <motion.button 
                whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} 
                onClick={toggleTheme} 
                className="h-10 w-10 rounded-xl border border-border/40 flex items-center justify-center hover:bg-muted/50 text-foreground transition-colors bg-card/50 shadow-sm"
             >
                {theme === 'dark' ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
             </motion.button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT PANEL */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-md shadow-sm overflow-hidden flex flex-col h-full">
            <div className="bg-muted/30 py-3 px-5 border-b border-border/40">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <Filter className="h-3.5 w-3.5" /> Configuration
              </h3>
            </div>
            <div className="p-5 space-y-5 flex-1 overflow-visible">
              <div className="space-y-3 relative z-20">
                 {activePlayers.map(p => (
                   <motion.div initial={{opacity: 0, x: -10}} animate={{opacity: 1, x: 0}} key={p} className="flex items-center gap-3">
                      <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-muted/50 text-xs font-black shadow-sm border border-border/40 shrink-0 text-muted-foreground">{p}</div>
                      <div className="flex-1 space-y-1">
                        <input className="w-full bg-transparent text-sm font-bold focus:outline-none placeholder:text-muted-foreground/50" value={playerNames[p]} onChange={e => setPlayerNames(prev => ({...prev, [p]: e.target.value}))} />
                        <div className="h-[1px] w-full bg-border/40"></div>
                      </div>
                      <CustomDropdown 
                        value={playerRoles[p]} 
                        options={ROLES} 
                        onChange={(v: RoleType) => setPlayerRoles(prev => ({...prev, [p]: v}))} 
                        align="right"
                      />
                   </motion.div>
                 ))}
              </div>
              
              <div className="space-y-3 pt-2 relative z-10">
                 <div className="flex items-center justify-between"><label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ban Heroes ({poolStats.banned}/4)</label></div>
                 
                 <div className="grid w-full grid-cols-4 bg-muted/40 p-1 rounded-xl border border-border/20">
                    {ROLES.map(r => (
                        <button 
                            key={r} 
                            onClick={() => setFilterRole(r)}
                            className={cn("h-8 text-[9px] font-bold uppercase rounded-lg transition-all", filterRole === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                        >
                            {r}
                        </button>
                    ))}
                 </div>

                 <div className="relative group">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                    <input placeholder="Type to search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex h-9 w-full rounded-xl border border-border/40 bg-background/40 pl-9 pr-3 py-1 text-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500/50 focus-visible:border-orange-500/50" />
                 </div>
                 
                 <div className="h-[240px] overflow-y-auto rounded-2xl border border-border/40 bg-background/30 p-2 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-2">
                       {filteredPool.map((h) => (
                         <motion.div whileHover={{scale: 1.02}} whileTap={{scale: 0.98}} key={h.name} className={cn("flex items-center gap-2 rounded-xl px-2 py-2 transition-all cursor-pointer select-none border", bannedHeroes[h.name] ? "bg-red-500/5 border-red-500/20" : "border-transparent hover:bg-background/60 hover:border-border/40")} onClick={() => toggleBan(h.name)}>
                            <div className="relative h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-muted/50 border border-white/5">
                                {HERO_IMAGES[h.name] ? (
                                  <img 
                                    src={HERO_IMAGES[h.name]} 
                                    alt={h.name} 
                                    className={cn("h-full w-full object-cover transition-opacity", bannedHeroes[h.name] && "opacity-50 grayscale")}
                                    onError={(e) => e.currentTarget.style.display = 'none'} 
                                  />
                                ) : null}
                            </div>
                            <span className={cn("text-[11px] flex-1 truncate font-bold", bannedHeroes[h.name] ? "text-red-500 line-through decoration-2" : "text-foreground/80")}>{h.name}</span>
                         </motion.div>
                       ))}
                    </div>
                 </div>
              </div>
              <AnimatedButton variant="outline" className="w-full h-10 text-[10px] border-dashed border-border/40 hover:border-red-500/50 hover:text-red-500 hover:bg-red-500/5" onClick={factoryReset}><Trash2 className="mr-2 h-3.5 w-3.5" /> RESET ALL DATA</AnimatedButton>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-8 space-y-6">
           <div className="flex flex-col sm:flex-row items-center gap-4 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur-md p-6 rounded-3xl border border-border/40 shadow-xl relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
             
             <AnimatedButton onClick={generateLoadout} disabled={isRolling} className="w-full sm:w-auto min-w-[260px] h-16 text-xl italic shadow-2xl shadow-orange-500/20 relative z-10">
               <Dice5 className={cn("mr-3 h-6 w-6", isRolling && "animate-spin")} /> {isRolling ? "ROLLING..." : "RANDOMIZE HEROES"}
             </AnimatedButton>
             <div className="flex gap-3 w-full sm:w-auto z-10">
                 <AnimatedButton variant="secondary" onClick={() => setCurrentLoadout({1:null,2:null,3:null,4:null,5:null})} disabled={isRolling} className="flex-1 sm:flex-none h-16 px-8 rounded-xl bg-card border-border/40 hover:bg-accent"><Repeat className="mr-2 h-4 w-4" /> Clear</AnimatedButton>
                 {playerCount > 1 && <AnimatedButton variant="ghost" onClick={markAllComplete} disabled={Object.values(currentLoadout).every(v => !v)} className="flex-1 sm:flex-none h-16 px-8 rounded-xl border border-green-500/20 text-green-600 hover:bg-green-500/10 hover:border-green-500/30"><CheckCircle2 className="mr-2 h-4 w-4" /> Finish All</AnimatedButton>}
             </div>
           </div>

           <div className={cn("grid gap-4", playerCount === 1 ? "grid-cols-1 max-w-lg mx-auto" : playerCount === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              {activePlayers.map(p => {
                const heroName = currentLoadout[p];
                const heroData = heroName ? FLAT_HERO_LIST.find(h => h.name === heroName) : null;
                const style = heroData ? ROLE_STYLES[heroData.role] : null;
                const isCompleted = heroName && completedMissions[p]?.[heroName];
                
                return (
                  <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} key={p} className={cn("relative transition-all duration-500 group min-h-[280px] flex flex-col backdrop-blur-md shadow-lg rounded-[2rem] border-[1px]", heroName ? "border-white/10 dark:border-white/5 bg-gradient-to-b from-card/95 to-background/80" : "border-dashed border-border/30 bg-muted/5 dark:bg-card/5", style ? style.border : "")}>
                      <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none">
                          {style && <div className={cn("absolute inset-0 opacity-[0.03] bg-gradient-to-br", style.bg.replace("/10", "/30"))} />}
                      </div>
                      <div className="relative z-10 flex-1 flex flex-col">
                          <div className="p-5 flex justify-between items-start z-10 gap-2">
                             <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mb-0.5">Player {p}</span>
                                <span className="text-sm font-bold text-foreground truncate">{playerNames[p]}</span>
                             </div>
                             <div className="inline-flex items-center rounded-lg border border-border/30 bg-background/40 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground shadow-sm backdrop-blur-md">{playerRoles[p]}</div>
                          </div>
                          
                          <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10 -mt-2">
                             <AnimatePresence mode="wait">
                                {heroName ? (
                                 <motion.div 
                                   key={heroName} 
                                   initial={{ opacity: 0, scale: 0.8, filter: "blur(8px)" }} 
                                   animate={{ 
                                     opacity: 1, 
                                     scale: isRolling ? [1, 1.05, 1] : 1, 
                                     filter: isRolling ? "blur(4px)" : "blur(0px)",
                                   }} 
                                   transition={{ duration: isRolling ? 0.1 : 0.4, type: "spring" }}
                                   className="flex flex-col items-center gap-5 w-full"
                                 >
                                    <div className="relative group-hover:scale-105 transition-transform duration-500 ease-out">
                                        <div className={cn("absolute inset-0 blur-3xl opacity-20 scale-150 rounded-full", style ? style.bg.replace("/10", "/60") : "bg-white/10")} />
                                        {HERO_IMAGES[heroName] ? (
                                          <div className="relative rounded-3xl overflow-hidden border-[3px] border-white/10 shadow-2xl bg-black/20">
                                              <img 
                                                src={HERO_IMAGES[heroName]} 
                                                alt={heroName} 
                                                className={cn("h-28 w-28 object-cover transform transition-transform duration-700", isRolling && "grayscale blur-sm")}
                                                onError={(e) => e.currentTarget.style.display = 'none'} 
                                              />
                                          </div>
                                        ) : (
                                           <div className="h-28 w-28 rounded-3xl bg-gradient-to-br from-muted to-muted/50 border-[3px] border-white/5 flex items-center justify-center relative z-10 shadow-inner">
                                              {style && <style.icon className={cn("h-12 w-12 opacity-20", style.color)} />}
                                           </div>
                                        )}
                                    </div>
                                    <div className="text-center space-y-2">
                                      <h2 className="text-3xl font-black tracking-tighter uppercase italic drop-shadow-sm bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent px-1">{heroName}</h2>
                                      {style && <span className={cn("text-[9px] font-black uppercase tracking-[0.3em] px-3 py-1 rounded-full border bg-background/30 backdrop-blur-md shadow-sm", style.color, style.border)}>{heroData?.role}</span>}
                                    </div>
                                 </motion.div>
                                ) : (
                                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-muted-foreground/10 space-y-4">
                                    <div className="h-24 w-24 rounded-full border-4 border-dashed border-current flex items-center justify-center">
                                        <Activity className="h-8 w-8 animate-pulse" />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-[0.3em]">Ready to Roll</span>
                                 </motion.div>
                                )}
                             </AnimatePresence>
                          </div>

                          {heroName && (
                            <div className="p-4 z-10">
                               <motion.button 
                                 whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                 className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-xl text-xs font-black transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 w-full h-11 uppercase tracking-widest", isCompleted ? "border border-border/50 bg-transparent text-muted-foreground hover:bg-muted/20" : "bg-foreground text-background hover:bg-foreground/90 shadow-lg")} 
                                 onClick={() => isCompleted ? undoMission(p, heroName) : completeMission(p)}
                               >
                                 {isCompleted ? <><Undo2 className="mr-2 h-3.5 w-3.5"/> Undo Completion</> : <><CheckCircle2 className="mr-2 h-4 w-4"/> Mark Complete</>}
                               </motion.button>
                            </div>
                          )}
                          
                          {isCompleted && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-sm transition-all duration-500 rounded-[2rem] overflow-hidden">
                              <motion.div initial={{scale: 0.5, opacity: 0, y: 20}} animate={{scale: 1, opacity: 1, y: 0}} className="bg-green-500 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl flex items-center gap-3 border border-white/20">
                                <Check className="h-5 w-5" /> Completed
                              </motion.div>
                            </div>
                          )}
                      </div>
                  </motion.div>
                );
              })}
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* COMPLETED LIST */}
              <div className="rounded-[2rem] border border-border/40 bg-card/30 backdrop-blur-md shadow-md overflow-hidden">
                 <div className="bg-muted/30 py-4 px-6 border-b border-border/40"><h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground"><Trophy className="h-4 w-4 text-amber-500" /> Completed Missions</h3></div>
                 <div className="p-6">
                    <div className="h-[140px] overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                        {activePlayers.map(p => {
                            const completed = Object.keys(completedMissions[p] || {}); if(completed.length === 0) return null;
                            return ( <div key={p} className="flex flex-col gap-2"><span className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-wider pl-1">{playerNames[p]}</span><div className="flex flex-wrap gap-2">{completed.map(c => <div key={c} className="inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-border/40 bg-background/40 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50 cursor-pointer shadow-sm group" onClick={() => undoMission(p, c)}>{c} <Trash2 className="ml-1.5 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" /></div>)}</div></div> )
                        })}
                        {activePlayers.every(p => Object.keys(completedMissions[p] || {}).length === 0) && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/20 gap-2"><Trophy className="h-8 w-8" /><span className="text-[10px] font-bold uppercase tracking-widest">No Missions Completed</span></div>}
                    </div>
                 </div>
              </div>
              
              {/* HISTORY LOG */}
              <div className="rounded-[2rem] border border-border/40 bg-card/30 backdrop-blur-md shadow-md overflow-hidden">
                 <div className="bg-muted/30 py-4 px-6 border-b border-border/40"><h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground"><History className="h-4 w-4 text-blue-500" /> Recent History</h3></div>
                 <div className="p-6">
                    <div className="h-[140px] overflow-y-auto custom-scrollbar">
                        <div className="space-y-1 font-mono text-[11px]">
                            {missionLog.length === 0 && <div className="h-full flex flex-col items-center justify-center text-muted-foreground/20 gap-2"><History className="h-8 w-8" /><span className="text-[10px] font-bold uppercase tracking-widest">Log Empty</span></div>}
                            {missionLog.map((h, i) => {
                                const role = FLAT_HERO_LIST.find(x => x.name === h)?.role;
                                const style = role ? ROLE_STYLES[role] : null;
                                return ( <div key={`${h}-${i}`} className="flex items-center justify-between py-2 border-b border-dashed border-border/30 last:border-0 hover:bg-muted/20 px-3 rounded-lg group transition-colors"><span className="font-bold opacity-70 group-hover:opacity-100 transition-opacity"><span className="text-muted-foreground/30 mr-3">#{String(i + 1).padStart(2, '0')}</span>{h}</span>{style && <span className={cn("text-[8px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded bg-background/50", style.color)}>{role}</span>}</div> );
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
