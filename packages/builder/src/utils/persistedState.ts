/**
 * usePersistedState — useState backed by localStorage, for author-scoped UI
 * memory: active tabs, sort orders, view modes, disclosure toggles.
 *
 * The UX eval found the app persists five geometry keys but ZERO of the
 * choices authors actually re-make every session (workspace tab, settings
 * tab, library sort, debug tab…). One hook, one convention: keys are
 * `asaps_ui_<what>`, values JSON-encoded.
 */
import { useCallback, useState } from 'react';

export function usePersistedState<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* corrupt or unavailable — fall through to the default */
    }
    return initial;
  });

  const set = useCallback((next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* private mode etc. — session still works, just unpersisted */
    }
  }, [key]);

  return [value, set];
}
