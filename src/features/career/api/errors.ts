export type CareerErrorKind = 'not-found' | 'rate-limited' | 'busy' | 'timeout' | 'network' | 'invalid' | 'server';

export class CareerError extends Error {
  readonly kind: CareerErrorKind;
  readonly status?: number;
  /** Seconds the source asked us to wait, when it said so. */
  readonly retryAfterSec?: number;

  constructor(kind: CareerErrorKind, message: string, options: { status?: number; retryAfterSec?: number } = {}) {
    super(message);
    this.name = 'CareerError';
    this.kind = kind;
    this.status = options.status;
    this.retryAfterSec = options.retryAfterSec;
  }
}

function retryFrom(headerValue: string | null, body: { retry_after?: unknown } | null, message: string): number | undefined {
  const fromHeader = headerValue ? Number(headerValue) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
  if (typeof body?.retry_after === 'number' && body.retry_after > 0) return body.retry_after;
  const fromMessage = /(\d+)\s*second/i.exec(message);
  return fromMessage ? Number(fromMessage[1]) : undefined;
}

/** OverFast errors are `{ error: "text" }`. A 404 adds retry_after, either beside that text or nested under `error`. */
export async function errorFromResponse(response: Response): Promise<CareerError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A proxy or gateway error page has no JSON body. The status code is enough.
  }
  const root = body && typeof body === 'object' ? (body as { error?: unknown; retry_after?: unknown }) : null;
  const outer = root?.error ?? null;
  const detail = outer && typeof outer === 'object' ? (outer as { error?: unknown; retry_after?: unknown }) : root;
  const message = typeof outer === 'string' ? outer : typeof detail?.error === 'string' ? detail.error : `Request failed with status ${response.status}`;
  const retryAfterSec = retryFrom(response.headers.get('retry-after'), detail, message);
  const options = { status: response.status, retryAfterSec };

  switch (response.status) {
    case 404:
      return new CareerError('not-found', message, options);
    case 422:
      return new CareerError('invalid', message, options);
    case 429:
      return new CareerError('rate-limited', message, options);
    case 503:
      return new CareerError('busy', message, options);
    case 504:
      return new CareerError('timeout', message, options);
    default:
      return new CareerError('server', message, options);
  }
}

export function describeError(error: CareerError): { title: string; body: string } {
  const wait = error.retryAfterSec ? ` Try again in about ${error.retryAfterSec} seconds.` : ' Try again shortly.';
  switch (error.kind) {
    case 'not-found':
      return { title: 'Player not found', body: 'Blizzard has no public career profile under this identifier. It may be misspelled, renamed or removed.' };
    case 'rate-limited':
      return { title: 'Too many requests', body: 'The data source asked this site to slow down.' + wait };
    case 'busy':
      return { title: 'Blizzard is limiting requests', body: 'The data source is being rate limited by Blizzard right now.' + wait };
    case 'timeout':
      return { title: 'Blizzard took too long to answer', body: 'The career page did not respond in time.' + wait };
    case 'network':
      return { title: 'Could not reach the data source', body: 'Check your connection. The OverFast API may also be temporarily down.' };
    case 'invalid':
      return { title: 'That identifier was rejected', body: 'The data source could not understand this player identifier.' };
    default:
      return { title: 'The data source had a problem', body: 'OverFast API returned an unexpected error.' + wait };
  }
}
