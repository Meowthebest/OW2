import { CareerError, errorFromResponse } from './errors';
import { requestPath, type CareerRequest } from './requests';

export interface ProviderResult<T = unknown> {
  data: T;
  /** When this copy was obtained from the upstream source. */
  fetchedAt: number;
  /** Best known age of the data itself: fetchedAt minus the upstream cache age, when that is visible. */
  snapshotAt: number;
  maxAgeSec: number | null;
  noStore: boolean;
  /** Which layer answered, for display and debugging. */
  layer: string;
}

export interface CareerProvider {
  readonly label: string;
  readonly viaWorker: boolean;
  get<T>(request: CareerRequest, options?: { force?: boolean }): Promise<ProviderResult<T>>;
}

const TIMEOUT_MS = 20000;

function parseCacheControl(header: string | null) {
  const maxAge = header ? /max-age=(\d+)/i.exec(header) : null;
  return { maxAgeSec: maxAge ? Number(maxAge[1]) : null, noStore: !!header && /no-store/i.test(header) };
}

export function createOverfastProvider(options: { baseUrl: string; fallbackUrl?: string; fetchImpl?: typeof fetch; now?: () => number }): CareerProvider {
  const { baseUrl, fallbackUrl } = options;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  const viaWorker = Boolean(fallbackUrl);

  async function request<T>(base: string, req: CareerRequest, force: boolean, isWorker: boolean): Promise<ProviderResult<T>> {
    const url = new URL(base + requestPath(req));
    if (force && isWorker) url.searchParams.set('refresh', '1');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { accept: 'application/json' },
        cache: force ? 'no-cache' : 'default',
        signal: controller.signal,
      });
    } catch (cause) {
      if ((cause as Error)?.name === 'AbortError') throw new CareerError('timeout', 'The request timed out.');
      throw new CareerError('network', 'The data source could not be reached.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw await errorFromResponse(response);

    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      throw new CareerError('server', 'The data source returned an unreadable response.', { status: response.status });
    }

    // Age and X-Cache-Status are only readable through the worker: OverFast does not expose them across origins.
    const workerFetchedAt = Number(response.headers.get('x-career-fetched-at'));
    const fetchedAt = Number.isFinite(workerFetchedAt) && workerFetchedAt > 0 ? workerFetchedAt : now();
    const upstreamAge = Number(response.headers.get('x-upstream-age') ?? response.headers.get('age'));
    const snapshotAt = Number.isFinite(upstreamAge) && upstreamAge > 0 ? fetchedAt - upstreamAge * 1000 : fetchedAt;
    const layer = response.headers.get('x-career-cache') ?? (isWorker ? 'worker' : 'overfast');

    return { data, fetchedAt, snapshotAt, layer, ...parseCacheControl(response.headers.get('cache-control')) };
  }

  return {
    label: viaWorker ? 'OverFast API via cache worker' : 'OverFast API',
    viaWorker,
    async get<T>(req: CareerRequest, { force = false } = {}) {
      try {
        return await request<T>(baseUrl, req, force, viaWorker);
      } catch (error) {
        // OverFast allows cross-origin calls, so a worker outage can fall back to going direct.
        if (fallbackUrl && error instanceof CareerError && error.kind === 'network') {
          return request<T>(fallbackUrl, req, force, false);
        }
        throw error;
      }
    },
  };
}
