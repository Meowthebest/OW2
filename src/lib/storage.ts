// localStorage can throw or be missing (private windows, blocked site data), so every
// access goes through these helpers and the app keeps working without persistence.

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    const target = store();
    if (!target) return false;
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

// Keys written by earlier versions of this site. They are deleted once on load so
// retired game-mode progress does not linger in visitors' browsers.
const RETIRED_KEYS = [
  'ow2_normal_v3',
  'ow2_nuzlocke_v1',
  'ow2_preferences_v1',
  'ow2_rank_challenges_v1',
  'ow2_completed_heroes',
  'ow2_completion_streak',
  'ow2_completion_streak_best',
  'ow2_disabled_heroes',
  'ow2_favorites',
  'ow2_lineup',
  'ow2_match_log',
  'ow2_names',
  'ow2_player_count',
  'ow2_progress',
  'ow2_roles',
  'ow2_theme',
  'ow2_unique_team',
];

export function purgeRetiredData() {
  RETIRED_KEYS.forEach(removeKey);
}
