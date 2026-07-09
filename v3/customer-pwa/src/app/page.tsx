'use client';

import { useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

/**
 * Redirect non-hash deep-links to hash-based routing.
 *
 * The PWA uses hash-based routing (e.g. /#order-detail?orderId=123). If a
 * customer scans a QR or follows a link with a path-style URL (e.g.
 * /order-detail?order_id=123), redirect to the hash equivalent so the
 * AppShell router picks it up instead of hitting a 404.
 */
function useHashRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, search } = window.location;
    // Only redirect known sub-pages — don't touch the root or API routes.
    const knownPages = [
      'order-detail', 'guest-pay', 'orders', 'menu', 'rewards', 'cart', 'checkout',
      'wallet', 'profile', 'history', 'promotions', 'information',
      'my-rewards', 'settings', 'notifications', 'reservations', 'events',
      'checkin', 'referral', 'my-card', 'saved-addresses', 'account-details',
      'payment-methods', 'help-support', 'legal',
    ];
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return;
    const page = segments[0] ?? '';
    if (!page || !knownPages.includes(page)) return;

    // Build the hash URL. Only rename the specific params that the hash router
    // parses as int (orderId, selectedInfoId, selectedPromoId). Leave other
    // params as-is — the hash router stores them generically.
    const SNAKE_TO_CAMEL: Record<string, string> = {
      order_id: 'orderId',
      selected_info_id: 'selectedInfoId',
      selected_promo_id: 'selectedPromoId',
    };
    const params = new URLSearchParams(search);
    const renamed: Record<string, string> = {};
    params.forEach((value: string, key: string) => {
      const camelKey = SNAKE_TO_CAMEL[key] ?? key;
      renamed[camelKey] = value;
    });
    const paramStr = new URLSearchParams(renamed as Record<string, string>).toString();
    const newHash = paramStr ? `${page}?${paramStr}` : page;

    // Replace the URL so the hash router picks it up, without leaving a
    // stray history entry.
    window.location.replace(`/#${newHash}`);
  }, []);
}

export default function CustomerApp() {
  useHashRedirect();
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
