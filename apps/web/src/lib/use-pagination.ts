import { useState } from 'react';

/** Rows-per-page choices for tables (the API allows at most 100). */
export const PAGE_SIZE_OPTIONS = [2, 10, 20, 50, 100] as const;
const STORAGE_PREFIX = 'pageSize:';

function stored(key: string, fallback: number, options: readonly number[]): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_PREFIX + key));
    return options.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Page and page size for a paginated list. The chosen page size is remembered in this browser
 * (shared by every table unless a list passes its own `key`); changing it returns to page 1.
 */
export function usePagination({
  key = 'tables',
  defaultSize = 20,
  options = PAGE_SIZE_OPTIONS,
}: { key?: string; defaultSize?: number; options?: readonly number[] } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(() => stored(key, defaultSize, options));
  const setPageSize = (size: number) => {
    setSize(size);
    setPage(1);
    try {
      localStorage.setItem(STORAGE_PREFIX + key, String(size));
    } catch {
      /* private mode: just don't remember it */
    }
  };
  return { page, pageSize, setPage, setPageSize, pageSizeOptions: options };
}
