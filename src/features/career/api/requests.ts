import type { GameMode, ModeFilter, PlatformFilter } from './types';

export type CareerRequest =
  | { endpoint: 'search'; name: string; limit: number }
  | { endpoint: 'summary'; playerId: string }
  | { endpoint: 'stats-summary'; playerId: string; mode: ModeFilter; platform: PlatformFilter }
  | { endpoint: 'career'; playerId: string; mode: GameMode; platform: PlatformFilter };

/** Cache identity. One entry per endpoint, player, game mode and platform. */
export function requestKey(request: CareerRequest): string {
  switch (request.endpoint) {
    case 'search':
      return `search|${request.name}|${request.limit}`;
    case 'summary':
      return `summary|${request.playerId}`;
    default:
      return `${request.endpoint}|${request.playerId}|${request.mode}|${request.platform}`;
  }
}

/** Upstream path. Player ids are held decoded ("abc|def") and encoded exactly once here. */
export function requestPath(request: CareerRequest): string {
  if (request.endpoint === 'search') {
    return `/players?name=${encodeURIComponent(request.name)}&limit=${request.limit}`;
  }
  const player = `/players/${encodeURIComponent(request.playerId)}`;
  if (request.endpoint === 'summary') return `${player}/summary`;

  const query = new URLSearchParams();
  if (request.mode !== 'all') query.set('gamemode', request.mode);
  if (request.platform !== 'all') query.set('platform', request.platform);
  const suffix = query.toString() ? `?${query}` : '';
  return request.endpoint === 'stats-summary' ? `${player}/stats/summary${suffix}` : `${player}/stats/career${suffix}`;
}

export function normalizePlayerId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}
