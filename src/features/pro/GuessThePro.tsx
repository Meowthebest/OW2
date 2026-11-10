import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CircleHelp, Copy, ExternalLink, Flag, RotateCcw, Search, Trophy, Users } from 'lucide-react';
import { Segmented, StateBlock } from '../../components/controls';
import { readJson, writeJson } from '../../lib/storage';
import {
  answerFor,
  CLUE_LABELS,
  checkProData,
  cluesFor,
  compareGuess,
  countryName,
  emptyStats,
  foldName,
  knownClues,
  localDay,
  MAX_GUESSES,
  puzzleNumber,
  recordResult,
  REGION_LABELS,
  ROLE_LABELS,
  shareText,
  specialtyLabel,
  teamInitials,
  untilNextDay,
  type ClueKey,
  type ClueResult,
  type ClueStatus,
  type ProData,
  type ProPlayer,
  type ProStats,
  type ProTeam,
} from './core';

const DATA_URL = `${import.meta.env.BASE_URL}data/esports/owcs-players.json`;
const STORE_KEY = 'ow2.guess-the-pro.v1';
const LIQUIPEDIA = 'https://liquipedia.net/overwatch/Main_Page';

interface Saved {
  days: Record<string, { answer: string; guesses: string[] }>;
  stats: ProStats;
}

const readSaved = (): Saved => {
  const saved = readJson<Partial<Saved>>(STORE_KEY);
  return { days: saved?.days ?? {}, stats: { ...emptyStats(), ...saved?.stats } };
};

type Load = { status: 'loading' | 'missing' | 'error' } | { status: 'ready'; data: ProData };

function useProData() {
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(async (response): Promise<Load> => {
        if (response.status === 404) return { status: 'missing' };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as ProData;
        return checkProData(data).length === 0 ? { status: 'ready', data } : { status: 'error' };
      })
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {
        if (live) setState({ status: 'error' });
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const STATUS_TEXT: Record<ClueStatus, string> = { match: 'Match', close: 'Close', miss: 'No match' };
const STATUS_MARK: Record<ClueStatus, string> = { match: '✓', close: '≈', miss: '✕' };
const REGION_ORDER = ['na', 'emea', 'kr', 'cn', 'jp', 'pac', 'other'] as const;

/** A team's logo, or its initials for a team with no logo of its own. Always beside its name, so it's never the only label. */
function TeamBadge({ team, size = 20 }: { team: ProTeam | undefined; size?: number }) {
  if (!team) return null;
  if (team.logo) return <img className="gp-logo" src={`${import.meta.env.BASE_URL}${team.logo}`} alt="" width={size} height={size} loading="lazy" decoding="async" />;
  return <span className="gp-logo gp-logo--initials" style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }} aria-hidden="true">{teamInitials(team.name)}</span>;
}

/** One clue of one guess. Its label shows on phones, where the columns wrap, and is read out everywhere. */
function Clue({ clue, team, order }: { clue: ClueResult; team?: ProTeam; order: number }) {
  return (
    <div className="gp-cell" data-status={clue.status} data-clue={clue.key} style={{ '--gp-i': order } as CSSProperties}>
      <span className="gp-cell__label">{CLUE_LABELS[clue.key]}</span>
      <span className="gp-cell__value">
        {team && <TeamBadge team={team} size={22} />}
        <span className="gp-cell__text">{clue.value}</span>
        {clue.hint === 'later' && <ArrowUp size={14} aria-hidden="true" className="gp-cell__hint" />}
        {clue.hint === 'earlier' && <ArrowDown size={14} aria-hidden="true" className="gp-cell__hint" />}
      </span>
      <span className="gp-cell__mark" aria-hidden="true">{STATUS_MARK[clue.status]}</span>
      <span className="sr-only">
        {STATUS_TEXT[clue.status]}
        {clue.hint ? `, today's pro joined ${clue.hint}` : ''}
      </span>
    </div>
  );
}

/**
 * The top row of the board: today's pro, filled in as you learn. It names the columns too.
 * Once the game is over it shows the answer itself.
 */
function TargetRow({ answer, guessed, teams, clues, revealed, won }: { answer: ProPlayer; guessed: ProPlayer[]; teams: Map<string, ProTeam>; clues: ClueKey[]; revealed: boolean; won: boolean }) {
  const known = knownClues(guessed, answer, teams, clues);
  const shown = revealed ? compareGuess(answer, answer, teams, clues) : null;
  return (
    <li className="gp-row gp-row--target" data-revealed={revealed || undefined} aria-label={revealed ? `Today's pro: ${answer.name}` : 'What you know about today\'s pro'}>
      <div className="gp-row__name gp-target__name">
        {revealed ? (
          <>
            <TeamBadge team={teams.get(answer.team)} size={30} />
            <span className="gp-row__player">{answer.name}</span>
          </>
        ) : (
          <>
            <span className="gp-target__mystery" aria-hidden="true"><span className="gp-target__q">?</span></span>
            <span className="gp-target__label">Today's pro</span>
          </>
        )}
      </div>
      {clues.map((key, index) => {
        const fact = known[index];
        const value = shown ? shown[index].value : fact.value;
        const status = shown ? (won ? 'match' : 'reveal') : fact.status;
        const team = key === 'team' && (shown || fact.status === 'match') ? teams.get(answer.team) : undefined;
        return (
          <div key={key} className="gp-cell gp-cell--target" data-status={status} data-clue={key}>
            <span className="gp-cell__label gp-cell__label--head">{CLUE_LABELS[key]}</span>
            <span className="gp-cell__value">
              {team && <TeamBadge team={team} size={22} />}
              <span className="gp-cell__text">{value ?? <><span className="gp-cell__unknown" aria-hidden="true">?</span><span className="sr-only">Not known yet</span></>}</span>
            </span>
            {status === 'close' && <span className="gp-cell__mark" aria-hidden="true">{STATUS_MARK.close}</span>}
          </div>
        );
      })}
    </li>
  );
}

function Board({ guesses, players, answer, teams, clues, revealed, won }: { guesses: string[]; players: Map<string, ProPlayer>; answer: ProPlayer; teams: Map<string, ProTeam>; clues: ClueKey[]; revealed: boolean; won: boolean }) {
  const guessed = guesses.map((id) => players.get(id)).filter((player): player is ProPlayer => Boolean(player));
  return (
    <ol className="gp-board" aria-label="Your guesses" data-clues={clues.length} style={{ '--gp-clues': clues.length } as CSSProperties}>
      <TargetRow answer={answer} guessed={guessed} teams={teams} clues={clues} revealed={revealed} won={won} />
      {[...guessed].reverse().map((guess, index) => (
        <li key={guess.id} className="gp-row gp-row--guess" data-correct={guess.id === answer.id || undefined}>
          <div className="gp-row__name">
            <span className="gp-row__number">{guessed.length - index}</span>
            <span className="gp-row__player">{guess.name}</span>
          </div>
          {compareGuess(guess, answer, teams, clues).map((clue, order) => <Clue key={clue.key} clue={clue} order={order} team={clue.key === 'team' ? teams.get(guess.team) : undefined} />)}
        </li>
      ))}
    </ol>
  );
}

/** Eight marks, one per guess: used, the winning one, or still to come. */
function Pips({ used, won }: { used: number; won: boolean }) {
  return (
    <span className="gp-pips" aria-hidden="true">
      {Array.from({ length: MAX_GUESSES }, (_, index) => (
        <span key={index} className="gp-pip" data-state={index < used ? (won && index === used - 1 ? 'won' : 'used') : 'left'} />
      ))}
    </span>
  );
}

function GuessInput({ players, teams, used, disabled, onGuess }: { players: ProPlayer[]; teams: Map<string, ProTeam>; used: Set<string>; disabled: boolean; onGuess: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const wanted = foldName(query);
    if (!wanted) return [];
    return players
      .filter((player) => !used.has(player.id))
      .map((player) => ({ player, at: foldName(player.name).indexOf(wanted) }))
      .filter((entry) => entry.at !== -1)
      .sort((a, b) => a.at - b.at || a.player.name.localeCompare(b.player.name))
      .slice(0, 8)
      .map((entry) => entry.player);
  }, [players, query, used]);

  const pick = (player: ProPlayer | undefined) => {
    if (!player) return;
    onGuess(player.id);
    setQuery('');
    setOpen(false);
    setActive(0);
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((value) => Math.min(value + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(matches[active] ?? matches[0]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && matches.length > 0;
  return (
    <div className="gp-input">
      <label className="sr-only" htmlFor={`${listId}-input`}>Guess a player</label>
      <Search size={18} aria-hidden="true" className="gp-input__icon" />
      <input
        ref={input}
        id={`${listId}-input`}
        className="gp-input__field"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        placeholder={disabled ? 'Game over' : 'Type a player name'}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" className="gp-input__list" hidden={!showList} aria-label="Matching players">
        {matches.map((player, index) => (
          <li
            key={player.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className="gp-option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(player)}
            onMouseEnter={() => setActive(index)}
          >
            <TeamBadge team={teams.get(player.team)} size={28} />
            <span className="gp-option__name">{player.name}</span>
            <span className="gp-option__team">{teams.get(player.team)?.name}</span>
          </li>
        ))}
      </ul>
      {open && query && matches.length === 0 && !disabled && <p className="gp-input__none" role="status">No player by that name in the list, or you've guessed them already.</p>}
    </div>
  );
}

function clockText(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function Stats({ stats, today }: { stats: ProStats; today: number | null }) {
  const most = Math.max(1, ...stats.spread);
  return (
    <section className="gp-stats" aria-label="Your daily results">
      <dl className="gp-stats__numbers">
        <div><dt>Played</dt><dd>{stats.played}</dd></div>
        <div><dt>Won</dt><dd>{stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%</dd></div>
        <div><dt>Streak</dt><dd>{stats.streak}</dd></div>
        <div><dt>Best streak</dt><dd>{stats.best}</dd></div>
      </dl>
      <p className="gp-stats__title">Wins by guesses</p>
      <ol className="gp-spread" aria-label="Wins by number of guesses">
        {stats.spread.map((count, index) => (
          <li key={index} data-today={today === index + 1 || undefined}>
            <span className="gp-spread__guesses">{index + 1}</span>
            <span className="gp-spread__track">
              <span className="gp-spread__bar" style={{ width: `${count === 0 ? 0 : Math.max(8, (count / most) * 100)}%` }} />
            </span>
            <span className="gp-spread__count">{count}</span>
          </li>
        ))}
      </ol>
      <p className="gp-muted">Saved in this browser only.</p>
    </section>
  );
}

function Result({ won, answer, teams, rows, day, practice, now, stats, onPractice }: { won: boolean; answer: ProPlayer; teams: Map<string, ProTeam>; rows: ClueResult[][]; day: string; practice: boolean; now: number; stats: ProStats; onPractice: () => void }) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  const text = shareText({ day, rows, won, practice });
  const team = teams.get(answer.team);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <section className="gp-result" data-won={won || undefined} aria-live="polite">
      <div className="gp-result__main">
        <header className="gp-result__head">
          {won ? <Trophy size={22} aria-hidden="true" /> : <Flag size={22} aria-hidden="true" />}
          <h2 className="gp-result__title">{won ? `Got it in ${rows.length}` : 'Out of guesses'}</h2>
        </header>
        <div className="gp-answer">
          <TeamBadge team={team} size={64} />
          <div className="gp-answer__text">
            <p className="gp-answer__lead">{practice ? 'The pro was' : "Today's pro is"}</p>
            <p className="gp-answer__name">
              {answer.page ? <a href={answer.page} target="_blank" rel="noreferrer">{answer.name} <ExternalLink size={14} aria-hidden="true" /></a> : answer.name}
            </p>
            <p className="gp-answer__facts">
              {[team?.name, team ? REGION_LABELS[team.region] : null, countryName(answer.nationality), answer.specialty ? `${ROLE_LABELS[answer.role]}, ${specialtyLabel(answer.specialty)}` : ROLE_LABELS[answer.role], answer.joined ? `joined ${answer.joined}` : null].filter(Boolean).join(' · ')}
            </p>
            {team?.page && <p className="gp-muted"><a href={team.page} target="_blank" rel="noreferrer">{team.name}'s roster on Liquipedia <ExternalLink size={11} aria-hidden="true" /></a></p>}
          </div>
        </div>
        <div className="gp-result__actions">
          <button type="button" className="gp-button gp-button--primary" onClick={copy}><Copy size={15} aria-hidden="true" /> {copied === 'yes' ? 'Copied' : 'Copy result'}</button>
          <button type="button" className="gp-button" onClick={onPractice}><RotateCcw size={15} aria-hidden="true" /> {practice ? 'Another practice pro' : 'Practice with a random pro'}</button>
        </div>
        {copied === 'failed' && <textarea className="gp-share" readOnly value={text} aria-label="Your result, to copy" rows={rows.length + 1} />}
        {!practice && <p className="gp-muted">The next pro arrives in {clockText(untilNextDay(now))}, at midnight where you are.</p>}
      </div>
      {!practice && <Stats stats={stats} today={won ? rows.length : null} />}
    </section>
  );
}

/** Every team in the game by region, so a player can see who they're choosing from. */
function TeamList({ teams, players }: { teams: ProTeam[]; players: ProPlayer[] }) {
  const counts = new Map<string, number>();
  for (const player of players) counts.set(player.team, (counts.get(player.team) ?? 0) + 1);
  const regions = REGION_ORDER.filter((region) => teams.some((team) => team.region === region));
  return (
    <div className="gp-teams">
      {regions.map((region) => (
        <section key={region} className="gp-teams__region" aria-label={REGION_LABELS[region]}>
          <h3 className="gp-teams__title">{REGION_LABELS[region]}</h3>
          <ul className="gp-teams__list">
            {teams.filter((team) => team.region === region).map((team) => (
              <li key={team.id} className="gp-team" title={`${team.name}, ${counts.get(team.id) ?? 0} players`}>
                <TeamBadge team={team} size={32} />
                <span className="gp-team__name">{team.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HowToPlay({ clues, players }: { clues: ClueKey[]; players: ProPlayer[] }) {
  const close = ['A nationality from the same part of the world'];
  if (clues.includes('specialty')) close.push('the same role with a different specialty');
  if (clues.includes('joined')) close.push('joined a year apart');
  const legend: { status: ClueStatus; text: string }[] = [
    { status: 'match', text: "The same as today's pro" },
    { status: 'close', text: close.length > 1 ? `${close.slice(0, -1).join(', ')}, or ${close[close.length - 1]}` : close[0] },
    { status: 'miss', text: 'Nothing in common on that clue' },
  ];
  return (
    <div className="gp-help">
      <p>Each guess adds a row showing what that player shares with today's pro. The top row keeps everything you've learned so far.</p>
      <ul className="gp-legend">
        {legend.map((item) => (
          <li key={item.status} data-status={item.status}>
            <span className="gp-legend__mark" aria-hidden="true">{STATUS_MARK[item.status]}</span>
            <span className="gp-legend__text"><strong>{STATUS_TEXT[item.status]}</strong><span className="sr-only">: </span> <span>{item.text}</span></span>
          </li>
        ))}
      </ul>
      {clues.includes('joined') && <p><strong>Joined</strong> is the year the player joined their current team. The arrow points to whether today's pro joined later or earlier.</p>}
      <p className="gp-help__notes">
        Everyone gets the same pro, and a new one arrives at midnight where you are. Practice games use a random pro and don't count toward your results.
        {players.some((player) => player.role === 'flex') && <> <strong>{ROLE_LABELS.flex}</strong> is the role Liquipedia gives a player who covers more than one.</>}
      </p>
    </div>
  );
}

export function GuessThePro() {
  const { state, retry } = useProData();
  const now = useNow(30000);
  const day = localDay(now);
  const [mode, setMode] = useState<'daily' | 'practice'>('daily');
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [practice, setPractice] = useState<{ answer: string; guesses: string[] } | null>(null);
  // A first visit opens the rules. After that they stay a click away.
  const [panel, setPanel] = useState<'help' | 'teams' | null>(() => (Object.keys(readSaved().days).length === 0 ? 'help' : null));
  const panelId = useId();

  useEffect(() => {
    document.title = 'Guess the Pro | OW2 Hero Selector';
  }, []);

  const data = state.status === 'ready' ? state.data : null;
  const players = useMemo(() => new Map((data?.players ?? []).map((player) => [player.id, player])), [data]);
  const teams = useMemo(() => new Map((data?.teams ?? []).map((team) => [team.id, team])), [data]);
  const clues = useMemo(() => (data ? cluesFor(data) : []), [data]);
  const dailyAnswer = useMemo(() => (data ? answerFor(day, data.players) : null), [data, day]);

  // Today's saved game counts only if it was for the same pro, so a changed list never mixes two games.
  const dailySaved = saved.days[day];
  const dailyGuesses = dailyAnswer && dailySaved?.answer === dailyAnswer.id ? dailySaved.guesses.filter((id) => players.has(id)) : [];

  const startPractice = () => {
    if (!data) return;
    const choices = data.players.filter((player) => player.id !== dailyAnswer?.id);
    const pick = choices[Math.floor(Math.random() * choices.length)];
    if (!pick) return;
    setPractice({ answer: pick.id, guesses: [] });
    setMode('practice');
  };

  if (!data || !dailyAnswer) {
    return (
      <div className="page gp-page">
        <PageTop />
        {state.status === 'loading' && <div className="skeleton skeleton--page" aria-hidden="true"><span /><span /><span /></div>}
        {state.status === 'missing' && <StateBlock icon={<Users size={24} />} title="No player list published yet">The game starts once the 2026 OWCS rosters have been imported from Liquipedia.</StateBlock>}
        {state.status === 'error' && <StateBlock tone="error" title="Couldn't load the player list" actions={<button type="button" className="btn-plain" onClick={retry}>Try again</button>}>Check your connection and try again.</StateBlock>}
      </div>
    );
  }

  const playingPractice = mode === 'practice' && practice !== null;
  const answer = playingPractice ? players.get(practice.answer) ?? dailyAnswer : dailyAnswer;
  const guesses = playingPractice ? practice.guesses : dailyGuesses;
  const won = guesses.includes(answer.id);
  const over = won || guesses.length >= MAX_GUESSES;
  const rows = guesses.map((id) => players.get(id)).filter((player): player is ProPlayer => Boolean(player)).map((guess) => compareGuess(guess, answer, teams, clues));

  const guess = (id: string) => {
    if (over || guesses.includes(id)) return;
    const next = [...guesses, id];
    if (playingPractice) {
      setPractice({ answer: answer.id, guesses: next });
      return;
    }
    const finished = id === answer.id || next.length >= MAX_GUESSES;
    setSaved((current) => {
      // Keep the last 60 days, which is plenty to restore a game and keeps storage small.
      const days = Object.fromEntries(Object.entries({ ...current.days, [day]: { answer: answer.id, guesses: next } }).sort(([a], [b]) => b.localeCompare(a)).slice(0, 60));
      const stats = finished ? recordResult(current.stats, day, id === answer.id, next.length) : current.stats;
      const value = { days, stats };
      writeJson(STORE_KEY, value);
      return value;
    });
  };

  const toggle = (which: 'help' | 'teams') => setPanel((current) => (current === which ? null : which));

  return (
    <div className="page gp-page">
      <PageTop
        meta={
          <Segmented
            label="Game"
            options={[{ value: 'daily', label: `Daily #${puzzleNumber(day)}` }, { value: 'practice', label: 'Practice' }]}
            value={playingPractice ? 'practice' : 'daily'}
            onChange={(value) => (value === 'practice' ? (practice ? setMode('practice') : startPractice()) : setMode('daily'))}
          />
        }
      />
      <div className="gp-tools">
        <button type="button" className="gp-chip" aria-expanded={panel === 'help'} aria-controls={`${panelId}-help`} onClick={() => toggle('help')}>
          <CircleHelp size={15} aria-hidden="true" /> How to play
        </button>
        <button type="button" className="gp-chip" aria-expanded={panel === 'teams'} aria-controls={`${panelId}-teams`} onClick={() => toggle('teams')}>
          <Users size={15} aria-hidden="true" /> Teams <span className="gp-chip__count">{data.teams.length}</span>
        </button>
      </div>
      <section id={`${panelId}-help`} className="gp-panel" hidden={panel !== 'help'} aria-label="How to play">
        {panel === 'help' && <HowToPlay clues={clues} players={data.players} />}
      </section>
      <section id={`${panelId}-teams`} className="gp-panel" hidden={panel !== 'teams'} aria-label="Teams in the game">
        {panel === 'teams' && (
          <>
            <p className="gp-muted">{data.players.length} players from {data.teams.length} teams in Stage 3 of the 2026 Overwatch Champions Series.</p>
            <TeamList teams={data.teams} players={data.players} />
          </>
        )}
      </section>

      <section className="gp-play" aria-label={playingPractice ? 'Practice game' : `Daily puzzle ${puzzleNumber(day)}`}>
        <div className="gp-play__bar">
          <GuessInput players={data.players} teams={teams} used={new Set(guesses)} disabled={over} onGuess={guess} />
          <div className="gp-progress">
            <Pips used={guesses.length} won={won} />
            <p className="gp-count" aria-live="polite">{over ? (won ? 'Solved' : 'No guesses left') : `Guess ${guesses.length + 1} of ${MAX_GUESSES}`}</p>
          </div>
        </div>
        {over && <Result won={won} answer={answer} teams={teams} rows={rows} day={day} practice={playingPractice} now={now} stats={saved.stats} onPractice={startPractice} />}
        <Board guesses={guesses} players={players} answer={answer} teams={teams} clues={clues} revealed={over} won={won} />
        {guesses.length === 0 && <p className="gp-hint">Pick any player to start. Each guess lights up what they share with today's pro.</p>}
      </section>
      <p className="gp-credit">
        Player data from <a href={LIQUIPEDIA} target="_blank" rel="noreferrer">Liquipedia</a>, under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a>
        {data.exportedAt ? `, as of ${new Date(data.exportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : ''}. Team logos belong to their teams and are shown only to identify them. A fan game, not affiliated with Blizzard Entertainment or the Overwatch Champions Series.
      </p>
    </div>
  );
}

function PageTop({ meta }: { meta?: ReactNode }) {
  return (
    <header className="gp-head">
      <div className="gp-head__text">
        <span className="eyebrow">Daily OWCS game</span>
        <h1 className="gp-head__title">Guess the Pro</h1>
        <p className="gp-head__intro">One OWCS pro a day. Find them in {MAX_GUESSES} guesses, using what each guess has in common with them.</p>
      </div>
      {meta && <div className="gp-head__meta">{meta}</div>}
    </header>
  );
}
