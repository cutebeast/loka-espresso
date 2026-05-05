'use client';

import { useEffect } from 'react';
import { localeStore } from '@/stores/localeStore';

/**
 * Sets <html lang="..."> on mount based on the persisted locale store.
 * This runs once on app startup before any rendering.
 */
export function LangAttribute() {
  useEffect(() => {
    const locale = localeStore.getState().locale;
    if (locale && document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, []);
  return null;
}
