import { useState } from 'react';

export type ViewMode = 'list' | 'grid';

/** List / grid choice for a page, remembered in this browser. */
export function useViewMode(key: string) {
  const storageKey = `${key}:view`;
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(storageKey) === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  const change = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(storageKey, v);
    } catch {
      /* private mode: just don't remember it */
    }
  };
  return [view, change] as const;
}
