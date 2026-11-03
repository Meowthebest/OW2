const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const NO_VALUE = '—';

type Maybe = number | null | undefined;
const missing = (value: Maybe): value is null | undefined => value === null || value === undefined || Number.isNaN(value);

export function formatInt(value: Maybe) {
  return missing(value) ? NO_VALUE : integer.format(value);
}

export function formatDecimal(value: Maybe) {
  return missing(value) ? NO_VALUE : oneDecimal.format(value);
}

export function formatRatio(value: Maybe) {
  return missing(value) ? NO_VALUE : twoDecimals.format(value);
}

export function formatPercent(value: Maybe) {
  return missing(value) ? NO_VALUE : oneDecimal.format(value) + '%';
}

export function formatCompact(value: Maybe) {
  if (missing(value)) return NO_VALUE;
  return Math.abs(value) < 10000 ? integer.format(value) : compact.format(value);
}

/** Seconds to "1,648h 51m", "42m" or "35s". */
export function formatDuration(seconds: Maybe) {
  if (missing(seconds)) return NO_VALUE;
  if (seconds < 60) return integer.format(Math.round(seconds)) + 's';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return minutes + 'm';
  return minutes === 0 ? integer.format(hours) + 'h' : integer.format(hours) + 'h ' + minutes + 'm';
}

/** Drops the minutes past 100 hours, for tight columns. */
export function formatDurationShort(seconds: Maybe) {
  if (missing(seconds)) return NO_VALUE;
  return seconds >= 360000 ? integer.format(Math.floor(seconds / 3600)) + 'h' : formatDuration(seconds);
}

export function formatRelative(timestamp: number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return Math.max(1, Math.round(seconds / 60)) + ' min ago';
  if (seconds < 86400) return Math.round(seconds / 3600) + ' hr ago';
  const days = Math.round(seconds / 86400);
  return days === 1 ? '1 day ago' : days + ' days ago';
}

export function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}
