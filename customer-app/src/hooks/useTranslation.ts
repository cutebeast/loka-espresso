'use client';

import { useCallback } from 'react';
import { t as translate } from '@/lib/i18n';
import { useLocaleCtx } from '@/components/LocaleProviderWrapper';

export function useTranslation() {
  const { locale, setLocaleAction } = useLocaleCtx();

  const t = useCallback(
    (key: string, options?: Record<string, string | number>) => translate(key, options),
    [locale],
  );

  return { t, locale, setLocale: setLocaleAction } as const;
}
