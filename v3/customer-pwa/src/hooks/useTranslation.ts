'use client';

import { useState, useEffect, useCallback } from 'react';
import { t as translate, subscribeI18n } from '@/lib/i18n';
import { useLocaleCtx } from '@/components/LocaleProviderWrapper';

export function useTranslation() {
  const { locale, setLocaleAction } = useLocaleCtx();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeI18n(() => setVersion(v => v + 1));
  }, []);

  const t = useCallback(
    (key: string, options?: Record<string, string | number>) => translate(key, options),
     
    [locale, version],
  );

  return { t, locale, setLocale: setLocaleAction } as const;
}
