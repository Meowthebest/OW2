import { useEffect, useRef, useState } from 'react';

/** Updates the address bar without firing a route change, so typing in a filter never loses focus. */
export function writeUrl(path: string, query: string) {
  const url = `${window.location.pathname}${window.location.search}${path}${query ? `?${query}` : ''}`;
  try {
    window.history.replaceState(null, '', url);
  } catch {
    // Browsers limit how often the URL can change. The filters still apply, and the next change writes it.
  }
}

/** Filter state that lives in the URL. Filters apply straight away, and the address follows a moment later. */
export function useUrlState<T>(path: string, query: string, routeKey: unknown, parse: (query: string) => T, serialize: (value: T) => string) {
  const [value, setValue] = useState(() => parse(query));
  const written = useRef(query);

  // The hash changed from outside: back, forward, a pasted link or a nav click.
  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    setValue(parse(query));
    // routeKey is a new object on every hash change, even when the query repeats.
  }, [routeKey]);

  useEffect(() => {
    const next = serialize(value);
    if (next === written.current) return undefined;
    const timer = window.setTimeout(() => {
      written.current = next;
      writeUrl(path, next);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [value]);

  return [value, setValue] as const;
}
