"use client";

import { useState, useEffect, useRef } from "react";

/**
 * useState persisted to localStorage — list pages keep their store selector
 * and filters when the user navigates to an edit page and back (round 35:
 * "after save it returns to the main selection" — selection state was lost
 * on every navigation).
 *
 * SSR-safe: starts with `initial`, then hydrates from localStorage on mount.
 * Writes through on every change.
 */
export function usePersistedState(
  key: string,
  initial: string,
): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(stored);
    } catch {
      // localStorage unavailable (private mode) — behave like plain useState
    } finally {
      hydrated.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (v: string) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      // ignore
    }
  };

  return [value, set];
}
