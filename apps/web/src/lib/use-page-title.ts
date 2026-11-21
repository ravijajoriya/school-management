import { useEffect } from 'react';

const SUFFIX = 'Rajasthan Public School';

/** Sets the browser tab title (and search-engine title) for the current page. */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SUFFIX}` : SUFFIX;
  }, [title]);
}
