import { useEffect } from 'react';

/**
 * The site's name, as the header, the footer and the browser tab show it. Short, so a narrow tab shows all of it.
 * index.html repeats it for the moment before the app loads and for link previews, and a test keeps the two the same.
 */
export const SITE_NAME = 'OW';

/** A tab's text: what the page is first, since that's the part a narrow tab keeps, then the site. */
export const pageTitle = (page?: string | null) => (page ? `${page} · ${SITE_NAME}` : SITE_NAME);

/**
 * Names the browser tab while a page is open, and gives the plain name back when it closes. Null means the page goes by
 * the site's name alone. Undefined leaves the tab to something inside the page, such as a player's profile.
 */
export function usePageTitle(page: string | null | undefined) {
  useEffect(() => {
    if (page === undefined) return undefined;
    document.title = pageTitle(page);
    return () => {
      document.title = SITE_NAME;
    };
  }, [page]);
}
