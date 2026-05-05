'use client';

import { useCallback } from 'react';
import { t as translate } from '@/lib/i18n';

/**
 * React hook for translations.
 *
 * Usage:
 *   const { t } = useTranslation();
 *   <h1>{t('cart.title')}</h1>
 *   <p>{t('item_count', { count: 3 })}</p>
 *   <span>{t('hello_name', { name: user.name })}</span>
 */
export function useTranslation() {
  const t = useCallback(
    (key: string, options?: Record<string, string | number>) => translate(key, options),
    []
  );
  return { t };
}
