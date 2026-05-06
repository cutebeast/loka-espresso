'use client';

import { useEffect } from 'react';
import { getLocale } from '@/stores/localeStore';

export function LangAttribute() {
  useEffect(() => {
    const locale = getLocale();
    if (locale && document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, []);
  return null;
}
