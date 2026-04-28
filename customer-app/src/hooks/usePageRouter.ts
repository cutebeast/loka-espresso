'use client';

import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import type { PageId } from '@/lib/api';

const VALID_PAGES: PageId[] = [
  'home', 'menu', 'rewards', 'cart', 'orders', 'checkout', 'profile',
  'wallet', 'history', 'promotions', 'information', 'my-rewards',
  'account-details', 'payment-methods', 'saved-addresses', 'notifications', 'help-support', 'legal', 'settings', 'my-card', 'order-detail', 'referral',
];

export const SUB_PAGES: PageId[] = [
  'cart', 'checkout', 'order-detail', 'wallet', 'history',
  'promotions', 'information', 'my-rewards', 'account-details',
  'payment-methods', 'saved-addresses', 'notifications', 'help-support', 'legal', 'settings', 'my-card',
];

export function usePageRouter() {
  const setPage = useUIStore((s) => s.setPage);

  // Hash-based routing: listen for back/forward browser navigation
  useEffect(() => {
    const handler = () => {
      const raw = window.location.hash.replace('#', '');
      const pagePart = raw.split('?')[0];
      if (VALID_PAGES.includes(pagePart as PageId)) {
        const queryPart = raw.split('?')[1];
        const params: Record<string, unknown> = {};
        if (queryPart) {
          new URLSearchParams(queryPart).forEach((v, k) => {
            if (k === 'orderId' || k === 'selectedInfoId' || k === 'selectedPromoId') params[k] = parseInt(v, 10);
            else params[k] = v;
          });
        }
        setPage(pagePart as PageId, Object.keys(params).length > 0 ? params : undefined);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [setPage]);

  const handleNavClick = useCallback((id: PageId) => {
    if (id === useUIStore.getState().page) return;
    setPage(id);
  }, [setPage]);

  return { handleNavClick };
}
